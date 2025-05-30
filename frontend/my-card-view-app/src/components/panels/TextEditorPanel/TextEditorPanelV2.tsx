// Чистая версия TextEditorPanel с нативной поддержкой чанков

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Panel } from '../Panel'
import MonacoEditor from '../../MonacoEditor'
import { useDocumentStore } from '../../../store/documentStore'
import { useClipboard } from '../../../hooks/usePanelSync'
import type { ChangeInfo } from '../../../types/chunks'

interface TextEditorPanelV2Props {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

export const TextEditorPanelV2: React.FC<TextEditorPanelV2Props> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [showTopicHint, setShowTopicHint] = useState<boolean>(false)
  const [editorTopic, setEditorTopic] = useState<string>('')
  const [showEditorSettings, setShowEditorSettings] = useState<boolean>(false)
  const [editorText, setEditorText] = useState<string>('') // Локальное состояние текста
  const [lastCursorPosition, setLastCursorPosition] = useState<number>(0) // Позиция курсора
  
  // Используем documentStore напрямую
  const { 
    document,
    loading,
    error,
    initializeDocument,
    updateText,
    updateChunkMetrics,
    queueMetricsUpdate,
  } = useDocumentStore()

  const { pasteFromClipboard } = useClipboard()

  // Получаем текст из documentStore или локального состояния
  const currentText = document?.text || editorText
  const chunksCount = document?.chunks.length || 0

  // Вспомогательная функция для поиска различий между текстами
  const findTextDifference = (oldText: string, newText: string): ChangeInfo => {
    // Простой алгоритм поиска различий
    let start = 0;
    let oldEnd = oldText.length;
    let newEnd = newText.length;

    // Находим начало различий
    while (start < Math.min(oldText.length, newText.length) && 
           oldText[start] === newText[start]) {
      start++;
    }

    // Находим конец различий (идем с конца)
    while (oldEnd > start && newEnd > start && 
           oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    // Извлекаем измененную часть
    const changedOldText = oldText.slice(start, oldEnd);
    const changedNewText = newText.slice(start, newEnd);

    return {
      start,
      end: oldEnd,
      oldText: changedOldText,
      newText: changedNewText
    };
  };

  // Функция для определения чанка по позиции курсора
  const findChunkAtPosition = (position: number) => {
    if (!document?.chunks) {
      console.log('❌ findChunkAtPosition: нет документа или чанков');
      return undefined;
    }
    
    console.log('🔍 findChunkAtPosition поиск:', {
      position,
      chunksCount: document.chunks.length,
      documentTextLength: document.text.length,
      availableChunks: document.chunks.map(c => ({
        id: c.id.slice(0, 8),
        start: c.start,
        end: c.end,
        contains: position >= c.start && position <= c.end,
        text: document.text.slice(c.start, c.end).substring(0, 30) + '...'
      }))
    });
    
    // Основной поиск по точной позиции
    let foundChunk = document.chunks.find(chunk => 
      position >= chunk.start && position <= chunk.end
    );
    
    // FALLBACK 1: Если не найден, ищем ближайший чанк
    if (!foundChunk) {
      console.log('⚠️ Точный чанк не найден, ищем ближайший...');
      
      // Ищем чанк, который заканчивается ближе всего к позиции
      let closestChunk = undefined;
      let minDistance = Infinity;
      
      for (const chunk of document.chunks) {
        const distanceToStart = Math.abs(position - chunk.start);
        const distanceToEnd = Math.abs(position - chunk.end);
        const minDist = Math.min(distanceToStart, distanceToEnd);
        
        if (minDist < minDistance) {
          minDistance = minDist;
          closestChunk = chunk;
        }
      }
      
      foundChunk = closestChunk;
      
      if (foundChunk) {
        console.log('🎯 Найден ближайший чанк:', {
          chunkId: foundChunk.id.slice(0, 8),
          distance: minDistance,
          chunkStart: foundChunk.start,
          chunkEnd: foundChunk.end,
          searchPosition: position
        });
      }
    }
    
    // FALLBACK 2: Если все еще не найден, берем последний чанк
    if (!foundChunk && document.chunks.length > 0) {
      foundChunk = document.chunks[document.chunks.length - 1];
      console.log('🔄 Используем последний чанк как fallback:', {
        chunkId: foundChunk.id.slice(0, 8),
        searchPosition: position,
        lastChunkEnd: foundChunk.end
      });
    }
    
    console.log('🎯 findChunkAtPosition результат:', {
      position,
      foundChunk: foundChunk ? {
        id: foundChunk.id.slice(0, 8),
        start: foundChunk.start,
        end: foundChunk.end,
        method: position >= foundChunk.start && position <= foundChunk.end ? 'exact' : 'fallback'
      } : undefined
    });
    
    return foundChunk;
  };

  // Функция для определения, нужно ли запускать ЛОКАЛЬНЫЙ анализ (signal_strength, complexity)
  const shouldTriggerLocalAnalysis = (newText: string, changeInfo: ChangeInfo): boolean => {
    const addedText = changeInfo.newText;
    const removedText = changeInfo.oldText;
    
    console.log('🏃‍♂️ shouldTriggerLocalAnalysis проверка:', {
      hasAddedText: !!addedText,
      hasRemovedText: !!removedText,
      addedLength: addedText?.length || 0,
      removedLength: removedText?.length || 0,
      addedText: JSON.stringify(addedText),
      removedText: JSON.stringify(removedText),
      changeStart: changeInfo.start,
      changeEnd: changeInfo.end
    });
    
    // Локальные метрики пересчитываем при ЛЮБОМ значимом изменении текста:
    
    // 1. УДАЛЕНИЕ (Backspace/Delete) - любое удаление символов
    const hasDeleted = removedText && removedText.length > 0;
    
    // 2. ДОБАВЛЕНИЕ СИМВОЛОВ - буквы, цифры, знаки препинания
    const hasAddedMeaningfulText = addedText && /[a-zA-Zа-яёА-ЯЁ0-9.,!?;:\-_()[\]{}'"«»—–…]/.test(addedText);
    
    // 3. ENTER - создание новых строк
    const hasAddedNewlines = addedText && /[\n\r]/.test(addedText);
    
    // 4. ПРОБЕЛЫ (если больше одного)
    const hasAddedMultipleSpaces = addedText && addedText.length > 1 && /\s/.test(addedText);
    
    // 5. ДЛИННЫЕ ИЗМЕНЕНИЯ (вставка/удаление больших блоков)
    const hasLargeChange = 
      (addedText && addedText.length > 2) || 
      (removedText && removedText.length > 2);
    
    const significantChange = 
      hasDeleted ||
      hasAddedMeaningfulText ||
      hasAddedNewlines ||
      hasAddedMultipleSpaces ||
      hasLargeChange;
    
    console.log('🏃‍♂️ shouldTriggerLocalAnalysis результат:', {
      significantChange: !!significantChange,
      reasons: {
        hasDeleted,
        hasAddedMeaningfulText,
        hasAddedNewlines,
        hasAddedMultipleSpaces,
        hasLargeChange
      },
      finalDecision: significantChange ? 'ЗАПУСКАЕМ локальный анализ' : 'ПРОПУСКАЕМ локальный анализ'
    });
    
    return !!significantChange;
  };

  // Функция для определения, нужно ли запускать СЕМАНТИЧЕСКИЙ анализ (semantic_function)
  const shouldTriggerSemanticAnalysis = (newText: string, changeInfo: ChangeInfo): boolean => {
    const addedText = changeInfo.newText;
    
    console.log('🧠 shouldTriggerSemanticAnalysis проверка:', {
      hasAddedText: !!addedText,
      addedText: JSON.stringify(addedText),
      addedTextLength: addedText?.length || 0,
      changeInfo: {
        start: changeInfo.start,
        end: changeInfo.end,
        oldText: JSON.stringify(changeInfo.oldText),
        newText: JSON.stringify(changeInfo.newText)
      }
    });
    
    // Проверяем, что добавлен текст (не удаление)
    if (!addedText) {
      console.log('❌ shouldTriggerSemanticAnalysis: нет добавленного текста');
      return false;
    }
    
    // Семантический анализ запускаем только при завершении мысли/предложения
    const triggerChars = [' ', '.', '!', '?', ',', ';', ':', '\n', '\r\n'];
    const hasTriggerChar = triggerChars.some(char => addedText.includes(char));
    
    console.log('🧠 shouldTriggerSemanticAnalysis результат:', {
      triggerChars,
      addedText: JSON.stringify(addedText),
      hasTriggerChar,
      matchedChars: triggerChars.filter(char => addedText.includes(char))
    });
    
    return hasTriggerChar;
  };

  const handleTextChange = (newText: string, changeInfo?: ChangeInfo, cursorPosition?: number) => {
    console.log('⌨️ Мгновенный ввод текста в Monaco:', { 
      length: newText.length, 
      cursorPosition: cursorPosition || 0,
      preview: newText.substring(0, 30) + '...' 
    });
    
    // Мгновенно обновляем локальное состояние для отзывчивости UI
    setEditorText(newText);
    
    // Сохраняем позицию курсора
    if (cursorPosition !== undefined) {
      setLastCursorPosition(cursorPosition);
    }
    
    // Получаем актуальное состояние store напрямую
    const storeState = useDocumentStore.getState();
    const actualDocument = storeState.document;
    
    if (!actualDocument) {
      // Нет документа - нужны текст И тема для создания
      if (newText.trim() && editorTopic.trim()) {
        console.log('🆕 Мгновенная инициализация нового документа');
        initializeDocument(newText, editorTopic);
      } else {
        console.log('⏭️ Пропускаем создание: недостаточно данных для нового документа');
      }
      return;
    }

    // Есть документ - обновляем мгновенно
    if (newText.trim()) {
      console.log('🔄 Мгновенное обновление существующего документа');
      
      // Создаем точный ChangeInfo с поиском различий
      const oldText = actualDocument.text;
      const textChangeInfo = findTextDifference(oldText, newText);
      
      console.log('📝 ChangeInfo создан:', {
        start: textChangeInfo.start,
        end: textChangeInfo.end,
        oldTextLength: textChangeInfo.oldText.length,
        newTextLength: textChangeInfo.newText.length,
        cursorPosition: cursorPosition || 0,
        oldText: JSON.stringify(textChangeInfo.oldText.substring(0, 50) + (textChangeInfo.oldText.length > 50 ? '...' : '')),
        newText: JSON.stringify(textChangeInfo.newText.substring(0, 50) + (textChangeInfo.newText.length > 50 ? '...' : ''))
      });
      
      // Мгновенно обновляем документ
      updateText(newText, textChangeInfo);
      
      // Проверяем триггеры для ЛОКАЛЬНОГО и СЕМАНТИЧЕСКОГО анализа НЕЗАВИСИМО
      console.log('🔍 ПРОВЕРКА триггеров анализа:', {
        willCheckLocal: true,
        willCheckSemantic: true,
        textChangeInfo: {
          start: textChangeInfo.start,
          end: textChangeInfo.end,
          oldText: textChangeInfo.oldText,
          newText: textChangeInfo.newText
        }
      });
      
      const shouldTriggerLocal = shouldTriggerLocalAnalysis(newText, textChangeInfo);
      const shouldTriggerSemantic = shouldTriggerSemanticAnalysis(newText, textChangeInfo);
      
      console.log('🎯 РЕЗУЛЬТАТЫ проверки триггеров:', {
        shouldTriggerLocal,
        shouldTriggerSemantic,
        textChangeInfo,
        newText: newText.length + ' символов'
      });
      
      // Находим чанк для анализа (только если нужен хотя бы один из анализов)
      if (shouldTriggerLocal || shouldTriggerSemantic) {
        console.log('✅ ХОТЯ БЫ ОДИН ТРИГГЕР СРАБОТАЛ - ищем чанк');
        
        // Используем позицию курсора для более точного определения чанка
        const searchPosition = cursorPosition !== undefined ? cursorPosition : textChangeInfo.start;
        console.log('🔍 ПОИСК чанка по позиции:', {
          cursorPosition,
          textChangeInfoStart: textChangeInfo.start,
          selectedSearchPosition: searchPosition
        });
        
        const editedChunk = findChunkAtPosition(searchPosition);
        
        if (editedChunk) {
          console.log('🎯 ЧАНК НАЙДЕН - запускаем анализы:', {
            chunkId: editedChunk.id.slice(0, 8),
            searchPosition,
            cursorPosition,
            changeStart: textChangeInfo.start,
            trigger: textChangeInfo.newText,
            willRunLocal: shouldTriggerLocal,
            willRunSemantic: shouldTriggerSemantic
          });
          
          // НЕЗАВИСИМЫЕ ВЫЗОВЫ АНАЛИЗОВ
          
          if (shouldTriggerLocal) {
            console.log('🏃‍♂️ ЛОКАЛЬНЫЙ АНАЛИЗ - вызываем queueMetricsUpdate...');
            queueMetricsUpdate(editedChunk.id, 'local');
            console.log('✅ queueMetricsUpdate LOCAL ВЫЗВАНА для чанка:', editedChunk.id.slice(0, 8));
          } else {
            console.log('❌ ЛОКАЛЬНЫЙ АНАЛИЗ ПРОПУЩЕН - триггер не сработал');
          }
          
          if (shouldTriggerSemantic) {
            console.log('🧠 СЕМАНТИЧЕСКИЙ АНАЛИЗ - вызываем queueMetricsUpdate...');
            queueMetricsUpdate(editedChunk.id, 'contextual');
            console.log('✅ queueMetricsUpdate CONTEXTUAL ВЫЗВАНА для чанка:', editedChunk.id.slice(0, 8));
          } else {
            console.log('❌ СЕМАНТИЧЕСКИЙ АНАЛИЗ ПРОПУЩЕН - триггер не сработал');
          }
          
        } else {
          console.log('❌ ЧАНК НЕ НАЙДЕН:', {
            searchPosition,
            cursorPosition,
            changeStart: textChangeInfo.start,
            availableChunks: actualDocument.chunks.map(c => ({ id: c.id.slice(0, 8), start: c.start, end: c.end }))
          });
        }
      } else {
        console.log('❌ НИ ОДИН ТРИГГЕР НЕ СРАБОТАЛ - анализ НЕ запускается');
      }
    } else {
      console.log('⏭️ Пропускаем обновление: пустой текст');
    }
  };

  const handleAnalyze = useCallback(async () => {
    const textToAnalyze = currentText.trim()
    
    console.log('📊 СОСТОЯНИЕ ДО initializeDocument:', {
      document_before: document,
      editorText_before: editorText,
      currentText_before: currentText,
      document_exists_before: !!document
    })
    
    if (!textToAnalyze || !editorTopic.trim()) {
      if (textToAnalyze && !editorTopic.trim()) {
        setShowTopicHint(true)
        setTimeout(() => setShowTopicHint(false), 3000)
      }
      return
    }
    
    try {
      console.log('🔄 ВЫЗЫВАЕМ initializeDocument с параметрами:', {
        text: textToAnalyze,
        topic: editorTopic
      })
      await initializeDocument(textToAnalyze, editorTopic)
      console.log('✅ initializeDocument завершен успешно')

      // Добавляем диагностику ПОСЛЕ создания документа
      console.log('📊 СОСТОЯНИЕ ПОСЛЕ initializeDocument:', {
        document_after: document,
        document_exists_after: !!document,
        chunks_count_after: document?.chunks.length || 0,
        // Запрашиваем свежее состояние из store
        store_state: useDocumentStore.getState()
      })
      
    } catch (error) {
      console.error('❌ Ошибка в initializeDocument:', error)
    }
  }, [currentText, editorTopic, initializeDocument])

  const handleFileLoad = useCallback(async (file: File) => {
    setFileError(null)
    
    if (!file.type.match('text.*') && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      setFileError('Пожалуйста, загрузите текстовый файл')
      return
    }
    
    if (file.size > 1024 * 1024) {
      setFileError('Размер файла не должен превышать 1MB')
      return
    }

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsText(file)
      })
      
      if (text) {
        console.log('📁 Загрузка файла - создание нового документа')
        setEditorText(text) // Обновляем локальное состояние
        
        // Для загрузки файла всегда требуется тема
        if (editorTopic.trim()) {
          console.log('🆕 Инициализация документа из файла')
          initializeDocument(text, editorTopic)
        } else {
          console.log('⚠️ Текст загружен, но нужна тема для анализа')
          setShowTopicHint(true)
          setTimeout(() => setShowTopicHint(false), 3000)
        }
      }
    } catch (error) {
      setFileError('Ошибка при чтении файла')
    }
  }, [editorTopic, initializeDocument])

  const handlePaste = useCallback(async () => {
    const text = await pasteFromClipboard()
    if (text) {
      console.log('📋 Вставка из клипборда')
      setEditorText(text) // Обновляем локальное состояние  
      
      // Для вставки из клипборда тоже требуется тема если документа нет
      const storeState = useDocumentStore.getState()
      const actualDocument = storeState.document
      
      if (!actualDocument) {
        if (editorTopic.trim()) {
          console.log('🆕 Инициализация документа из клипборда')
          initializeDocument(text, editorTopic)
        } else {
          console.log('⚠️ Текст вставлен, но нужна тема для анализа')
          setShowTopicHint(true)
          setTimeout(() => setShowTopicHint(false), 3000)
        }
      } else {
        // Если документ уже есть, используем обычное обновление с классификацией
        console.log('🔄 Обновление документа через вставку')
        handleTextChange(text, undefined, undefined) // Вставка не имеет позиции курсора
      }
    }
  }, [pasteFromClipboard, editorTopic, initializeDocument, handleTextChange])

  const headerControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            fileInputRef.current?.click()
          }}
          disabled={loading}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={e => !loading && ((e.target as HTMLButtonElement).style.backgroundColor = '#dbeafe')}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#eff6ff'}
        >
          📁 Загрузить файл
        </button>
        <button
          onClick={handlePaste}
          disabled={loading}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#f0fdf4',
            color: '#15803d',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={e => !loading && ((e.target as HTMLButtonElement).style.backgroundColor = '#dcfce7')}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#f0fdf4'}
        >
          📋 Вставить
        </button>
      </div>
      
      {/* Настройки отладки */}
      {showEditorSettings && (
        <div style={{
          padding: '8px',
          backgroundColor: '#f8fafc',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <button
            onClick={() => {
              try {
                console.log('🔬 БЫСТРАЯ ДИАГНОСТИКА:')
                
                // Безопасная проверка currentText
                if (!currentText) {
                  console.log('📝 Текст: пуст или не определен')
                  console.log('📏 Длина: 0')
                  return
                }
                
                // Безопасное логирование текста
                try {
                  console.log('📝 Текст:', typeof currentText === 'string' ? JSON.stringify(currentText.substring(0, 100)) : 'Не строка')
                } catch (err) {
                  console.log('📝 Текст: [Ошибка при сериализации]')
                }
                
                console.log('📏 Длина:', currentText.length)
                
                // Безопасная итерация по символам
                const maxChars = Math.min(currentText.length, 50)
                for (let i = 0; i < maxChars; i++) {
                  try {
                    const char = currentText[i]
                    if (char !== undefined && char !== null) {
                      const code = char.charCodeAt(0)
                      const name = code === 10 ? 'LF' : code === 13 ? 'CR' : code === 32 ? 'SPACE' : char
                      console.log(`  [${i}]: "${char}" → ${code} (${name})`)
                    } else {
                      console.log(`  [${i}]: undefined или null символ`)
                    }
                  } catch (charErr) {
                    console.log(`  [${i}]: ошибка при обработке символа`)
                  }
                }
                
                if (currentText.length > 50) {
                  console.log(`  ... и еще ${currentText.length - 50} символов`)
                }
              } catch (error) {
                console.log('❌ Ошибка в диагностике:', error)
              }
            }}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fbbf24',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            🔬 Диагностика символов в консоль
          </button>
        </div>
      )}
      
      <button
        onClick={handleAnalyze}
        disabled={loading || !currentText.trim() || !editorTopic.trim()}
        style={{
          padding: '8px 16px',
          backgroundColor: '#7c3aed',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          width: '100%',
          opacity: (loading || !currentText.trim() || !editorTopic.trim()) ? 0.5 : 1,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={e => {
          const disabled = loading || !currentText.trim() || !editorTopic.trim()
          if (!disabled) (e.target as HTMLButtonElement).style.backgroundColor = '#6d28d9'
        }}
        onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#7c3aed'}
      >
        {loading ? 'Анализ...' : '▶️ Анализировать текст'}
      </button>
    </div>
  )

  const headerButtons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div
        style={{
          padding: '2px 6px',
          fontSize: '10px',
          backgroundColor: '#dcfce7',
          color: '#16a34a',
          borderRadius: '4px',
          fontWeight: '600'
        }}
        title="Система чанков V2"
      >
        V2
      </div>
      <button
        onClick={() => setShowEditorSettings(!showEditorSettings)}
        style={{
          padding: '4px',
          backgroundColor: showEditorSettings ? '#e0e7ff' : 'transparent',
          color: showEditorSettings ? '#4338ca' : '#666',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          try {
            if (!showEditorSettings && e.currentTarget) {
              e.currentTarget.style.backgroundColor = '#f5f5f5'
            }
          } catch (error) {
            // Игнорируем ошибки при изменении стилей
          }
        }}
        onMouseLeave={(e) => {
          try {
            if (!showEditorSettings && e.currentTarget) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          } catch (error) {
            // Игнорируем ошибки при изменении стилей
          }
        }}
        title="Настройки"
      >
        ⚙️
      </button>
    </div>
  )

  return (
    <Panel
      title={`Текстовый редактор (${chunksCount} чанков)`}
      icon={icon}
      isExpanded={isExpanded}
      onToggleExpanded={onToggleExpanded}
      headerControls={headerControls}
      headerButtons={headerButtons}
      showSettings={showEditorSettings}
      onToggleSettings={() => setShowEditorSettings(!showEditorSettings)}
    >
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '16px'
      }}>
        <div style={{ 
          flexShrink: 0,
          marginBottom: '16px',
          position: 'relative'
        }}>
          <label style={{ 
            display: 'block', 
            fontSize: '14px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Тема
          </label>
          <input
            type="text"
            value={editorTopic}
            onChange={(e) => {
              setEditorTopic(e.target.value)
              if (showTopicHint) setShowTopicHint(false)
            }}
            disabled={loading}
            placeholder="Введите тему документа..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: showTopicHint ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
              backgroundColor: loading ? '#f9fafb' : 'white'
            }}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = showTopicHint ? '#ef4444' : '#d1d5db'}
          />
          
          {showTopicHint && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              right: '0',
              marginTop: '4px',
              padding: '8px 12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              animation: 'fadeInShake 0.5s ease-out',
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)'
            }}>
              <span>⚠️</span>
              <span>Пожалуйста, введите тему документа для анализа</span>
            </div>
          )}
        </div>

        {/* Monaco Editor с системой чанков */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minHeight: '200px',
          position: 'relative'
        }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MonacoEditor
              value={currentText}
              onChange={handleTextChange}
            />
          </div>
          
          {/* Информация о системе чанков */}
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            padding: '4px 8px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#16a34a',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span>🧩</span>
            <span>{chunksCount} чанков</span>
            <span>•</span>
            <span>V{document?.version || 0}</span>
          </div>
        </div>

        {/* Ошибки и уведомления */}
        {fileError && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '6px', 
            color: '#dc2626',
            fontSize: '14px',
            flexShrink: 0,
            marginTop: '16px'
          }}>
            <strong>Файл:</strong> {fileError}
          </div>
        )}
        
        {error && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '6px', 
            color: '#dc2626',
            fontSize: '14px',
            flexShrink: 0,
            marginTop: '16px'
          }}>
            <strong>Ошибка:</strong> {error}
          </div>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleFileLoad(file)
          }
        }}
        style={{ display: 'none' }}
      />
    </Panel>
  )
} 
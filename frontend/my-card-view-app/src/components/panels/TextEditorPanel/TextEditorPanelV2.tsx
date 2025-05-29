// Чистая версия TextEditorPanel с нативной поддержкой чанков

import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Panel } from '../Panel'
import MonacoEditor from '../../MonacoEditor'
import { useDocumentStore } from '../../../store/documentStore'
import { useClipboard } from '../../../hooks/usePanelSync'
import type { ChangeInfo } from '../../../types/chunks'

// Компонент общих метрик документа
const DocumentMetrics: React.FC<{
  document: any
  isVisible: boolean
}> = ({ document, isVisible }) => {
  if (!isVisible || !document?.chunks) return null

  // Вычисляем средние значения метрик
  const chunks = document.chunks
  const validSignalChunks = chunks.filter((c: any) => c.metrics.signal_strength !== undefined && c.metrics.signal_strength !== null)
  const validComplexityChunks = chunks.filter((c: any) => c.metrics.complexity !== undefined && c.metrics.complexity !== null)
  
  const avgSignal = validSignalChunks.length > 0 
    ? validSignalChunks.reduce((sum: number, c: any) => sum + c.metrics.signal_strength, 0) / validSignalChunks.length
    : 0

  const avgComplexity = validComplexityChunks.length > 0
    ? validComplexityChunks.reduce((sum: number, c: any) => sum + c.metrics.complexity, 0) / validComplexityChunks.length
    : 0

  // Примерное время чтения (средняя скорость чтения 200 слов в минуту)
  const wordCount = document.text.split(/\s+/).filter((word: string) => word.length > 0).length
  const readingTimeMinutes = Math.ceil(wordCount / 200)

  return (
    <div style={{
      padding: '12px 16px',
      backgroundColor: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '14px',
      color: '#475569'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: '600' }}>📊 Общие метрики:</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🎯 Сигнал/шум:</span>
          <span style={{ 
            fontWeight: '600',
            color: avgSignal > 0.7 ? '#059669' : avgSignal > 0.5 ? '#d97706' : '#dc2626'
          }}>
            {avgSignal.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🧠 Сложность:</span>
          <span style={{ 
            fontWeight: '600',
            color: avgComplexity < 0.3 ? '#059669' : avgComplexity < 0.7 ? '#d97706' : '#dc2626'
          }}>
            {avgComplexity.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>⏱️ Время чтения:</span>
          <span style={{ fontWeight: '600', color: '#1e40af' }}>
            ~{readingTimeMinutes} мин
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#64748b' }}>
        <span>📝 {wordCount} слов</span>
        <span>🧩 {chunks.length} чанков</span>
        <span>📄 {document.text.length} символов</span>
      </div>
    </div>
  )
}

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
  
  // Используем documentStore напрямую
  const { 
    document,
    loading,
    error,
    initializeDocument,
    updateText,
  } = useDocumentStore()

  const { pasteFromClipboard } = useClipboard()

  // Получаем текст из documentStore или локального состояния
  const currentText = document?.text || editorText
  const chunksCount = document?.chunks.length || 0

  const handleTextChange = (newText: string) => {
    // Получаем актуальное состояние store напрямую
    const storeState = useDocumentStore.getState()
    const actualDocument = storeState.document
    
    // Обновляем локальное состояние
    setEditorText(newText)
    
    if (!actualDocument) {
      // Нет документа - нужны текст И тема для создания
      if (newText.trim() && editorTopic.trim()) {
        console.log('🆕 Инициализация нового документа')
        initializeDocument(newText, editorTopic)
      } else {
        console.log('⏭️ Пропускаем создание: недостаточно данных для нового документа')
      }
    } else {
      // Есть документ - обновляем если есть текст (тема уже не важна)
      if (newText.trim()) {
        console.log('🔄 Обновление существующего документа через updateText')
        updateText(newText) // Убираем changeInfo
      } else {
        console.log('⏭️ Пропускаем обновление: пустой текст')
      }
    }
  }

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
        setEditorText(text) // Обновляем локальное состояние
        handleTextChange(text)
      }
    } catch (error) {
      setFileError('Ошибка при чтении файла')
    }
  }, [handleTextChange])

  const handlePaste = useCallback(async () => {
    const text = await pasteFromClipboard()
    if (text) {
      setEditorText(text) // Обновляем локальное состояние  
      handleTextChange(text)
    }
  }, [pasteFromClipboard, handleTextChange])

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
        {/* Общие метрики документа */}
        <DocumentMetrics 
          document={document}
          isVisible={!!document && document.chunks.length > 0}
        />

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
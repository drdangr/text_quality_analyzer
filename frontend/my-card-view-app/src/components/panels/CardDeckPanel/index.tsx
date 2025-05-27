import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Panel } from '../Panel'
import { useAppStore } from '../../../store/appStore'
import { HeatMap } from './HeatMap'
import { CardSettingsPanel } from './CardSettingsPanel'
import { updateTextAndRestructureParagraph, mergeParagraphs, reorderParagraphs, deleteParagraph } from '../../../api'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CardDeckPanelProps {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

// Компонент для draggable карточки
const SortableCard: React.FC<{
  paragraph: any
  index: number
  editingCardId: number | null
  editingText: string
  setEditingText: (text: string) => void
  startEditingCard: (id: number, text: string) => void
  finishCardEditing: () => void
  debouncedSyncToEditor: (cardId: number, text: string) => void
  mergeWithNext: (id: number) => void
  deleteParagraph: (id: number) => void
  setSelectedParagraph: (id: string) => void
  selectedParagraphId: string | null
  fontSize: number
  fontFamily: string
  getCardColor: (paragraph: any) => string
  getTextColor: (paragraph: any) => string
  isLastCard: boolean
}> = ({ 
  paragraph, 
  index, 
  editingCardId, 
  editingText, 
  setEditingText, 
  startEditingCard, 
  finishCardEditing,
  debouncedSyncToEditor,
  mergeWithNext, 
  deleteParagraph,
  setSelectedParagraph, 
  selectedParagraphId,
  fontSize,
  fontFamily,
  getCardColor,
  getTextColor,
  isLastCard
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: paragraph.id.toString() })

  const [isEditing, setIsEditing] = useState(false)
  const [localText, setLocalText] = useState(paragraph.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Синхронизируем локальный текст с paragraph.text когда карточка не редактируется
  useEffect(() => {
    if (!isEditing) {
      setLocalText(paragraph.text)
    }
  }, [paragraph.text, isEditing])

  // Автоматически подгоняем высоту textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [isEditing, localText])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleStartEditing = () => {
    setIsEditing(true)
    setLocalText(paragraph.text)
    startEditingCard(paragraph.id, paragraph.text)
    
    // Фокусируемся на textarea после рендера
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        // Устанавливаем курсор в конец
        const length = textareaRef.current.value.length
        textareaRef.current.setSelectionRange(length, length)
      }
    }, 0)
  }

  const handleTextChange = (newText: string) => {
    setLocalText(newText)
    setEditingText(newText)
    
    // Простая синхронизация с редактором (только отображение)
    if (editingCardId === paragraph.id) {
      debouncedSyncToEditor(paragraph.id, newText)
    }
  }

  const handleFinishEditing = () => {
    setIsEditing(false)
    finishCardEditing()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      // Убираем фокус с textarea, что автоматически вызовет onBlur и завершит редактирование
      if (textareaRef.current) {
        textareaRef.current.blur()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setLocalText(paragraph.text) // Возвращаем исходный текст
      setIsEditing(false)
      finishCardEditing()
    }
  }

  // Цвет шапки - фиксированный светло-серый
  const headerColor = '#f8f9fa'
  const headerTextColor = '#495057'

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={{
        border: selectedParagraphId === paragraph.id.toString() ? '2px solid #7c3aed' : '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s',
        position: 'relative',
        marginBottom: '0',
        overflow: 'visible'
      }}
      data-paragraph-id={paragraph.id}
      onClick={() => setSelectedParagraph(paragraph.id.toString())}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'}
      >
        {/* Шапка карточки с фиксированным цветом */}
        <div 
          style={{
            backgroundColor: headerColor,
            padding: '4px 12px',
            borderBottom: '1px solid #e5e7eb',
            position: 'relative',
            minHeight: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            lineHeight: '1.2'
          }}
        >
          {/* Область для drag-and-drop */}
          <div 
            {...listeners}
            style={{
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: `${Math.max(10, fontSize - 2)}px`,
              color: headerTextColor,
              flex: 1
            }}
          >
            <span style={{ fontWeight: '600' }}>ID: {paragraph.id}</span>
            <span>Сигнал: {paragraph.metrics.signal_strength?.toFixed(2) || 'N/A'}</span>
            <span>Сложность: {paragraph.metrics.complexity?.toFixed(2) || 'N/A'}</span>
            {paragraph.metrics.semantic_function && (
              <span style={{ color: '#2563eb' }}>
                🏷️ {paragraph.metrics.semantic_function}
              </span>
            )}
          </div>
          
          {/* Кнопки управления - ВНЕ области drag-and-drop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={(e) => {
                console.log('🗑️ Нажата кнопка удаления для карточки:', paragraph.id)
                e.stopPropagation()
                e.preventDefault()
                console.log('✅ Удаление карточки:', paragraph.id)
                deleteParagraph(paragraph.id)
              }}
              onMouseDown={(e) => {
                console.log('👆 MouseDown на кнопке удаления:', paragraph.id)
                e.stopPropagation() // Останавливаем всплытие для drag-and-drop
              }}
              style={{
                padding: '4px 8px',
                fontSize: '16px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '28px',
                minHeight: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                position: 'relative',
                pointerEvents: 'auto'
              }}
              onMouseEnter={e => {
                console.log('🖱️ Hover на кнопке удаления:', paragraph.id)
                e.currentTarget.style.backgroundColor = '#fecaca'
                e.currentTarget.style.transform = 'scale(1.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#fee2e2'
                e.currentTarget.style.transform = 'scale(1)'
              }}
              title="Удалить абзац"
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Основная часть карточки с цветом по метрикам */}
        <div style={{
          backgroundColor: getCardColor(paragraph),
          padding: '16px'
        }}>
          {/* Текст карточки - либо textarea для редактирования, либо обычный текст */}
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={(e) => handleTextChange(e.target.value)}
              onBlur={handleFinishEditing}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                fontSize: `${fontSize}px`,
                fontFamily: fontFamily,
                color: getTextColor(paragraph),
                lineHeight: '1.6',
                margin: 0,
                padding: '4px',
                borderRadius: '4px',
                outline: 'none',
                border: '2px solid #7c3aed',
                background: 'rgba(255, 255, 255, 0.9)',
                resize: 'none',
                overflow: 'hidden'
              }}
              placeholder="Введите текст абзаца..."
            />
          ) : (
            <p 
              onClick={handleStartEditing}
              style={{
                fontSize: `${fontSize}px`,
                color: getTextColor(paragraph),
                lineHeight: '1.6',
                margin: 0,
                cursor: 'text',
                padding: '4px',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
                minHeight: '1.6em',
                whiteSpace: 'pre-wrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              title="Нажмите для редактирования (Ctrl+Enter - сохранить, Esc - отмена)"
            >
              {paragraph.text || 'Пустой абзац - нажмите для редактирования'}
            </p>
          )}
        </div>

        {/* Кнопка объединения с следующей карточкой */}
        {!isLastCard && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              mergeWithNext(paragraph.id)
            }}
            style={{
              position: 'absolute',
              bottom: '-12px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '24px',
              height: '24px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            title="Объединить со следующей карточкой"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

export const CardDeckPanel: React.FC<CardDeckPanelProps> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  
  const { 
    session, 
    fontSize, 
    fontFamily, 
    signalMinColor, 
    signalMaxColor, 
    complexityMinColor, 
    complexityMaxColor,
    setEditorFullText,
    selectedParagraphId,
    setSelectedParagraph,
    scrollToCard,
    setSession,
    updateEditingText,
    editingState,
    startEditing
  } = useAppStore()

  // Настройка сенсоров для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Простая функция синхронизации с текстовым редактором (только отображение)
  const syncToEditor = useCallback((cardId: number, newText: string) => {
    if (session) {
      console.log('🔄 Синхронизация с текстовым редактором:', cardId)
      
      // Обновляем текст карточки в сессии локально
      const updatedParagraphs = session.paragraphs.map(p => 
        p.id === cardId ? { ...p, text: newText } : p
      )
      
      // Создаем полный текст для редактора
      const fullText = updatedParagraphs
        .sort((a, b) => a.id - b.id)
        .map(p => p.text)
        .join('\n\n')
      
      // Обновляем сессию локально
      setSession({
        ...session,
        paragraphs: updatedParagraphs
      })
      
      // Синхронизируем с текстовым редактором
      setEditorFullText(fullText)
      
      // Обновляем состояние редактирования
      if (editingState.mode === 'none') {
        startEditing('card-editor', cardId)
      }
      updateEditingText(fullText)
    }
  }, [session, setSession, setEditorFullText, editingState.mode, startEditing, updateEditingText])

  // Обработчик завершения перетаскивания
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || !session || active.id === over.id) return
    
    const paragraphs = session.paragraphs
    const oldIndex = paragraphs.findIndex(p => p.id.toString() === active.id)
    const newIndex = paragraphs.findIndex(p => p.id.toString() === over.id)
    
    if (oldIndex === -1 || newIndex === -1) return
    
    try {
      // Оптимистичное обновление UI
      const newOrderedParagraphs = arrayMove(paragraphs, oldIndex, newIndex)
      const optimisticSession = {
        ...session,
        paragraphs: newOrderedParagraphs
      }
      setSession(optimisticSession)
      
      // API запрос для сохранения нового порядка
      const newOrderIds = newOrderedParagraphs.map(p => p.id)
      const updatedSession = await reorderParagraphs(
        session.metadata.session_id,
        newOrderIds
      )
      
      // Обновляем с данными от сервера
      setSession(updatedSession)
      
      // Обновляем полный текст в редакторе и состояние редактирования
      const fullText = updatedSession.paragraphs
        .sort((a: any, b: any) => a.id - b.id)
        .map((p: any) => p.text)
        .join('\n\n')
      setEditorFullText(fullText)
      updateEditingText(fullText)
      
      console.log('✅ Порядок карточек успешно изменен')
    } catch (error) {
      console.error('❌ Ошибка при изменении порядка:', error)
      // Откатываем к исходному состоянию в случае ошибки
      setSession(session)
      
      // Также откатываем текст в редакторе
      const originalText = session.paragraphs
        .sort((a: any, b: any) => a.id - b.id)
        .map((p: any) => p.text)
        .join('\n\n')
      setEditorFullText(originalText)
      updateEditingText(originalText)
    }
  }, [session, setSession, setEditorFullText, updateEditingText])

  // Начало редактирования карточки
  const startEditingCard = useCallback((cardId: number, currentText: string) => {
    console.log('🔄 Начинаем редактирование карточки:', cardId)
    setEditingCardId(cardId)
    setEditingText(currentText)
  }, [])

  // Завершение редактирования карточки
  const finishCardEditing = useCallback(async () => {
    console.log('✅ Завершаем редактирование карточки:', editingCardId)
    
    // Финальная синхронизация при завершении редактирования
    if (editingCardId !== null && editingText && session) {
      // Сначала синхронизируем локально
      syncToEditor(editingCardId, editingText)
      
      // Если есть двойные переводы строк, запускаем API для разбиения абзацев
      if (editingText.includes('\n\n')) {
        try {
          console.log('🔄 Разбиение абзацев через API')
          const updatedSession = await updateTextAndRestructureParagraph(
            session.metadata.session_id,
            editingCardId,
            editingText
          )
          
          // Обновляем сессию с данными от сервера
          setSession(updatedSession)
          
          // Синхронизируем с текстовым редактором
          const fullText = updatedSession.paragraphs
            .sort((a: any, b: any) => a.id - b.id)
            .map((p: any) => p.text)
            .join('\n\n')
          
          setEditorFullText(fullText)
          updateEditingText(fullText)
          
          console.log('✅ Разбиение абзацев завершено, абзацев:', updatedSession.paragraphs.length)
        } catch (error) {
          console.error('❌ Ошибка при разбиении абзацев:', error)
        }
      }
    }
    
    setEditingCardId(null)
    setEditingText('')
  }, [editingCardId, editingText, session, syncToEditor, setSession, setEditorFullText, updateEditingText])

  // Объединение карточек
  const mergeWithNext = useCallback(async (cardId: number) => {
    if (session) {
      console.log('Объединение карточки', cardId, 'со следующей')
      
      try {
        // Находим индекс текущей карточки
        const currentIndex = session.paragraphs.findIndex((p: any) => p.id === cardId)
        if (currentIndex === -1 || currentIndex >= session.paragraphs.length - 1) {
          console.warn('Невозможно объединить: карточка не найдена или последняя')
          return
        }
        
        const nextParagraph = session.paragraphs[currentIndex + 1]
        
        // Используем API для объединения
        const updatedSession = await mergeParagraphs(
          session.metadata.session_id,
          cardId,
          nextParagraph.id
        )
        
        // Обновляем сессию в store
        setSession(updatedSession)
        
        // Обновляем полный текст в редакторе и состояние редактирования
        const fullText = updatedSession.paragraphs
          .sort((a: any, b: any) => a.id - b.id)
          .map((p: any) => p.text)
          .join('\n\n')
        setEditorFullText(fullText)
        updateEditingText(fullText)
        
        console.log('✅ Карточки успешно объединены')
      } catch (error) {
        console.error('❌ Ошибка при объединении карточек:', error)
        // TODO: Показать уведомление об ошибке
      }
    }
  }, [session, setSession, setEditorFullText, updateEditingText])

  // Перемещение карточки
  const moveCard = useCallback((fromId: number, toId: number) => {
    if (session) {
      console.log('Перемещение карточки', fromId, 'в позицию', toId)
      // TODO: Реализовать drag-and-drop и API для перестановки
      syncToEditor(fromId, session.paragraphs.find(p => p.id === fromId)?.text || '')
    }
  }, [session, syncToEditor])

  // Функция для получения цвета карточки на основе метрик
  const getCardColor = useCallback((paragraph: any) => {
    const signal = paragraph.metrics.signal_strength || 0
    
    // Находим глобальные минимум и максимум среди всех параграфов
    if (!session) return 'white'
    
    const allSignals = session.paragraphs.map(p => p.metrics.signal_strength || 0)
    const minSignal = Math.min(...allSignals)
    const maxSignal = Math.max(...allSignals)
    
    // Нормализация относительно глобального диапазона (как в старом коде)
    const normalize = (value: number, min: number, max: number): number => {
      if (max === min) return value >= max ? 1 : 0
      const N = Math.max(0, Math.min(1, (value - min) / (max - min)))
      return isNaN(N) ? 0 : N
    }
    
    const normalizedSignal = normalize(signal, minSignal, maxSignal)
    
    // Интерполяция между минимальным и максимальным цветом сигнала
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 }
    }
    
    const minColor = hexToRgb(signalMinColor)
    const maxColor = hexToRgb(signalMaxColor)
    
    // Интерполяция цвета (как в старом коде)
    const r = Math.round(minColor.r + (maxColor.r - minColor.r) * normalizedSignal)
    const g = Math.round(minColor.g + (maxColor.g - minColor.g) * normalizedSignal)
    const b = Math.round(minColor.b + (maxColor.b - minColor.b) * normalizedSignal)
    
    return `rgb(${r}, ${g}, ${b})`
  }, [session, signalMinColor, signalMaxColor])

  // Функция для получения цвета текста на основе сложности
  const getTextColor = useCallback((paragraph: any) => {
    const complexity = paragraph.metrics.complexity || 0
    
    // Находим глобальные минимум и максимум сложности среди всех параграфов
    if (!session) return '#1f2937'
    
    const allComplexity = session.paragraphs.map(p => p.metrics.complexity || 0)
    const minComplexity = Math.min(...allComplexity)
    const maxComplexity = Math.max(...allComplexity)
    
    // Нормализация относительно глобального диапазона (как в старом коде)
    const normalize = (value: number, min: number, max: number): number => {
      if (max === min) return value >= max ? 1 : 0
      const N = Math.max(0, Math.min(1, (value - min) / (max - min)))
      return isNaN(N) ? 0 : N
    }
    
    const normalizedComplexity = normalize(complexity, minComplexity, maxComplexity)
    
    // Интерполяция между минимальным и максимальным цветом сложности
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 31, g: 41, b: 55 } // по умолчанию темно-серый
    }
    
    const minColor = hexToRgb(complexityMinColor)
    const maxColor = hexToRgb(complexityMaxColor)
    
    // Интерполяция цвета (как в старом коде)
    const r = Math.round(minColor.r + (maxColor.r - minColor.r) * normalizedComplexity)
    const g = Math.round(minColor.g + (maxColor.g - minColor.g) * normalizedComplexity)
    const b = Math.round(minColor.b + (maxColor.b - minColor.b) * normalizedComplexity)
    
    return `rgb(${r}, ${g}, ${b})`
  }, [session, complexityMinColor, complexityMaxColor])

  // Удаление карточки
  const deleteCard = useCallback(async (cardId: number) => {
    console.log('🗑️ deleteCard вызвана для карточки:', cardId)
    
    if (!session) {
      console.error('❌ Нет активной сессии для удаления карточки')
      return
    }
    
    console.log('🔄 Удаление карточки', cardId, 'из сессии:', session.metadata.session_id)
    
    try {
      // Используем API для удаления
      console.log('📡 Вызов API deleteParagraph...')
      const updatedSession = await deleteParagraph(
        session.metadata.session_id,
        cardId
      )
      
      console.log('📡 API deleteParagraph ответил:', updatedSession)
      
      // Обновляем сессию в store
      setSession(updatedSession)
      
      // Обновляем полный текст в редакторе и состояние редактирования
      const fullText = updatedSession.paragraphs
        .sort((a: any, b: any) => a.id - b.id)
        .map((p: any) => p.text)
        .join('\n\n')
      setEditorFullText(fullText)
      updateEditingText(fullText)
      
      console.log('✅ Карточка успешно удалена, осталось карточек:', updatedSession.paragraphs.length)
    } catch (error) {
      console.error('❌ Ошибка при удалении карточки:', error)
      alert(`Ошибка при удалении карточки: ${error}`)
    }
  }, [session, setSession, setEditorFullText, updateEditingText])

  if (!session) {
    return (
      <Panel
        id="cards"
        title="Карточки"
        icon={icon}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '256px',
          color: '#6b7280'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🃏</div>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>Нет данных для анализа</p>
            <p style={{ fontSize: '14px' }}>Проанализируйте текст сначала</p>
          </div>
        </div>
      </Panel>
    )
  }

  const headerControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Heat Map */}
      {showHeatMap && (
        <HeatMap
          paragraphs={session.paragraphs}
          onParagraphClick={(id) => {
            setSelectedParagraph(id.toString())
            scrollToCard(id)
          }}
          selectedParagraphId={selectedParagraphId ? parseInt(selectedParagraphId) : null}
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
        />
      )}
      
      {/* Настройки */}
      {showSettings && (
        <CardSettingsPanel />
      )}
    </div>
  )

  const headerButtons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        onClick={() => setShowHeatMap(!showHeatMap)}
        style={{
          padding: '4px',
          backgroundColor: showHeatMap ? '#e0e7ff' : 'transparent',
          color: showHeatMap ? '#4338ca' : '#666',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => {
          if (!showHeatMap) e.currentTarget.style.backgroundColor = '#f5f5f5'
        }}
        onMouseOut={(e) => {
          if (!showHeatMap) e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title="Heat Map"
      >
        🗺️
      </button>
      
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          padding: '4px',
          backgroundColor: showSettings ? '#e0e7ff' : 'transparent',
          color: showSettings ? '#4338ca' : '#666',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => {
          if (!showSettings) e.currentTarget.style.backgroundColor = '#f5f5f5'
        }}
        onMouseOut={(e) => {
          if (!showSettings) e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title="Настройки"
      >
        ⚙️
      </button>
    </div>
  )

  return (
    <Panel
      id="cards"
      title={`Карточки (${session.paragraphs.length})`}
      icon={icon}
      isExpanded={isExpanded}
      onToggleExpanded={onToggleExpanded}
      headerControls={headerControls}
      headerButtons={headerButtons}
      showSettings={showSettings || showHeatMap}
      onToggleSettings={() => {
        // Если открыт HeatMap, то закрываем его, если открыты настройки - закрываем их
        if (showHeatMap) {
          setShowHeatMap(false)
        }
        if (showSettings) {
          setShowSettings(false)
        }
      }}
    >
      <div style={{ height: '100%', padding: '16px' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={session.paragraphs.map(p => p.id.toString())}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0px', // убираем gap, т.к. margin теперь в SortableCard
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily
            }}>
              {session.paragraphs.map((paragraph, index) => (
                <SortableCard
                  key={paragraph.id}
                  paragraph={paragraph}
                  index={index}
                  editingCardId={editingCardId}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  startEditingCard={startEditingCard}
                  finishCardEditing={finishCardEditing}
                  debouncedSyncToEditor={syncToEditor}
                  mergeWithNext={mergeWithNext}
                  deleteParagraph={deleteCard}
                  setSelectedParagraph={setSelectedParagraph}
                  selectedParagraphId={selectedParagraphId}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  getCardColor={getCardColor}
                  getTextColor={getTextColor}
                  isLastCard={index >= session.paragraphs.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Panel>
  )
}
import React, { useState, useCallback } from 'react'
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
  saveCardEdit: () => void
  cancelCardEdit: () => void
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
  saveCardEdit, 
  cancelCardEdit, 
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
          {...listeners}
          style={{
            backgroundColor: headerColor,
            padding: '4px 12px',
            borderBottom: '1px solid #e5e7eb',
            cursor: 'grab',
            position: 'relative',
            minHeight: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            lineHeight: '1.2'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: `${Math.max(10, fontSize - 2)}px`,
            color: headerTextColor,
            flex: 1
          }}>
            <span style={{ fontWeight: '600' }}>ID: {paragraph.id}</span>
            <span>Сигнал: {paragraph.metrics.signal_strength?.toFixed(2) || 'N/A'}</span>
            <span>Сложность: {paragraph.metrics.complexity?.toFixed(2) || 'N/A'}</span>
            {paragraph.metrics.semantic_function && (
              <span style={{ color: '#2563eb' }}>
                🏷️ {paragraph.metrics.semantic_function}
              </span>
            )}
          </div>
          
          {/* Кнопки управления */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm('Удалить этот абзац?')) {
                  deleteParagraph(paragraph.id)
                }
              }}
              style={{
                padding: '2px 6px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: headerTextColor,
                opacity: 0.6,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
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
          {/* Текст карточки или редактор */}
          {editingCardId === paragraph.id ? (
            <div>
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: `${fontSize}px`,
                  fontFamily: fontFamily,
                  resize: 'vertical'
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    saveCardEdit()
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Сохранить
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    cancelCardEdit()
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ❌ Отмена
                </button>
              </div>
            </div>
          ) : (
            <p style={{
              fontSize: `${fontSize}px`,
              color: getTextColor(paragraph),
              lineHeight: '1.6',
              margin: 0,
              cursor: 'text',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation() // Предотвращаем выделение карточки
              startEditingCard(paragraph.id, paragraph.text)
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            >
              {paragraph.text}
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
    updateEditingText
  } = useAppStore()

  // Настройка сенсоров для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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
      
      // Обновляем полный текст в редакторе
      const fullText = updatedSession.paragraphs
        .sort((a: any, b: any) => a.id - b.id)
        .map((p: any) => p.text)
        .join('\n\n')
      setEditorFullText(fullText)
      
      console.log('✅ Порядок карточек успешно изменен')
    } catch (error) {
      console.error('❌ Ошибка при изменении порядка:', error)
      // Откатываем к исходному состоянию в случае ошибки
      // session уже содержит исходное состояние, просто перерендеримся
    }
  }, [session, setSession, setEditorFullText])

  // Функция для обновления текста в редакторе при изменениях
  const updateFullText = useCallback(() => {
    if (session) {
      const fullText = session.paragraphs
        .sort((a, b) => a.id - b.id)
        .map(p => p.text)
        .join('\n\n')
      setEditorFullText(fullText)
    }
  }, [session, setEditorFullText])

  // Начало редактирования карточки
  const startEditingCard = useCallback((cardId: number, currentText: string) => {
    setEditingCardId(cardId)
    setEditingText(currentText)
  }, [])

  // Сохранение изменений карточки
  const saveCardEdit = useCallback(async () => {
    if (editingCardId && session) {
      console.log('Сохранение изменений для карточки', editingCardId, editingText)
      
      try {
        // Используем API для сохранения с возможным разделением/удалением
        const updatedSession = await updateTextAndRestructureParagraph(
          session.metadata.session_id,
          editingCardId,
          editingText
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
        
        console.log('✅ Карточка успешно сохранена')
      } catch (error) {
        console.error('❌ Ошибка при сохранении карточки:', error)
        // TODO: Показать уведомление об ошибке
      }
    }
    
    setEditingCardId(null)
    setEditingText('')
  }, [editingCardId, editingText, session, setSession, setEditorFullText, updateEditingText])

  // Отмена редактирования
  const cancelCardEdit = useCallback(() => {
    setEditingCardId(null)
    setEditingText('')
  }, [])

  // Разделение карточки на две
  const splitCard = useCallback((cardId: number, splitAt: number) => {
    if (session) {
      console.log('Разделение карточки', cardId, 'в позиции', splitAt)
      // TODO: Реализовать API для разделения параграфа
      updateFullText()
    }
  }, [session, updateFullText])

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
      updateFullText()
    }
  }, [session, updateFullText])

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
    if (session) {
      console.log('Удаление карточки', cardId)
      
      try {
        // Используем API для удаления
        const updatedSession = await deleteParagraph(
          session.metadata.session_id,
          cardId
        )
        
        // Обновляем сессию в store
        setSession(updatedSession)
        
        // Обновляем полный текст в редакторе
        const fullText = updatedSession.paragraphs
          .sort((a: any, b: any) => a.id - b.id)
          .map((p: any) => p.text)
          .join('\n\n')
        setEditorFullText(fullText)
        
        console.log('✅ Карточка успешно удалена')
      } catch (error) {
        console.error('❌ Ошибка при удалении карточки:', error)
        // TODO: Показать уведомление об ошибке
      }
    }
  }, [session, setSession, setEditorFullText])

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
                  saveCardEdit={saveCardEdit}
                  cancelCardEdit={cancelCardEdit}
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
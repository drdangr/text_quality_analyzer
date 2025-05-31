// Чистая версия CardDeckPanel с нативной поддержкой чанков

import React, { useState, useMemo, useEffect } from 'react'
import { Panel } from '../Panel'
import { useDocumentStore } from '../../../store/documentStore'
import type { Chunk } from '../../../types/chunks'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CardDeckPanelV2Props {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

// Компонент перетаскиваемой карточки чанка
const SortableChunkCard: React.FC<{
  chunk: any
  chunkText: string
  index: number
  onSelect: (chunkId: string) => void
  selectedChunkId: string | null
  getCardColor: (chunk: any) => string
  getTextColor: (chunk: any) => string
  onMergeRequest: (chunkId: string) => void
  onDeleteRequest: (chunkId: string) => void
  fontSize: string
  fontFamily: string
  enableRealtimeSemantic?: boolean
}> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.chunk.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ChunkCard 
        {...props}
        dragHandleProps={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}

// Обновленный компонент карточки с поддержкой drag handle
const ChunkCard: React.FC<{
  chunk: any
  chunkText: string
  index: number
  onSelect: (chunkId: string) => void
  selectedChunkId: string | null
  getCardColor: (chunk: any) => string
  getTextColor: (chunk: any) => string
  onMergeRequest: (chunkId: string) => void
  onDeleteRequest: (chunkId: string) => void
  fontSize: string
  fontFamily: string
  dragHandleProps?: any
  isDragging?: boolean
  enableRealtimeSemantic?: boolean
}> = ({ 
  chunk, 
  chunkText,
  index,
  onSelect,
  selectedChunkId,
  getCardColor,
  getTextColor,
  onMergeRequest,
  onDeleteRequest,
  fontSize,
  fontFamily,
  dragHandleProps,
  isDragging,
  enableRealtimeSemantic = true
}) => {
  const isSelected = selectedChunkId === chunk.id
  
  return (
    <div style={{ position: 'relative', marginBottom: '12px' }}>
      <div
        style={{
          border: isSelected ? '2px solid #7c3aed' : '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: isDragging ? '0 8px 16px rgba(0, 0, 0, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
          transition: isDragging ? 'none' : 'all 0.2s',
          cursor: 'pointer',
          overflow: 'hidden',
          backgroundColor: 'white'
        }}
        onClick={() => onSelect(chunk.id)}
        onMouseEnter={e => !isDragging && (e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)')}
        onMouseLeave={e => !isDragging && (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)')}
      >
        {/* Кнопка удаления */}
        <button
          style={{
            position: 'absolute',
            top: '4px',
            right: '8px',
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '2px',
            lineHeight: '1',
            opacity: 0.6,
            transition: 'all 0.2s ease',
            zIndex: 20
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest(chunk.id);
          }}
          title="Удалить чанк"
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.backgroundColor = '#fef2f2';
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.6';
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#6b7280';
          }}
        >
          ×
        </button>

        {/* Шапка карточки */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '8px 32px 8px 12px', // Увеличиваем правый отступ для кнопки удаления
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#495057',
          fontFamily: fontFamily,
          position: 'relative'
        }}>
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            style={{
              position: 'absolute',
              left: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'grab',
              color: '#9ca3af',
              fontSize: '14px',
              padding: '2px',
              userSelect: 'none'
            }}
            title="Перетащите для изменения порядка"
          >
            ⋮⋮
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '20px' }}>
            <span style={{ fontWeight: '600' }}>Чанк #{index + 1}</span>
            <span>Сигнал: {chunk.metrics.signal_strength?.toFixed(2) || 'N/A'}</span>
            <span>Сложность: {chunk.metrics.complexity?.toFixed(2) || 'N/A'}</span>
          </div>
          
          {(() => {
            // УПРОЩЕННАЯ ЛОГИКА ОТОБРАЖЕНИЯ
            if (!enableRealtimeSemantic && !chunk.metrics.semantic_function) {
              return (
                <span style={{ 
                  color: '#dc2626',
                  fontSize: '10px',
                  padding: '2px 6px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '3px',
                  border: '1px solid #fecaca'
                }}>
                  🚫 Real-time выкл
                </span>
              );
            }
            
            if (chunk.metrics.isUpdating) {
              return (
                <span style={{ 
                  color: '#6b7280',
                  fontSize: '10px',
                  padding: '2px 6px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '3px'
                }}>
                  ⏳ Анализ...
                </span>
              );
            }
            
            if (chunk.metrics.semantic_function) {
              return (
                <span style={{ 
                  color: '#2563eb',
                  fontSize: '10px',
                  padding: '2px 6px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '3px',
                  border: '1px solid #bfdbfe'
                }}>
                  🏷️ {chunk.metrics.semantic_function}
                </span>
              );
            }
            
            // Если нет semantic_function и не обновляется
            return (
              <span style={{ 
                color: '#9ca3af',
                fontSize: '10px',
                padding: '2px 6px',
                backgroundColor: '#f9fafb',
                borderRadius: '3px'
              }}>
                ❓ Ожидание
              </span>
            );
          })()}
        </div>
        
        {/* Содержимое карточки */}
        <div style={{
          backgroundColor: getCardColor(chunk),
          padding: '12px',
          minHeight: '60px'
        }}>
          <div style={{
            fontSize: fontSize,
            fontFamily: fontFamily,
            lineHeight: '1.4',
            color: getTextColor(chunk),
            whiteSpace: 'pre-wrap'
          }}>
            {chunkText}
          </div>
          
          {/* Метаинформация */}
          <div style={{
            marginTop: '8px',
            fontSize: '11px',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: fontFamily
          }}>
            <span>
              Позиция: {chunk.start}-{chunk.end} ({chunk.end - chunk.start} симв.)
            </span>
            <span>
              ID: {chunk.id.substring(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      {/* Кнопка слияния */}
      {!isDragging && (
        <div style={{
          position: 'absolute',
          bottom: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10
        }}>
          <button
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#4ade80',
              border: '2px solid #ffffff',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              padding: '0',
              lineHeight: '1'
            }}
            onClick={(e) => {
              e.stopPropagation();
              onMergeRequest(chunk.id);
            }}
            title="Объединить с следующим чанком"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#22c55e';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4ade80';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

// Компонент Heat Map
const HeatMapGrid: React.FC<{
  chunks: any[]
  getCardColor: (chunk: any) => string
  getTextColor: (chunk: any) => string
  onChunkClick: (chunkId: string) => void
  selectedChunkId: string | null
}> = ({ chunks, getCardColor, getTextColor, onChunkClick, selectedChunkId }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
      gap: '4px',
      padding: '16px',
      backgroundColor: '#f8f9fa',
      borderRadius: '6px',
      maxHeight: '200px',
      overflowY: 'auto'
    }}>
      {chunks.map((chunk, index) => (
        <div
          key={chunk.id}
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: getCardColor(chunk),
            color: getTextColor(chunk),
            border: selectedChunkId === chunk.id ? '2px solid #7c3aed' : '1px solid #e5e7eb',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'center'
          }}
          onClick={() => onChunkClick(chunk.id)}
          title={`Чанк #${index + 1}\\nСигнал: ${chunk.metrics.signal_strength?.toFixed(2) || 'N/A'}\\nСложность: ${chunk.metrics.complexity?.toFixed(2) || 'N/A'}\\nСемантика: ${chunk.metrics.semantic_function || 'N/A'}`}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {index + 1}
        </div>
      ))}
    </div>
  )
}

// Компонент карточки абзаца
interface ChunkCardProps {
  chunk: Chunk;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: () => void;
  onDrop: (e: React.DragEvent, targetIndex: number) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDelete: () => void;
  signalColor: string;
  complexityColor: string;
  enableRealtimeSemantic?: boolean;
}

export const CardDeckPanelV2: React.FC<CardDeckPanelV2Props> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'position' | 'signal' | 'complexity'>('position')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [signalMinColor, setSignalMinColor] = useState('#FFFFFF')
  const [signalMaxColor, setSignalMaxColor] = useState('#FFDB58')
  const [complexityMinColor, setComplexityMinColor] = useState('#008000')
  const [complexityMaxColor, setComplexityMaxColor] = useState('#FF0000')
  const [fontSize, setFontSize] = useState('14px')
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif')

  // Используем documentStore напрямую
  const { 
    document,
    loading,
    error,
    getChunkText,
    mergeChunks,
    reorderChunks
  } = useDocumentStore()
  
  const enableRealtimeSemantic = useDocumentStore(state => state.ui.enableRealtimeSemantic)

  console.log('🃏 CardDeckPanelV2 ре-рендер:', {
    hasDocument: !!document,
    chunksCount: document?.chunks.length || 0,
    documentVersion: document?.version || 0
  });

  // Отслеживаем изменения semantic_function в чанках
  useEffect(() => {
    if (!document?.chunks) return;
    
    const chunksWithSemanticFunctions = document.chunks.filter(c => c.metrics.semantic_function);
    console.log('📊 Семантические функции обновлены:', {
      totalChunks: document.chunks.length,
      withSemanticFunctions: chunksWithSemanticFunctions.length
    });
  }, [document?.chunks, document?.version]);

  // Настройка drag-and-drop сенсоров
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Обработчики drag-and-drop
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    setActiveId(null) // Сначала очищаем activeId
    
    if (!over || active.id === over.id || !document) {
      return
    }

    try {
      const oldIndex = sortedChunks.findIndex(chunk => chunk.id === active.id)
      const newIndex = sortedChunks.findIndex(chunk => chunk.id === over.id)
      
      console.log('🔄 Drag end:', { 
        activeId: active.id, 
        overId: over.id, 
        oldIndex, 
        newIndex,
        chunksLength: sortedChunks.length 
      })
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // Используем реальную функцию reorderChunks из documentStore
        reorderChunks(oldIndex, newIndex)
      } else {
        console.warn('⚠️ Некорректные индексы для drag-and-drop:', { oldIndex, newIndex })
      }
    } catch (error) {
      console.error('❌ Ошибка в handleDragEnd:', error)
      // Не прерываем работу UI, просто логируем ошибку
    }
  }

  // Получаем отсортированные чанки
  const sortedChunks = useMemo(() => {
    if (!document?.chunks) {
      console.log('🔄 sortedChunks: нет документа или чанков');
      return [];
    }
    
    console.log('🔄 sortedChunks СОЗДАНИЕ:', {
      originalChunksCount: document.chunks.length,
      originalChunksWithSemantic: document.chunks.filter(c => !!c.metrics.semantic_function).length,
      sortField,
      sortDirection,
      originalChunksData: document.chunks.map(c => ({
        id: c.id.slice(0, 8),
        semantic_function: c.metrics.semantic_function,
        hasSemanticFunction: !!c.metrics.semantic_function
      }))
    });
    
    const chunks = [...document.chunks]
    
    chunks.sort((a, b) => {
      let aValue: number
      let bValue: number
      
      switch (sortField) {
        case 'signal':
          aValue = a.metrics.signal_strength || 0
          bValue = b.metrics.signal_strength || 0
          break
        case 'complexity':
          aValue = a.metrics.complexity || 0
          bValue = b.metrics.complexity || 0
          break
        default: // position
          aValue = a.start
          bValue = b.start
      }
      
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
    
    console.log('🔄 sortedChunks РЕЗУЛЬТАТ:', {
      sortedChunksCount: chunks.length,
      sortedChunksWithSemantic: chunks.filter(c => !!c.metrics.semantic_function).length,
      sortedChunksData: chunks.map(c => ({
        id: c.id.slice(0, 8),
        semantic_function: c.metrics.semantic_function,
        hasSemanticFunction: !!c.metrics.semantic_function
      })),
      dataPreserved: document.chunks.length === chunks.length,
      semanticDataPreserved: document.chunks.filter(c => !!c.metrics.semantic_function).length === chunks.filter(c => !!c.metrics.semantic_function).length
    });
    
    return chunks
  }, [document?.chunks, sortField, sortDirection]);

  // Вычисляем нормализованные значения для цветов
  const normalizedMetrics = useMemo(() => {
    if (!sortedChunks.length) {
      return { signalNormalized: new Map(), complexityNormalized: new Map() };
    }

    // Собираем все валидные значения signal_strength
    const signalValues = sortedChunks
      .map(chunk => chunk.metrics.signal_strength)
      .filter((val): val is number => typeof val === 'number' && !isNaN(val));
    
    // Собираем все валидные значения complexity
    const complexityValues = sortedChunks
      .map(chunk => chunk.metrics.complexity)
      .filter((val): val is number => typeof val === 'number' && !isNaN(val));

    // Вычисляем min/max для signal_strength
    const signalMin = signalValues.length > 0 ? Math.min(...signalValues) : 0;
    const signalMax = signalValues.length > 0 ? Math.max(...signalValues) : 1;
    const signalRange = signalMax - signalMin || 1; // Избегаем деления на 0

    // Вычисляем min/max для complexity
    const complexityMin = complexityValues.length > 0 ? Math.min(...complexityValues) : 0;
    const complexityMax = complexityValues.length > 0 ? Math.max(...complexityValues) : 1;
    const complexityRange = complexityMax - complexityMin || 1; // Избегаем деления на 0

    console.log('🎨 Нормализация метрик:', {
      signal: { min: signalMin, max: signalMax, range: signalRange, count: signalValues.length },
      complexity: { min: complexityMin, max: complexityMax, range: complexityRange, count: complexityValues.length }
    });

    // Создаем нормализованные значения для каждого чанка
    const signalNormalized = new Map<string, number>();
    const complexityNormalized = new Map<string, number>();

    sortedChunks.forEach(chunk => {
      // Нормализация signal_strength (0 = min значение, 1 = max значение)
      if (typeof chunk.metrics.signal_strength === 'number' && !isNaN(chunk.metrics.signal_strength)) {
        const normalized = (chunk.metrics.signal_strength - signalMin) / signalRange;
        signalNormalized.set(chunk.id, Math.max(0, Math.min(1, normalized)));
      }

      // Нормализация complexity (0 = min значение, 1 = max значение)
      if (typeof chunk.metrics.complexity === 'number' && !isNaN(chunk.metrics.complexity)) {
        const normalized = (chunk.metrics.complexity - complexityMin) / complexityRange;
        complexityNormalized.set(chunk.id, Math.max(0, Math.min(1, normalized)));
      }
    });

    return { signalNormalized, complexityNormalized };
  }, [sortedChunks]);

  // Функция для расчета цвета карточки по НОРМАЛИЗОВАННОМУ сигналу
  const getCardColor = (chunk: any): string => {
    const normalizedSignal = normalizedMetrics.signalNormalized.get(chunk.id);
    
    if (normalizedSignal === undefined) {
      return '#f9fafb' // Серый для неопределенных значений
    }
    
    // Интерполяция между минимальным и максимальным цветом
    const ratio = normalizedSignal; // Уже нормализовано от 0 до 1
    
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 }
    }
    
    const minRgb = hexToRgb(signalMinColor)
    const maxRgb = hexToRgb(signalMaxColor)
    
    const r = Math.round(minRgb.r + (maxRgb.r - minRgb.r) * ratio)
    const g = Math.round(minRgb.g + (maxRgb.g - minRgb.g) * ratio)
    const b = Math.round(minRgb.b + (maxRgb.b - minRgb.b) * ratio)
    
    return `rgb(${r}, ${g}, ${b})`
  }

  // Функция для расчета цвета текста по НОРМАЛИЗОВАННОЙ сложности
  const getTextColor = (chunk: any): string => {
    const normalizedComplexity = normalizedMetrics.complexityNormalized.get(chunk.id);
    
    if (normalizedComplexity === undefined) {
      return '#374151' // Серый для неопределенных значений
    }
    
    // Интерполяция между минимальным и максимальным цветом
    const ratio = normalizedComplexity; // Уже нормализовано от 0 до 1
    
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 55, g: 65, b: 81 }
    }
    
    const minRgb = hexToRgb(complexityMinColor)
    const maxRgb = hexToRgb(complexityMaxColor)
    
    const r = Math.round(minRgb.r + (maxRgb.r - minRgb.r) * ratio)
    const g = Math.round(minRgb.g + (maxRgb.g - minRgb.g) * ratio)
    const b = Math.round(minRgb.b + (maxRgb.b - minRgb.b) * ratio)
    
    return `rgb(${r}, ${g}, ${b})`
  }

  // Функция слияния чанков
  const handleMergeRequest = async (chunkId: string) => {
    try {
      // Находим текущий чанк в отсортированном списке
      const currentIndex = sortedChunks.findIndex(c => c.id === chunkId)
      console.log('🔗 Запрос на слияние чанка:', {
        chunkId: chunkId.slice(0, 8),
        currentIndex,
        totalChunks: sortedChunks.length
      })
      
      if (currentIndex >= 0 && currentIndex < sortedChunks.length - 1) {
        const currentChunk = sortedChunks[currentIndex]
        const nextChunk = sortedChunks[currentIndex + 1]
        
        console.log('🔗 Будем объединять чанки:', {
          current: {
            id: currentChunk.id.slice(0, 8),
            position: `${currentChunk.start}-${currentChunk.end}`,
            index: currentIndex
          },
          next: {
            id: nextChunk.id.slice(0, 8),
            position: `${nextChunk.start}-${nextChunk.end}`,
            index: currentIndex + 1
          }
        })
        
        // Используем новую функцию с двумя параметрами
        mergeChunks(currentChunk.id, nextChunk.id)
      } else {
        console.warn('⚠️ Нет следующего чанка для слияния или это последний чанк')
      }
    } catch (error) {
      console.error('Ошибка при объединении чанков:', error)
    }
  }

  // Функция удаления чанка
  const handleDeleteRequest = async (chunkId: string) => {
    try {
      if (window.confirm('Вы уверены, что хотите удалить этот чанк?')) {
        // Получаем чанк для удаления
        const chunkToDelete = sortedChunks.find(c => c.id === chunkId)
        if (!chunkToDelete || !document) return

        // Создаем новый текст без удаляемого чанка
        const beforeChunk = document.text.slice(0, chunkToDelete.start)
        const afterChunk = document.text.slice(chunkToDelete.end)
        const newText = beforeChunk + afterChunk

        // Обновляем документ через updateText (который пересчитает чанки)
        const { updateText } = useDocumentStore.getState()
        updateText(newText)
      }
    } catch (error) {
      console.error('Ошибка при удалении чанка:', error)
    }
  }

  // Функция скролла к чанку (для Heat Map)
  const scrollToChunk = (chunkId: string) => {
    setSelectedChunkId(chunkId)
    // Используем глобальный document через window
    const element = window.document.getElementById(`chunk-${chunkId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Найти активный чанк для DragOverlay
  const activeChunk = activeId ? sortedChunks.find(chunk => chunk.id === activeId) : null

  // Настройки панели
  const headerControls = showSettings ? (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '12px',
      fontSize: '12px',
      padding: '8px 0'
    }}>
      {/* Сортировка */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Сортировка:</label>
        <select 
          value={sortField}
          onChange={(e) => setSortField(e.target.value as any)}
          style={{ flex: 1, padding: '4px', fontSize: '12px' }}
        >
          <option value="position">По позиции</option>
          <option value="signal">По сигналу</option>
          <option value="complexity">По сложности</option>
        </select>
        <button
          onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
          style={{ 
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      
      {/* Цвета для сигнала (фон карточек) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Фон (сигнал):</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px' }}>Мин</span>
          <input 
            type="color" 
            value={signalMinColor}
            onChange={(e) => setSignalMinColor(e.target.value)}
            style={{ width: '24px', height: '20px', border: 'none' }}
          />
          <span style={{ fontSize: '10px' }}>Макс</span>
          <input 
            type="color" 
            value={signalMaxColor}
            onChange={(e) => setSignalMaxColor(e.target.value)}
            style={{ width: '24px', height: '20px', border: 'none' }}
          />
        </div>
      </div>

      {/* Цвета для сложности (текст) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Текст (сложность):</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px' }}>Мин</span>
          <input 
            type="color" 
            value={complexityMinColor}
            onChange={(e) => setComplexityMinColor(e.target.value)}
            style={{ width: '24px', height: '20px', border: 'none' }}
          />
          <span style={{ fontSize: '10px' }}>Макс</span>
          <input 
            type="color" 
            value={complexityMaxColor}
            onChange={(e) => setComplexityMaxColor(e.target.value)}
            style={{ width: '24px', height: '20px', border: 'none' }}
          />
        </div>
      </div>

      {/* Настройки шрифта */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Размер:</label>
        <select
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value)}
          style={{ flex: 1, padding: '4px', fontSize: '12px' }}
        >
          <option value="12px">12px</option>
          <option value="14px">14px</option>
          <option value="16px">16px</option>
          <option value="18px">18px</option>
          <option value="20px">20px</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Шрифт:</label>
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          style={{ flex: 1, padding: '4px', fontSize: '12px' }}
        >
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Times New Roman, serif">Times New Roman</option>
          <option value="Courier New, monospace">Courier New</option>
          <option value="Verdana, sans-serif">Verdana</option>
        </select>
      </div>
    </div>
  ) : null

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
        title="Настройки"
      >
        ⚙️
      </button>
    </div>
  )

  // Если нет документа
  if (!document) {
    return (
      <Panel
        title="Карточки чанков (0)"
        icon={icon}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
        headerControls={headerControls}
        headerButtons={headerButtons}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '200px', 
          color: '#6b7280',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ fontSize: '36px' }}>🃏</div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '16px', marginBottom: '4px' }}>Карточки чанков</p>
            <p style={{ fontSize: '14px' }}>Появятся после создания документа</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title={`Карточки чанков (${sortedChunks.length})`}
      icon={icon}
      isExpanded={isExpanded}
      onToggleExpanded={onToggleExpanded}
      headerControls={headerControls}
      headerButtons={headerButtons}
      showSettings={showSettings}
      onToggleSettings={() => setShowSettings(!showSettings)}
    >
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '16px' 
        }}>
          {loading && (
            <div style={{ 
              padding: '12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              color: '#1d4ed8',
              fontSize: '14px',
              marginBottom: '16px'
            }}>
              🔄 Анализ чанков...
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
              marginBottom: '16px'
            }}>
              ❌ Ошибка: {error}
            </div>
          )}

          {/* Heat Map */}
          {showHeatMap && sortedChunks.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '600', 
                color: '#374151', 
                marginBottom: '8px' 
              }}>
                📊 Heat Map чанков
              </div>
              <HeatMapGrid
                chunks={sortedChunks}
                getCardColor={getCardColor}
                getTextColor={getTextColor}
                onChunkClick={scrollToChunk}
                selectedChunkId={selectedChunkId}
              />
            </div>
          )}
          
          {/* Статистика */}
          {document && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#64748b',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>📄 Документ: {document.text.length} символов</span>
              <span>🧩 Чанков: {sortedChunks.length}</span>
              <span>📊 Версия: {document.version}</span>
            </div>
          )}
          
          {/* Список карточек с поддержкой сортировки */}
          <SortableContext 
            items={sortedChunks.map(chunk => chunk.id)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              paddingRight: '4px'
            }}>
              {sortedChunks.map((chunk, index) => (
                <div key={chunk.id} id={`chunk-${chunk.id}`}>
                  <SortableChunkCard
                    chunk={chunk}
                    chunkText={getChunkText(chunk.id)}
                    index={index}
                    onSelect={setSelectedChunkId}
                    selectedChunkId={selectedChunkId}
                    getCardColor={getCardColor}
                    getTextColor={getTextColor}
                    onMergeRequest={handleMergeRequest}
                    onDeleteRequest={handleDeleteRequest}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    enableRealtimeSemantic={enableRealtimeSemantic}
                  />
                </div>
              ))}
              
              {sortedChunks.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#9ca3af',
                  marginTop: '60px'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🃏</div>
                  <p>Чанки не найдены</p>
                </div>
              )}
            </div>
          </SortableContext>
        </div>

        {/* DragOverlay для показа перетаскиваемого элемента */}
        <DragOverlay>
          {activeChunk ? (
            <ChunkCard
              chunk={activeChunk}
              chunkText={getChunkText(activeChunk.id)}
              index={sortedChunks.findIndex(c => c.id === activeChunk.id)}
              onSelect={() => {}}
              selectedChunkId={null}
              getCardColor={getCardColor}
              getTextColor={getTextColor}
              onMergeRequest={() => {}}
              onDeleteRequest={() => {}}
              fontSize={fontSize}
              fontFamily={fontFamily}
              isDragging={true}
              enableRealtimeSemantic={enableRealtimeSemantic}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </Panel>
  )
} 
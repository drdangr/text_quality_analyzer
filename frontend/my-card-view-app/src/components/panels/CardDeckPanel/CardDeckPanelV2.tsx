// Чистая версия CardDeckPanel с нативной поддержкой чанков

import React, { useState, useMemo } from 'react'
import { Panel } from '../Panel'
import { useDocumentStore } from '../../../store/documentStore'

interface CardDeckPanelV2Props {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

// Простой компонент карточки чанка
const ChunkCard: React.FC<{
  chunk: any
  chunkText: string
  index: number
  onSelect: (chunkId: string) => void
  selectedChunkId: string | null
  getCardColor: (chunk: any) => string
}> = ({ 
  chunk, 
  chunkText,
  index,
  onSelect,
  selectedChunkId,
  getCardColor
}) => {
  const isSelected = selectedChunkId === chunk.id
  
  return (
    <div
      style={{
        border: isSelected ? '2px solid #7c3aed' : '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s',
        marginBottom: '12px',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
      onClick={() => onSelect(chunk.id)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'}
    >
      {/* Шапка карточки */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '8px 12px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#495057'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: '600' }}>Чанк #{index + 1}</span>
          <span>Сигнал: {chunk.metrics.signal_strength?.toFixed(2) || 'N/A'}</span>
          <span>Сложность: {chunk.metrics.complexity?.toFixed(2) || 'N/A'}</span>
        </div>
        
        {chunk.metrics.semantic_function && (
          <span style={{ 
            color: '#2563eb',
            fontSize: '10px',
            padding: '2px 6px',
            backgroundColor: '#eff6ff',
            borderRadius: '4px'
          }}>
            🏷️ {chunk.metrics.semantic_function}
          </span>
        )}
      </div>
      
      {/* Содержимое карточки */}
      <div style={{
        backgroundColor: getCardColor(chunk),
        padding: '12px',
        minHeight: '60px'
      }}>
        <div style={{
          fontSize: '14px',
          lineHeight: '1.4',
          color: '#374151',
          whiteSpace: 'pre-wrap',
          maxHeight: '120px',
          overflow: 'hidden'
        }}>
          {chunkText.length > 200 
            ? chunkText.substring(0, 200) + '...'
            : chunkText
          }
        </div>
        
        {/* Метаинформация */}
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#6b7280',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
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
  )
}

export const CardDeckPanelV2: React.FC<CardDeckPanelV2Props> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'position' | 'signal' | 'complexity'>('position')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [signalMinColor, setSignalMinColor] = useState('#FFFFFF')
  const [signalMaxColor, setSignalMaxColor] = useState('#FFDB58')

  // Используем documentStore напрямую
  const { 
    document,
    loading,
    error,
    getChunkText
  } = useDocumentStore()

  // Получаем отсортированные чанки
  const sortedChunks = useMemo(() => {
    if (!document?.chunks) return []
    
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
    
    return chunks
  }, [document?.chunks, sortField, sortDirection])

  // Функция для расчета цвета карточки по сигналу
  const getCardColor = (chunk: any): string => {
    const signal = chunk.metrics.signal_strength
    if (signal === undefined || signal === null) {
      return '#f9fafb' // Серый для неопределенных значений
    }
    
    // Интерполяция между минимальным и максимальным цветом
    const ratio = Math.max(0, Math.min(1, signal)) // Ограничиваем от 0 до 1
    
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
      
      {/* Цвета для сигнала */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '60px' }}>Цвета:</label>
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
        
        {/* Список карточек */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto',
          paddingRight: '4px'
        }}>
          {sortedChunks.map((chunk, index) => (
            <ChunkCard
              key={chunk.id}
              chunk={chunk}
              chunkText={getChunkText(chunk.id)}
              index={index}
              onSelect={setSelectedChunkId}
              selectedChunkId={selectedChunkId}
              getCardColor={getCardColor}
            />
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
      </div>
    </Panel>
  )
} 
import React, { useState } from 'react'
import { Panel } from '../Panel'
import { useDocumentStore } from '../../../store/documentStore'

interface SemanticMapPanelProps {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

export const SemanticMapPanel: React.FC<SemanticMapPanelProps> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null)
  
  // Используем documentStore напрямую
  const { document } = useDocumentStore()

  const headerControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label>Размер нод:</label>
        <input type="range" min="5" max="50" defaultValue="20" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label>Цвета:</label>
        <input type="color" defaultValue="#ffffff" style={{ width: '32px', height: '24px' }} />
        <input type="color" defaultValue="#ffdb58" style={{ width: '32px', height: '24px' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label>Иконки:</label>
        <input type="checkbox" defaultChecked />
      </div>
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

  if (!document) {
    return (
      <Panel
        title="Семантическая карта"
        headerControls={headerControls}
        headerButtons={headerButtons}
        icon={icon}
        isExpanded={isExpanded}
        onToggleExpanded={onToggleExpanded}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '256px', 
          color: '#6b7280' 
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🧠</div>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>Семантическая карта</p>
            <p style={{ fontSize: '14px' }}>Появится после создания документа</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Семантическая карта"
      headerControls={headerControls}
      headerButtons={headerButtons}
      icon={icon}
      isExpanded={isExpanded}
      onToggleExpanded={onToggleExpanded}
      showSettings={showSettings}
      onToggleSettings={() => setShowSettings(!showSettings)}
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px' }}>
        {/* Статистика документа */}
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
          <span>📄 Символов: {document.text.length}</span>
          <span>🧩 Чанков: {document.chunks.length}</span>
          <span>📊 Версия: V{document.version}</span>
        </div>
        
        <div style={{ 
          flex: 1, 
          border: '2px dashed #d1d5db', 
          borderRadius: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>🚧</div>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>В разработке</p>
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>Карта семантических связей чанков</p>
            
            {/* Превью информации о чанках */}
            <div style={{ 
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              fontSize: '12px'
            }}>
              <p style={{ marginBottom: '4px' }}>
                📊 Найдено чанков: {document.chunks.length}
              </p>
              {selectedChunkId && (
                <p style={{ color: '#2563eb' }}>
                  🎯 Выбран чанк: {selectedChunkId.substring(0, 8)}...
                </p>
              )}
              {document.chunks.some(c => c.metrics.semantic_function) && (
                <p style={{ color: '#16a34a' }}>
                  🏷️ Семантические функции распознаны
                </p>
              )}
            </div>
            
            {/* Список чанков с функциями */}
            <div style={{ 
              marginTop: '12px',
              maxHeight: '120px',
              overflowY: 'auto',
              fontSize: '11px'
            }}>
              {document.chunks
                .filter(chunk => chunk.metrics.semantic_function)
                .slice(0, 5)
                .map((chunk, index) => (
                  <div 
                    key={chunk.id}
                    style={{ 
                      padding: '4px 8px',
                      margin: '2px 0',
                      backgroundColor: selectedChunkId === chunk.id ? '#e0e7ff' : '#ffffff',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: '1px solid #e5e7eb'
                    }}
                    onClick={() => setSelectedChunkId(chunk.id)}
                  >
                    Чанк #{index + 1}: {chunk.metrics.semantic_function}
                  </div>
                ))
              }
              {document.chunks.filter(c => c.metrics.semantic_function).length > 5 && (
                <div style={{ color: '#9ca3af', marginTop: '8px' }}>
                  ... и ещё {document.chunks.filter(c => c.metrics.semantic_function).length - 5} чанков
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
} 
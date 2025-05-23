import React, { useState } from 'react'
import { Panel } from '../Panel'
import { useAppStore } from '../../../store/appStore'

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
  const { session, selectedParagraphId } = useAppStore()

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

  if (!session) {
    return (
      <Panel
        id="semantic-map"
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
            <p style={{ fontSize: '14px' }}>Появится после анализа текста</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      id="semantic-map"
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
            <p style={{ fontSize: '14px' }}>Карта семантических связей</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>
              Найдено абзацев: {session.paragraphs.length}
            </p>
            {selectedParagraphId && (
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#2563eb' }}>
                Выбран абзац: #{selectedParagraphId}
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
} 
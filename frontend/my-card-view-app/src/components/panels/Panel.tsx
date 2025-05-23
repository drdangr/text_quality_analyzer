import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PanelProps {
  id: string
  title: string
  children: React.ReactNode
  headerControls?: React.ReactNode
  headerButtons?: React.ReactNode
  className?: string
  defaultExpanded?: boolean
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
  showSettings?: boolean
  onToggleSettings?: () => void
}

export const Panel: React.FC<PanelProps> = ({
  id,
  title,
  children,
  headerControls,
  headerButtons,
  className = '',
  defaultExpanded = true,
  icon = '📄',
  isExpanded: externalIsExpanded,
  onToggleExpanded,
  showSettings: externalShowSettings,
  onToggleSettings
}) => {
  const [internalIsExpanded, setInternalIsExpanded] = useState(defaultExpanded)
  const [showSettings, setShowSettings] = useState(externalShowSettings || false)

  // Используем внешнее состояние если оно передано, иначе внутреннее
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded
  const currentShowSettings = externalShowSettings !== undefined ? externalShowSettings : showSettings
  
  const toggleExpanded = () => {
    if (onToggleExpanded) {
      onToggleExpanded()
    } else {
      setInternalIsExpanded(!internalIsExpanded)
    }
  }

  const toggleSettings = () => {
    if (onToggleSettings) {
      onToggleSettings()
    } else {
      setShowSettings(!showSettings)
    }
  }

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#f8f9fa',
        border: '1px solid #e9ecef',
        borderRadius: '6px',
        overflow: 'hidden',
        minHeight: 0,
        alignSelf: 'stretch',
        width: '100%'
      }}
      className={className}
    >
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: '#f1f3f4',
        borderBottom: isExpanded ? '1px solid #e9ecef' : 'none',
        padding: isExpanded ? '8px 12px' : '8px 4px',
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px',
        transition: 'padding 0.3s ease',
        flex: isExpanded ? '0 0 auto' : '1 1 auto'
      }}>
        {isExpanded ? (
          // Развернутый заголовок
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={toggleExpanded}
                  style={{
                    padding: '4px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#666',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Свернуть панель"
                >
                  <motion.span
                    animate={{ rotate: 90 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: 'inline-block' }}
                  >
                    ▶
                  </motion.span>
                </button>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#333',
                  margin: 0,
                  userSelect: 'none'
                }}>{title}</h3>
              </div>
              
              {headerButtons ? (
                headerButtons
              ) : headerControls && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={toggleSettings}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#666',
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Настройки панели"
                  >
                    ⚙️
                  </button>
                </div>
              )}
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {currentShowSettings && headerControls && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  {headerControls}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // Свернутый заголовок
          <div 
            onClick={toggleExpanded}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              justifyContent: 'flex-start',
              paddingTop: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title={`Развернуть ${title}`}
          >
            <button
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: '#666',
                fontSize: '18px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                pointerEvents: 'none'
              }}
            >
              {icon}
            </button>
            <div style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '12px',
              fontWeight: 500,
              color: '#666',
              userSelect: 'none',
              whiteSpace: 'nowrap'
            }}>
              {title}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              flex: 1,
              overflow: 'hidden',
              backgroundColor: 'white',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ 
              flex: 1, 
              overflow: 'auto'
            }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
} 
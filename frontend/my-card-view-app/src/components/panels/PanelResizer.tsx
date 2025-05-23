import React, { useCallback, useEffect, useState } from 'react'

interface PanelResizerProps {
  onResize: (delta: number) => void
  className?: string
}

export const PanelResizer: React.FC<PanelResizerProps> = ({ onResize, className = '' }) => {
  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    setStartX(e.clientX)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const delta = e.clientX - startX
    onResize(delta)
    setStartX(e.clientX)
  }, [isResizing, startX, onResize])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div
      className={className}
      onMouseDown={handleMouseDown}
      style={{
        width: '4px',
        backgroundColor: isResizing ? '#3b82f6' : 'transparent',
        cursor: 'col-resize',
        position: 'relative',
        flexShrink: 0,
        transition: isResizing ? 'none' : 'background-color 0.2s ease',
        zIndex: 10
      }}
      onMouseEnter={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = '#e5e7eb'
        }
      }}
      onMouseLeave={(e) => {
        if (!isResizing) {
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      {/* Невидимая расширенная область для легкого захвата */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '-4px',
          right: '-4px',
          bottom: 0,
          cursor: 'col-resize'
        }}
      />
    </div>
  )
} 
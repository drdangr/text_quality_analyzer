import React from 'react'
import type { ParagraphData } from '../../CardView/types'

interface HeatMapProps {
  paragraphs: ParagraphData[]
  onParagraphClick: (paragraphId: number) => void
  selectedParagraphId: number | null
  signalMinColor?: string
  signalMaxColor?: string
  complexityMinColor?: string
  complexityMaxColor?: string
}

export const HeatMap: React.FC<HeatMapProps> = ({ 
  paragraphs, 
  onParagraphClick, 
  selectedParagraphId,
  signalMinColor = '#FFFFFF',
  signalMaxColor = '#FFDB58',
  complexityMinColor = '#00FF00',
  complexityMaxColor = '#FF0000'
}) => {
  // Функция для преобразования hex в rgb
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 }
  }

  // Функция для получения цвета кубика (точно такая же как в карточках)
  const getHeatMapColor = (paragraph: any) => {
    const signal = paragraph.metrics.signal_strength || 0
    
    // Нормализация относительно глобального диапазона (как в карточках)
    const normalize = (value: number, min: number, max: number): number => {
      if (max === min) return value >= max ? 1 : 0
      const N = Math.max(0, Math.min(1, (value - min) / (max - min)))
      return isNaN(N) ? 0 : N
    }
    
    const normalizedSignal = normalize(signal, minSignal, maxSignal)
    
    // Интерполяция между минимальным и максимальным цветом сигнала (как в карточках)
    const minColor = hexToRgb(signalMinColor)
    const maxColor = hexToRgb(signalMaxColor)
    
    const r = Math.round(minColor.r + (maxColor.r - minColor.r) * normalizedSignal)
    const g = Math.round(minColor.g + (maxColor.g - minColor.g) * normalizedSignal)
    const b = Math.round(minColor.b + (maxColor.b - minColor.b) * normalizedSignal)
    
    return `rgb(${r}, ${g}, ${b})`
  }

  // Функция для получения цвета текста номера по сложности (как в карточках)
  const getTextColor = (paragraph: any) => {
    const complexity = paragraph.metrics.complexity || 0
    
    // Находим глобальные минимум и максимум сложности среди всех параграфов
    const allComplexity = paragraphs.map(p => p.metrics.complexity || 0)
    const minComplexity = Math.min(...allComplexity)
    const maxComplexity = Math.max(...allComplexity)
    
    // Нормализация относительно глобального диапазона (как в карточках)
    const normalize = (value: number, min: number, max: number): number => {
      if (max === min) return value >= max ? 1 : 0
      const N = Math.max(0, Math.min(1, (value - min) / (max - min)))
      return isNaN(N) ? 0 : N
    }
    
    const normalizedComplexity = normalize(complexity, minComplexity, maxComplexity)
    
    // Интерполяция между минимальным и максимальным цветом сложности
    const minColor = hexToRgb(complexityMinColor)
    const maxColor = hexToRgb(complexityMaxColor)
    
    const r = Math.round(minColor.r + (maxColor.r - minColor.r) * normalizedComplexity)
    const g = Math.round(minColor.g + (maxColor.g - minColor.g) * normalizedComplexity)
    const b = Math.round(minColor.b + (maxColor.b - minColor.b) * normalizedComplexity)
    
    return `rgb(${r}, ${g}, ${b})`
  }

  // Находим глобальные минимум и максимум среди всех параграфов
  const allSignals = paragraphs.map(p => p.metrics.signal_strength || 0)
  const minSignal = Math.min(...allSignals)
  const maxSignal = Math.max(...allSignals)

  return (
    <div style={{
      padding: '12px',
      backgroundColor: '#f9fafb',
      borderRadius: '6px',
      border: '1px solid #e5e7eb'
    }}>
      <h4 style={{ 
        margin: '0 0 8px 0', 
        fontSize: '13px', 
        fontWeight: '500', 
        color: '#374151' 
      }}>
        Карта документа
      </h4>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(20px, 1fr))',
        gap: '2px',
        maxHeight: '120px',
        overflow: 'hidden'
      }}>
        {paragraphs.map((paragraph) => {
          const signal = paragraph.metrics.signal_strength || 0
          
          // Цвет кубика точно такой же как у карточки
          const cubeColor = getHeatMapColor(paragraph)
          
          // Цвет номера такой же как цвет текста в карточке
          const numberColor = getTextColor(paragraph)
          
          const isSelected = selectedParagraphId === paragraph.id
          
          return (
            <div
              key={paragraph.id}
              onClick={() => onParagraphClick(typeof paragraph.id === 'string' ? parseInt(paragraph.id) : paragraph.id)}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: cubeColor,
                border: isSelected ? '2px solid #7c3aed' : '1px solid #d1d5db',
                borderRadius: '3px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              title={`Параграф #${paragraph.id}\nСигнал: ${signal.toFixed(2)}\n${paragraph.metrics.semantic_function || 'Функция не определена'}`}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.1)'
                e.currentTarget.style.zIndex = '10'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.zIndex = '1'
              }}
            >
              {/* Номер параграфа */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '8px',
                fontWeight: '500',
                color: numberColor,
                pointerEvents: 'none'
              }}>
                {paragraph.id}
              </div>
            </div>
          )
        })}
      </div>
      
      <div style={{ 
        fontSize: '10px', 
        color: '#6b7280', 
        marginTop: '8px',
        textAlign: 'center'
      }}>
        Нажмите на блок для перехода к карточке
      </div>
    </div>
  )
} 
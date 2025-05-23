import React from 'react'
import { useAppStore } from '../../../store/appStore'

export const CardSettingsPanel: React.FC = () => {
  const {
    fontSize,
    fontFamily,
    signalMinColor,
    signalMaxColor,
    complexityMinColor,
    complexityMaxColor,
    updateSettings
  } = useAppStore()

  const fontOptions = [
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Times New Roman, serif', label: 'Times New Roman' },
    { value: 'Helvetica, sans-serif', label: 'Helvetica' },
    { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
    { value: 'JetBrains Mono, monospace', label: 'JetBrains Mono' },
    { value: 'Source Code Pro, monospace', label: 'Source Code Pro' }
  ]

  return (
    <div style={{
      padding: '12px',
      backgroundColor: '#f9fafb',
      borderRadius: '6px',
      border: '1px solid #e5e7eb'
    }}>
      <h4 style={{ 
        margin: '0 0 12px 0', 
        fontSize: '13px', 
        fontWeight: '500', 
        color: '#374151' 
      }}>
        Настройки карточек
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Размер шрифта */}
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Размер шрифта (pt)
          </label>
          <select
            value={fontSize}
            onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}
          >
            <option value={8}>8 pt</option>
            <option value={9}>9 pt</option>
            <option value={10}>10 pt</option>
            <option value={11}>11 pt</option>
            <option value={12}>12 pt</option>
            <option value={13}>13 pt</option>
            <option value={14}>14 pt</option>
            <option value={15}>15 pt</option>
            <option value={16}>16 pt</option>
            <option value={18}>18 pt</option>
            <option value={20}>20 pt</option>
            <option value={22}>22 pt</option>
            <option value={24}>24 pt</option>
          </select>
        </div>

        {/* Семейство шрифтов */}
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Шрифт
          </label>
          <select
            value={fontFamily}
            onChange={(e) => updateSettings({ fontFamily: e.target.value })}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}
          >
            {fontOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Цвета сигнала */}
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Цвета сигнала (цвет фона)
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              <span style={{ fontSize: '10px', color: '#6b7280' }}>Минимум</span>
              <input
                type="color"
                value={signalMinColor}
                onChange={(e) => updateSettings({ signalMinColor: e.target.value })}
                style={{
                  width: '100%',
                  height: '28px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>→</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              <span style={{ fontSize: '10px', color: '#6b7280' }}>Максимум</span>
              <input
                type="color"
                value={signalMaxColor}
                onChange={(e) => updateSettings({ signalMaxColor: e.target.value })}
                style={{
                  width: '100%',
                  height: '28px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        </div>

        {/* Цвета сложности */}
        <div>
          <label style={{ 
            display: 'block', 
            fontSize: '12px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Цвета сложности (цвет текста)
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              <span style={{ fontSize: '10px', color: '#6b7280' }}>Минимум</span>
              <input
                type="color"
                value={complexityMinColor}
                onChange={(e) => updateSettings({ complexityMinColor: e.target.value })}
                style={{
                  width: '100%',
                  height: '28px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>→</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              <span style={{ fontSize: '10px', color: '#6b7280' }}>Максимум</span>
              <input
                type="color"
                value={complexityMaxColor}
                onChange={(e) => updateSettings({ complexityMaxColor: e.target.value })}
                style={{
                  width: '100%',
                  height: '28px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        </div>

        {/* Кнопка сброса настроек */}
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => updateSettings({
              fontSize: 12,
              fontFamily: 'Arial, sans-serif',
              signalMinColor: '#FFFFFF',
              signalMaxColor: '#FFDB58',
              complexityMinColor: '#00FF00',
              complexityMaxColor: '#FF0000'
            })}
            style={{
              width: '100%',
              padding: '6px 12px',
              fontSize: '11px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          >
            🔄 Сбросить настройки
          </button>
        </div>
      </div>
    </div>
  )
} 
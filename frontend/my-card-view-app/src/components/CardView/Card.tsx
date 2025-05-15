import React from 'react';
import type { ParagraphData } from './types';

interface CardProps {
  paragraph: ParagraphData;
  minSignal: number;
  maxSignal: number;
  minComplexity: number;
  maxComplexity: number;
  fontSize: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  isEditing: boolean;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEditing: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMergeDown: () => void;
}

// Вспомогательная функция для парсинга HEX в RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const Card: React.FC<CardProps> = ({
  paragraph,
  minSignal,
  maxSignal,
  minComplexity,
  maxComplexity,
  fontSize,
  signalMinColor,
  signalMaxColor,
  complexityMinColor,
  complexityMaxColor,
  isEditing,
  editingText,
  onEditingTextChange,
  onStartEditing,
  onSave,
  onCancel,
  isSaving,
  isFirst,
  isLast,
  onMergeDown
}) => {
  // Функция для линейной интерполяции между двумя значениями
  const lerp = (start: number, end: number, t: number) => {
    return Math.round(start * (1 - t) + end * t);
  };

  const normalize = (value: number, min: number, max: number): number => {
    if (max === min) return value >= max ? 1 : 0;
    const N = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return isNaN(N) ? 0 : N;
  };

  const normalizedSignal = normalize(paragraph.metrics.signal_strength || 0, minSignal, maxSignal);
  const normalizedComplexity = normalize(paragraph.metrics.complexity || 0, minComplexity, maxComplexity);

  const getBackgroundColor = () => {
    const startColor = hexToRgb(signalMinColor) || { r: 255, g: 255, b: 255 }; // Default white
    const endColor = hexToRgb(signalMaxColor) || { r: 255, g: 219, b: 88 };   // Default mustard
    
    const r = lerp(startColor.r, endColor.r, normalizedSignal);
    const g = lerp(startColor.g, endColor.g, normalizedSignal);
    const b = lerp(startColor.b, endColor.b, normalizedSignal);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getTextColor = () => {
    const startColor = hexToRgb(complexityMinColor) || { r: 0, g: 128, b: 0 };   // Default green
    const endColor = hexToRgb(complexityMaxColor) || { r: 255, g: 0, b: 0 };     // Default red

    const r = lerp(startColor.r, endColor.r, normalizedComplexity);
    const g = lerp(startColor.g, endColor.g, normalizedComplexity);
    const b = lerp(startColor.b, endColor.b, normalizedComplexity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '1px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden', // Чтобы контент не выходил за пределы закругленных углов
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    padding: '1px 15px',
    fontSize: fontSize,
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    padding: '6px 15px',
    borderBottom: '1px solid #eee',
    fontSize: `calc(${fontSize} * 0.75)`,
    color: '#555',
    textAlign: 'left' as const,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'space-between'
  };

  const textStyle: React.CSSProperties = {
    lineHeight: '1.2',
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
    margin: '0 0 5px 0',
    padding: 0
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: `calc(${fontSize} * 0.7)`,
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px',
    lineHeight: '1'
  };

  const saveButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#5cb85c',
    color: 'white',
    borderColor: '#4cae4c'
  };
  
  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '100px',
    padding: '8px',
    fontSize: fontSize,
    lineHeight: '1.5',
    fontFamily: 'inherit',
    border: '1px solid #ccc',
    borderRadius: '4px',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '10px'
  };

  const mergeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '24px',
    height: '24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#333',
    zIndex: 2,
    boxShadow: '0 0 4px rgba(0,0,0,0.1)'
  };

  return (
    <div style={{ position: 'relative', marginBottom: '1px' }}>
      <div style={cardStyle}>
        {/* Информация об анализе (верхняя часть с белым фоном) */}
        <div style={headerStyle}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            gap: '6px',
            flex: '1'
          }}>
            <div>ID: {paragraph.id}</div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>Сигнал:</span>
              <div style={{ 
                width: '60px', 
                height: '6px', 
                backgroundColor: '#e9ecef',
                borderRadius: '3px',
                overflow: 'hidden',
                display: 'inline-block'
              }}>
                <div 
                  title={`Сигнал: ${(paragraph.metrics.signal_strength ?? 0).toFixed(3)}`} 
                  style={{ 
                    width: `${normalizedSignal * 100}%`, 
                    height: '100%', 
                    backgroundColor: signalMaxColor,
                    transition: 'width 0.3s ease-in-out'
                  }} 
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>Сложность:</span>
              <div style={{ 
                width: '60px', 
                height: '6px', 
                backgroundColor: '#e9ecef',
                borderRadius: '3px',
                overflow: 'hidden',
                display: 'inline-block'
              }}>
                <div 
                  title={`Сложность: ${(paragraph.metrics.complexity ?? 0).toFixed(3)}`} 
                  style={{ 
                    width: `${normalizedComplexity * 100}%`, 
                    height: '100%', 
                    backgroundColor: complexityMaxColor,
                    transition: 'width 0.3s ease-in-out'
                  }} 
                />
              </div>
            </div>
            
            <div>
              Семантика: {paragraph.metrics.semantic_function || 'Не определено'}
              {paragraph.metrics.semantic_error && <span style={{color: 'red', marginLeft: '5px'}}>(Ошибка: {paragraph.metrics.semantic_error})</span>}
            </div>
          </div>
          
          {/* Кнопка "Редактировать" */}
          {!isEditing && (
            <button 
              onClick={onStartEditing}
              style={buttonStyle}
              title="Редактировать текст абзаца"
            >
              Редактировать
            </button>
          )}
        </div>

        {/* Основное содержимое с цветным фоном */}
        <div style={contentStyle}>
          {isEditing ? (
            <div>
              <textarea
                value={editingText}
                onChange={(e) => onEditingTextChange(e.target.value)}
                style={textareaStyle}
                aria-label="Редактирование текста абзаца"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: `calc(${fontSize} * 0.7)`, color: '#666', fontStyle: 'italic' }}>
                  Совет: Добавьте двойной перенос строки (пустую строку), чтобы разделить абзац на два.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    onClick={onCancel}
                    disabled={isSaving}
                    style={buttonStyle}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={onSave}
                    disabled={isSaving}
                    style={saveButtonStyle}
                  >
                    {isSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p style={textStyle}>{paragraph.text}</p>
          )}
        </div>
      </div>

      {!isLast && !isEditing && (
        <div 
          onClick={onMergeDown}
          style={{ ...mergeButtonStyle, bottom: '-12px' }}
          title="Объединить со следующим абзацем"
        >
          +
        </div>
      )}
    </div>
  );
};

export default Card;

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
  isSaving
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
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    fontSize: fontSize,
  };

  const metaInfoStyle: React.CSSProperties = {
    fontSize: `calc(${fontSize} * 0.8)`,
    color: '#555',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap'
  };

  const textStyle: React.CSSProperties = {
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: `calc(${fontSize} * 0.75)`,
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px'
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

  return (
    <div style={cardStyle}>
      <div style={metaInfoStyle}>
        <div>
          ID: {paragraph.id} | 
          Сигнал: {(paragraph.metrics.signal_strength ?? 0).toFixed(3)} | 
          Сложность: {(paragraph.metrics.complexity ?? 0).toFixed(3)} | 
          Семантика: {paragraph.metrics.semantic_function || 'Не определено'}
          {paragraph.metrics.semantic_error && <span style={{color: 'red', marginLeft: '5px'}}>(Ошибка: {paragraph.metrics.semantic_error})</span>}
        </div>
        
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
      
      {isEditing ? (
        <div>
          <textarea
            value={editingText}
            onChange={(e) => onEditingTextChange(e.target.value)}
            style={textareaStyle}
            aria-label="Редактирование текста абзаца"
          />
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
      ) : (
        <p style={textStyle}>{paragraph.text}</p>
      )}

      {/* Визуальные индикаторы метрик */} 
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: '15px',
        fontSize: `calc(${fontSize} * 0.7)`,
        color: '#555'
      }}>
        <div>
          <div style={{ marginBottom: '2px' }}>Сигнал:</div>
          <div style={{ 
            width: '100px', 
            height: '8px', 
            backgroundColor: '#e9ecef',
            borderRadius: '4px',
            overflow: 'hidden' 
          }}>
            <div title={`Сигнал: ${(paragraph.metrics.signal_strength ?? 0).toFixed(3)}`} style={{ 
              width: `${normalizedSignal * 100}%`, 
              height: '100%', 
              backgroundColor: signalMaxColor,
              transition: 'width 0.3s ease-in-out'
            }} />
          </div>
        </div>
        
        <div>
          <div style={{ marginBottom: '2px' }}>Сложность:</div>
          <div style={{ 
            width: '100px', 
            height: '8px', 
            backgroundColor: '#e9ecef',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div title={`Сложность: ${(paragraph.metrics.complexity ?? 0).toFixed(3)}`} style={{ 
              width: `${normalizedComplexity * 100}%`, 
              height: '100%', 
              backgroundColor: complexityMaxColor,
              transition: 'width 0.3s ease-in-out'
            }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Card;

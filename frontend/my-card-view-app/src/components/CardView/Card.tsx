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
}) => {
  // Функция для линейной интерполяции между двумя значениями
  const lerp = (start: number, end: number, t: number) => {
    return Math.round(start * (1 - t) + end * t);
  };

  const normalize = (value: number, min: number, max: number): number => {
    if (max === min) { // Если все значения одинаковы, вернуть 0.5 для среднего цвета
      return 0.5;
    }
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };

  const normalizedSignal = normalize(paragraph.signal_strength, minSignal, maxSignal);
  const normalizedComplexity = normalize(paragraph.complexity, minComplexity, maxComplexity);

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
    padding: '15px 15px 5px 15px',
    margin: '10px 0',
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    fontFamily: 'Arial, sans-serif',
  };

  // Стиль для объединенной строки метаинформации
  const metaInfoStyle: React.CSSProperties = {
    fontSize: `calc(${fontSize} * 0.76)`,
    opacity: 1,      
    marginBottom: '8px',
    color: '#000000',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #dddddd',
    paddingBottom: '5px',
    paddingTop: '3px',
    paddingLeft: '5px',
    paddingRight: '5px',
    borderRadius: '4px',
  };

  const textStyle: React.CSSProperties = {
    fontSize: fontSize,
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    marginTop: '8px', 
  };

  return (
    <div style={cardStyle}>
      <div style={metaInfoStyle}>
        ID: {paragraph.paragraph_id} | Сигнал: {paragraph.signal_strength.toFixed(3)} | Сложность: {paragraph.complexity.toFixed(3)} | Семантика: {paragraph.semantic_function || 'Нет'}
      </div>
      <p style={textStyle}>{paragraph.text}</p>
    </div>
  );
};

export default Card;

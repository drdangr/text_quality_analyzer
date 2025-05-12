import React from 'react';
import { ParagraphData } from './types';

interface CardProps {
  paragraph: ParagraphData;
}

const Card: React.FC<CardProps> = ({ paragraph }) => {
  // Упрощенная логика для определения цвета фона и текста
  // TODO: Сделать эту логику более гибкой и настраиваемой
  const getBackgroundColor = () => {
    if (paragraph.signal_strength > 0.85) return '#e6fffa'; // Светло-бирюзовый
    if (paragraph.signal_strength > 0.75) return '#fffbea'; // Светло-желтый
    if (paragraph.signal_strength > 0.65) return '#f0f0f0'; // Светло-серый
    return 'white'; // По умолчанию белый
  };

  const getTextColor = () => {
    if (paragraph.complexity > 0.8) return '#7A0000'; // Темно-красный
    if (paragraph.complexity > 0.6) return '#A52A2A'; // Коричневый
    return 'black'; // По умолчанию черный
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    margin: '10px 0',
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    fontFamily: 'Arial, sans-serif', // Базовый шрифт
  };

  const idStyle: React.CSSProperties = {
    fontSize: '0.85em',
    opacity: 0.8,
    marginBottom: '5px',
    color: getTextColor() === 'black' ? '#555' : getTextColor(), // Делаем ID чуть светлее основного текста если основной черный
  };

  const textStyle: React.CSSProperties = {
    fontSize: '1em',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap', // Сохраняет переносы строк из текста
  };

  const statsStyle: React.CSSProperties = {
    fontSize: '0.9em',
    marginTop: '10px',
    opacity: 0.9,
    borderTop: '1px solid #eee',
    paddingTop: '8px',
  };

  return (
    <div style={cardStyle}>
      <div style={idStyle}>
        ID: {paragraph.paragraph_id}
      </div>
      <p style={textStyle}>{paragraph.text}</p>
      <div style={statsStyle}>
        Signal: {paragraph.signal_strength.toFixed(3)} | Complexity: {paragraph.complexity.toFixed(3)}
      </div>
    </div>
  );
};

export default Card; 
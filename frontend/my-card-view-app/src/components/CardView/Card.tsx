import React, { useRef, useEffect, useState } from 'react';
import type { ParagraphData } from './types';
import SemanticIcon from './SemanticIcon';
import { useAppStore } from '../../store/appStore';

interface CardProps {
  paragraph: ParagraphData;
  minSignal: number;
  maxSignal: number;
  minComplexity: number;
  maxComplexity: number;
  fontSize: string;
  fontFamily: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  onDeleteRequest: (paragraphId: number) => void;
  getCardColor: (paragraph: ParagraphData) => string;
  getHeaderTextColor: (paragraph: ParagraphData) => string;
  getEditingControlsTextColor: (paragraph: ParagraphData) => string;
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
  fontFamily,
  complexityMinColor,
  complexityMaxColor,
  onDeleteRequest,
  getCardColor,
  getHeaderTextColor,
  getEditingControlsTextColor
}) => {
  const { updateParagraph } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const cardContentBgColor = getCardColor(paragraph);

  // Функция для определения цвета текста абзаца на основе его сложности
  const getParagraphContentTextColor = () => {
    const startColor = hexToRgb(complexityMinColor) || { r: 0, g: 128, b: 0 };
    const endColor = hexToRgb(complexityMaxColor) || { r: 255, g: 0, b: 0 };
    const r = lerp(startColor.r, endColor.r, normalizedComplexity);
    const g = lerp(startColor.g, endColor.g, normalizedComplexity);
    const b = lerp(startColor.b, endColor.b, normalizedComplexity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getTextAreaTextColor = () => {
    const rgb = cardContentBgColor.match(/\d+/g)?.map(Number);
    if (!rgb) return '#222222'; 
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#222222' : '#f0f0f0'; 
  };

  // Новая функция для цвета прогресс-бара сложности
  const getComplexityBarColor = () => {
    const startColor = hexToRgb(complexityMinColor) || { r: 0, g: 128, b: 0 }; 
    const endColor = hexToRgb(complexityMaxColor) || { r: 255, g: 0, b: 0 };   
    const r = lerp(startColor.r, endColor.r, normalizedComplexity);
    const g = lerp(startColor.g, endColor.g, normalizedComplexity);
    const b = lerp(startColor.b, endColor.b, normalizedComplexity);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const headerTextColor = getHeaderTextColor(paragraph);
  const editingControlsTextColor = getEditingControlsTextColor(paragraph);
  const paragraphTextColor = getParagraphContentTextColor();

  // Начало редактирования
  const startEditing = () => {
    setIsEditing(true);
    setEditingText(paragraph.text);
  };

  // Сохранение изменений
  const saveChanges = () => {
    updateParagraph(paragraph.id, editingText);
    setIsEditing(false);
  };

  // Отмена редактирования
  const cancelEditing = () => {
    setIsEditing(false);
    setEditingText('');
  };

  // Обработка горячих клавиш
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      saveChanges();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  // Автоматическая высота textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [isEditing, editingText]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditingText(newText);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const cardWrapperStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '1px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden', 
    backgroundColor: cardContentBgColor, // Используем вычисленный фон контента
    transition: 'height 0.3s ease-in-out'
  };

  const contentContainerStyle: React.CSSProperties = { 
    padding: '1px 15px',
    fontSize: fontSize,
    fontFamily: fontFamily,
    color: paragraphTextColor, 
    // backgroundColor теперь устанавливается в cardWrapperStyle
  };

  const headerStyle: React.CSSProperties = {
    position: 'relative',
    backgroundColor: 'rgba(248, 246, 246, 0.7)', 
    padding: '3px 15px',
    borderBottom: '1px solid rgba(238, 238, 238, 0.7)',
    fontSize: `calc(${fontSize} * 0.75)`,
    fontFamily: fontFamily,
    color: headerTextColor, // Используем фиксированный цвет для шапки
    textAlign: 'left' as const,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'space-between',
    minHeight: '22px'
  };

  const textStyle: React.CSSProperties = {
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
    margin: '10px 0',
    padding: 0,
    minHeight: '20px',
    fontFamily: fontFamily,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: `calc(${fontSize} * 0.75)`,
    fontFamily: fontFamily,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    // Граница кнопки адаптируется к цвету текста на кнопке (editingControlsTextColor)
    border: `1px solid ${editingControlsTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.5)': 'rgba(0,0,0,0.2)'}`,
    color: editingControlsTextColor, // Кнопки в режиме редактирования используют этот цвет
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px',
    lineHeight: '1.2'
  };

  const saveButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'rgba(92, 184, 92, 0.7)',
    // borderColor для saveButton также должен адаптироваться к editingControlsTextColor
    borderColor: editingControlsTextColor === '#FFFFFF' ? 'rgba(76, 174, 76, 0.7)' : 'rgba(76, 174, 76, 0.5)', 
  };
  
  const editingControlsStyle: React.CSSProperties = {
    marginTop: '15px',
    paddingTop: '10px',
    borderTop: `1px solid ${editingControlsTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)': 'rgba(0,0,0,0.1)'}`
  };

  const hintTextStyle: React.CSSProperties = {
    fontSize: `calc(${fontSize} * 0.75)`,
    fontFamily: fontFamily,
    fontStyle: 'italic',
    opacity: 0.8,
    marginBottom: '10px',
    color: editingControlsTextColor // Подсказка использует цвет элементов управления редактированием
  };
  
  const deleteButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '4px',
    right: '8px',
    background: 'none',
    border: 'none',
    color: headerTextColor, // Кнопка удаления в шапке использует цвет текста шапки
    fontSize: `calc(${fontSize} * 1.3)`,
    fontFamily: fontFamily,
    cursor: 'pointer',
    padding: '0px 2px',
    lineHeight: '1',
    opacity: 0.6,
    transition: 'opacity 0.2s ease',
    zIndex: 20 
  };
  
  // Определяем paddingLeft для основного блока с информацией в шапке
  // Это значение должно быть достаточным, чтобы вместить иконку перетаскивания и кнопку X, когда они видимы
  // Иконка перетаскивания (⋮⋮) примерно 10-12px + отступ, кнопка X еще ~15px. Возьмем с запасом.
  const headerInfoPaddingLeft = '30px'; // Фиксированный отступ

  return (
    <div style={{ position: 'relative', marginBottom: '1px' }}>
      <div style={cardWrapperStyle}> 
        <div style={headerStyle}>
          {!isEditing && (
            <button 
              style={deleteButtonStyle}
              onClick={(e) => { 
                e.stopPropagation(); 
                onDeleteRequest(paragraph.id);
              }}
              title="Удалить абзац"
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
              ×
            </button>
          )}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            gap: '6px',
            flex: '1',
            paddingLeft: headerInfoPaddingLeft, // Используем фиксированный отступ
            height: '100%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>ID: {paragraph.id}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', height: '100%' }}>Сигнал:</span>
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
                    backgroundColor: cardContentBgColor, // Используем основной фон контента
                    transition: 'width 0.3s ease-in-out'
                  }} 
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', height: '100%' }}>Сложность:</span>
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
                    backgroundColor: getComplexityBarColor(),
                    transition: 'width 0.3s ease-in-out'
                  }} 
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', height: '100%', fontWeight: 'bold' }}>Семантика:</span>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                backgroundColor: 'transparent', 
                padding: '0', 
                borderRadius: '0', 
                border: 'none'
              }}>
                {paragraph.metrics.semantic_function ? (
                  <>
                    <SemanticIcon semanticFunction={paragraph.metrics.semantic_function} size={18} />
                    <span style={{ color: headerTextColor }}>{paragraph.metrics.semantic_function}</span> {/* Текст семантики в шапке использует headerTextColor */}
                  </>
                ) : (
                  <span style={{color: headerTextColor}}>Не определено</span>
                )}
                {paragraph.metrics.semantic_error && <span style={{color: 'red', marginLeft: '5px'}}>(Ошибка: {paragraph.metrics.semantic_error})</span>}
              </div>
            </div>
          </div>
        </div>

        <div 
          style={contentContainerStyle} 
          onClick={!isEditing ? startEditing : undefined}
          role={!isEditing ? "button" : undefined}
          aria-label={!isEditing ? "Нажмите для редактирования" : undefined}
        >
          {isEditing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: fontSize,
                  fontFamily: fontFamily,
                  lineHeight: '1.5',
                  border: `1px solid ${editingControlsTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.3)': 'rgba(0,0,0,0.1)'}`,
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                  marginBottom: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: getTextAreaTextColor(), 
                  resize: 'none',
                  overflowY: 'hidden',
                  transition: 'height 0.2s ease-out'
                }}
                aria-label="Редактирование текста абзаца"
                rows={1}
              />
              <div style={editingControlsStyle}>
                <div style={hintTextStyle}>
                  Совет: Добавьте двойной перенос строки (пустую строку), чтобы разделить абзац на два.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    onClick={cancelEditing}
                    style={buttonStyle}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveChanges}
                    style={saveButtonStyle}
                    title={editingText.trim() === '' ? "Сохранение пустого абзаца приведет к его удалению" : "Сохранить изменения"}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p style={textStyle}>{paragraph.text || ' '} </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Card;

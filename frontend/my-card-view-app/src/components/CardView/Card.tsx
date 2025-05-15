import React, { useRef, useEffect, useState } from 'react';
import type { ParagraphData } from './types';
import SemanticIcon from './SemanticIcon';

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
  onDeleteRequest: (paragraphId: number) => void;
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
  onMergeDown,
  onDeleteRequest
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
    const baseBgColor = getBackgroundColor();
    // Определяем яркость фона (простой способ)
    const rgb = baseBgColor.match(/\d+/g)?.map(Number);
    if (!rgb) return '#000000'; // Черный по умолчанию, если парсинг не удался
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    // Если фон светлый (яркость > 128), используем темный текст, иначе светлый
    return brightness > 128 ? '#333333' : '#FFFFFF';
  };
  
  const getTextAreaTextColor = () => {
    const baseBgColor = getBackgroundColor();
    const rgb = baseBgColor.match(/\d+/g)?.map(Number);
    if (!rgb) return '#000000'; 
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 128 ? '#222222' : '#f0f0f0'; // Чуть менее контрастный для textarea
  };

  const cardWrapperStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '1px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden', 
    backgroundColor: getBackgroundColor(), // Применяем фон сюда
    transition: 'height 0.3s ease-in-out' // Плавный переход для высоты
  };

  const contentContainerStyle: React.CSSProperties = { // Новый контейнер для внутреннего контента
    padding: '1px 15px',
    fontSize: fontSize,
    color: getTextColor(), // Цвет текста для всего содержимого
    transition: 'opacity 0.3s ease-in-out', // Плавное появление/исчезновение контента
  };

  const headerStyle: React.CSSProperties = {
    position: 'relative', // Для позиционирования кнопки удаления
    backgroundColor: 'rgba(248, 246, 246, 0.7)', // Слегка прозрачный для сохранения цвета фона
    padding: '3px 15px',
    borderBottom: '1px solid rgba(238, 238, 238, 0.7)',
    fontSize: `calc(${fontSize} * 0.75)`,
    color: getTextColor(), // Адаптируем цвет текста заголовка
    textAlign: 'left' as const,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'space-between',
    minHeight: '22px'
  };

  const textStyle: React.CSSProperties = {
    lineHeight: '1.4', // Немного увеличим для читаемости
    whiteSpace: 'pre-wrap',
    textAlign: 'left',
    margin: '10px 0', // Добавим отступы
    padding: 0,
    minHeight: '20px', // Минимальная высота для пустого абзаца
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px', // Немного увеличим кнопки
    fontSize: `calc(${fontSize} * 0.75)`,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Полупрозрачный белый
    border: `1px solid ${getTextColor() === '#FFFFFF' ? 'rgba(255,255,255,0.5)': 'rgba(0,0,0,0.2)'}`,
    color: getTextColor(),
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px',
    lineHeight: '1.2'
  };

  const saveButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'rgba(92, 184, 92, 0.7)', // Полупрозрачный зеленый
    borderColor: 'rgba(76, 174, 76, 0.7)',
  };
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Сброс высоты перед пересчетом
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, editingText]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onEditingTextChange(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    fontSize: fontSize,
    lineHeight: '1.5',
    fontFamily: 'inherit',
    border: `1px solid ${getTextColor() === '#FFFFFF' ? 'rgba(255,255,255,0.3)': 'rgba(0,0,0,0.1)'}`,
    borderRadius: '4px',
    boxSizing: 'border-box',
    marginBottom: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Очень легкий полупрозрачный фон
    color: getTextAreaTextColor(), // Используем специальный цвет для textarea
    resize: 'none', // Убираем стандартный ресайз
    overflowY: 'hidden', // Скрываем скроллбар, так как высота будет динамической
    transition: 'height 0.2s ease-out' // Плавное изменение высоты самой textarea
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
    zIndex: 5,
    boxShadow: '0 0 4px rgba(0,0,0,0.1)'
  };

  const editingControlsStyle: React.CSSProperties = {
    marginTop: '15px',
    paddingTop: '10px',
    borderTop: `1px solid ${getTextColor() === '#FFFFFF' ? 'rgba(255,255,255,0.2)': 'rgba(0,0,0,0.1)'}` // Разделитель
  };

  const hintTextStyle: React.CSSProperties = {
    fontSize: `calc(${fontSize} * 0.75)`,
    fontStyle: 'italic',
    opacity: 0.8, // Слегка приглушаем
    marginBottom: '10px',
    color: getTextColor() // Используем основной цвет текста карточки
  };
  
  const deleteButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '4px',       // Скорректировано
    right: '8px',      // Скорректировано
    background: 'none',
    border: 'none',
    color: getTextColor(),
    fontSize: `calc(${fontSize} * 1.3)`,
    cursor: 'pointer',
    padding: '0px 2px', // Скорректировано
    lineHeight: '1',
    opacity: 0.6,
    transition: 'opacity 0.2s ease',
    zIndex: 20 // Увеличено
  };

  return (
    <div style={{ position: 'relative', marginBottom: '1px' }}>
      <div style={cardWrapperStyle}> {/* Общая обертка с фоном и переходом высоты */}
        <div style={headerStyle}>
          {/* Кнопка удаления */} 
          {!isEditing && (
            <button 
              style={deleteButtonStyle}
              onClick={(e) => { 
                e.stopPropagation(); // Предотвращаем всплытие до onClick={onStartEditing}
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
            paddingLeft: isEditing ? '30px' : '15px',
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
                    backgroundColor: getBackgroundColor(), // Этот фон должен быть равен фону карточки
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
                    backgroundColor: getTextColor(), // Этот фон должен быть равен цвету текста карточки
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
                    <SemanticIcon semanticFunction={paragraph.metrics.semantic_function} size={18} /> {/* Уменьшил размер иконки */}
                    <span style={{ color: getTextColor() }}>{paragraph.metrics.semantic_function}</span>
                  </>
                ) : (
                  <span style={{color: getTextColor()}}>Не определено</span>
                )}
                {paragraph.metrics.semantic_error && <span style={{color: 'red', marginLeft: '5px'}}>(Ошибка: {paragraph.metrics.semantic_error})</span>}
              </div>
            </div>
          </div>
        </div>

        <div 
          style={contentContainerStyle} 
          onClick={!isEditing ? onStartEditing : undefined}
          role={!isEditing ? "button" : undefined}
          aria-label={!isEditing ? "Нажмите для редактирования" : undefined}
        >
          {isEditing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={handleTextareaChange}
                style={textareaStyle}
                aria-label="Редактирование текста абзаца"
                rows={1} // Для начального рендеринга, чтобы JS мог определить высоту
              />
              <div style={editingControlsStyle}>
                <div style={hintTextStyle}>
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
                    disabled={isSaving} // Кнопка "Сохранить" активна всегда, кроме состояния isSaving
                    style={isSaving ? {...saveButtonStyle, opacity: 0.5, cursor: 'not-allowed'} : saveButtonStyle}
                    title={editingText.trim() === '' ? "Сохранение пустого абзаца приведет к его удалению" : "Сохранить изменения"}
                  >
                    {isSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p style={textStyle}>{paragraph.text || ' '} {/* Добавил пробел для пустых абзацев, чтобы min-height работал*/}</p>
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

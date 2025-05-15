import React, { useEffect, useState, useMemo, useRef } from 'react';
import Card from './Card';
import DraggableCardList from './DraggableCardList';
import type { ParagraphData, AnalysisResponse } from './types'; // Используем AnalysisResponse
import { updateParagraph, refreshFullSemanticAnalysis, mergeParagraphs, splitParagraph, fetchAnalysis, reorderParagraphs, updateTopic } from '../../api';

// Типы для сортировки и фильтрации
type SortField = 'id' | 'signal_strength' | 'complexity' | 'semantic_function'; // id вместо paragraph_id
type SortDirection = 'asc' | 'desc';

// Цвета по умолчанию (можно вынести в константы или настройки)
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"; 
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"; 
const DEFAULT_COMPLEXITY_MIN_COLOR = "#00FF00"; // Зеленый
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"; // Красный

interface CardListProps {
  initialSession: AnalysisResponse;
  onReset: () => void;
  isSemanticAnalysisUpToDate: boolean;
  markSemanticsAsStale: () => void;
  onSemanticRefresh: (updatedSession: AnalysisResponse) => void;
  // setLoadingCardList?: (loading: boolean) => void; // Пока не используем, т.к. основная загрузка в App.tsx
  // setErrorCardList?: (error: string | null) => void;
}

const CardList: React.FC<CardListProps> = ({ 
  initialSession, 
  onReset, 
  isSemanticAnalysisUpToDate, 
  markSemanticsAsStale, 
  onSemanticRefresh 
}) => {
  const [sessionData, setSessionData] = useState<AnalysisResponse>(initialSession);
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>(initialSession.paragraphs);
  
  // Состояния для UI контролов (панель управления)
  const [fontSize, setFontSize] = useState<number>(12);
  const [signalMinColor, setSignalMinColor] = useState<string>(DEFAULT_SIGNAL_MIN_COLOR);
  const [signalMaxColor, setSignalMaxColor] = useState<string>(DEFAULT_SIGNAL_MAX_COLOR);
  const [complexityMinColor, setComplexityMinColor] = useState<string>(DEFAULT_COMPLEXITY_MIN_COLOR);
  const [complexityMaxColor, setComplexityMaxColor] = useState<string>(DEFAULT_COMPLEXITY_MAX_COLOR);
  
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [semanticFilter, setSemanticFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [editingParagraphId, setEditingParagraphId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [isRefreshingSemantics, setIsRefreshingSemantics] = useState<boolean>(false);
  const [isMergingParagraphs, setIsMergingParagraphs] = useState<boolean>(false);

  // Ref для параграфов, чтобы можно было скроллить к выбранному
  const paragraphRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Состояние для редактирования темы
  const [isEditingTopic, setIsEditingTopic] = useState<boolean>(false);
  const [editingTopicText, setEditingTopicText] = useState<string>('');
  const [isSavingTopic, setIsSavingTopic] = useState<boolean>(false);

  // Обновляем состояние, если изменилась initialSession (например, после сброса и нового анализа или рефреша семантики)
  useEffect(() => {
    setSessionData(initialSession);
    setParagraphs(initialSession.paragraphs);
    document.title = initialSession.metadata.topic || "Анализ текста";
  }, [initialSession]);

  const availableSemanticFunctions = useMemo(() => {
    const functions = new Set(paragraphs.map(p => p.metrics.semantic_function || 'Не определено'));
    return ['all', ...Array.from(functions)];
  }, [paragraphs]);

  const globalSignalRange = useMemo(() => {
    if (paragraphs.length === 0) return { min: 0, max: 1 };
    const signals = paragraphs.map(p => p.metrics.signal_strength || 0);
    return { min: Math.min(...signals), max: Math.max(...signals) || 1 };
  }, [paragraphs]);

  const globalComplexityRange = useMemo(() => {
    if (paragraphs.length === 0) return { min: 0, max: 1 };
    const complexities = paragraphs.map(p => p.metrics.complexity || 0);
    return { min: Math.min(...complexities), max: Math.max(...complexities) || 1 };
  }, [paragraphs]);
  
  // Диапазоны для UI контролов, если они отличаются от глобальных
  const [uiSignalMin, setUiSignalMin] = useState<number>(globalSignalRange.min);
  const [uiSignalMax, setUiSignalMax] = useState<number>(globalSignalRange.max);
  const [uiComplexityMin, setUiComplexityMin] = useState<number>(globalComplexityRange.min);
  const [uiComplexityMax, setUiComplexityMax] = useState<number>(globalComplexityRange.max);

  useEffect(() => {
    setUiSignalMin(globalSignalRange.min);
    setUiSignalMax(globalSignalRange.max);
  }, [globalSignalRange]);

  useEffect(() => {
    setUiComplexityMin(globalComplexityRange.min);
    setUiComplexityMax(globalComplexityRange.max);
  }, [globalComplexityRange]);

  // Вспомогательная функция для парсинга HEX в RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Функция нормализации значения
  const normalize = (value: number, min: number, max: number): number => {
    if (max === min) return value >= max ? 1 : 0;
    const N = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return isNaN(N) ? 0 : N;
  };

  // Функция для получения цвета фона на основе уровня сигнала
  const getBackgroundColorForSignal = (signal: number) => {
    // Нормализуем значение сигнала
    const normalizedSignal = normalize(signal, globalSignalRange.min, globalSignalRange.max);
    
    // Получаем цвет для текущего значения сигнала
    const startColor = hexToRgb(signalMinColor) || { r: 255, g: 255, b: 255 };
    const endColor = hexToRgb(signalMaxColor) || { r: 255, g: 219, b: 88 };
    
    const r = Math.round(startColor.r * (1 - normalizedSignal) + endColor.r * normalizedSignal);
    const g = Math.round(startColor.g * (1 - normalizedSignal) + endColor.g * normalizedSignal);
    const b = Math.round(startColor.b * (1 - normalizedSignal) + endColor.b * normalizedSignal);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  const handleStartEditing = (paragraph: ParagraphData) => {
    setEditingParagraphId(paragraph.id);
    setEditingText(paragraph.text);
    setCurrentError(null); // Сбрасываем ошибку при начале редактирования
  };

  const handleCancelEditing = () => {
    setEditingParagraphId(null);
    setEditingText('');
  };

  const handleSaveEditing = async () => {
    if (editingParagraphId === null || !sessionData) return;
    
    setIsSaving(true);
    setCurrentError(null);
    try {
      const updatedParagraph = await updateParagraph(
        sessionData.metadata.session_id,
        editingParagraphId, // API ожидает paragraph_id, но у нас в ParagraphData это id
        editingText
      );
      // Обновляем локальный массив абзацев
      setParagraphs(prev => prev.map(p => 
        p.id === editingParagraphId 
          ? updatedParagraph // API возвращает обновленный ParagraphData
          : p
      ));
      setEditingParagraphId(null);
      setEditingText('');
      markSemanticsAsStale(); // Помечаем, что семантика больше не актуальна
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при сохранении изменений';
      setCurrentError(errorMsg);
      console.error('Save error:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWithSplit = async () => {
    if (editingParagraphId === null || !sessionData) return;
    
    setIsSaving(true);
    setCurrentError(null);
    
    try {
      // Проверяем, содержит ли текст двойные переносы строк
      if (editingText.includes('\n\n')) {
        // Разбиваем текст на абзацы по двойным переносам
        const paragraphs = editingText.split('\n\n').filter(p => p.trim().length > 0);
        
        if (paragraphs.length > 1) {
          // Сохраняем первый абзац в текущую карточку
          await updateParagraph(
            sessionData.metadata.session_id,
            editingParagraphId,
            paragraphs[0]
          );
          
          // Получаем актуальную версию сессии
          let updatedSession = await fetchAnalysis(sessionData.metadata.session_id);
          
          // Запрашиваем создание новых карточек через специальный эндпоинт
          // Мы используем простой подход: для каждого дополнительного абзаца
          // создаем новую карточку последовательно
          
          // Для каждого оставшегося абзаца
          for (let i = 1; i < paragraphs.length; i++) {
            try {
              // Создаем новую карточку через API - сначала вставляем пустой текст
              const tempParaIndex = editingParagraphId + i - 1;
              const tempParaId = updatedSession.paragraphs[tempParaIndex].id;
              
              // Обновляем временно параграф, добавляя разделитель и пустой текст
              await updateParagraph(
                updatedSession.metadata.session_id,
                tempParaId,
                updatedSession.paragraphs[tempParaIndex].text + '\n\n '
              );
              
              // Разделяем параграф
              updatedSession = await splitParagraph(
                updatedSession.metadata.session_id,
                tempParaId,
                updatedSession.paragraphs[tempParaIndex].text.length + 2 // +2 чтобы пропустить \n\n
              );
              
              // Обновляем новый параграф с правильным текстом
              const newParaId = tempParaId + 1;
              await updateParagraph(
                updatedSession.metadata.session_id,
                newParaId,
                paragraphs[i]
              );
              
              // Получаем обновленную сессию для следующей итерации
              updatedSession = await fetchAnalysis(updatedSession.metadata.session_id);
            } catch (error) {
              console.error(`Ошибка при создании абзаца ${i}:`, error);
            }
          }
          
          // Получаем финальную версию сессии
          const finalSession = await fetchAnalysis(sessionData.metadata.session_id);
          
          // Обновляем состояние
          setSessionData(finalSession);
          setParagraphs(finalSession.paragraphs);
          setEditingParagraphId(null);
          setEditingText('');
          markSemanticsAsStale();
        } else {
          // Если абзац только один, используем обычное сохранение
          await handleSaveEditing();
        }
      } else {
        // Если нет двойных переносов, просто сохраняем как обычно
        await handleSaveEditing();
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при разделении абзаца';
      setCurrentError(errorMsg);
      console.error('Split error:', e);
      
      // Если разделение не удалось, пробуем просто сохранить текст
      try {
        await handleSaveEditing();
      } catch (saveError) {
        console.error('Save error after split failure:', saveError);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshSemantics = async () => {
    if (!sessionData) return;
    setIsRefreshingSemantics(true);
    setCurrentError(null);
    try {
      const updatedSession = await refreshFullSemanticAnalysis(sessionData.metadata.session_id);
      onSemanticRefresh(updatedSession); // Передаем обновленную сессию в App.tsx
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при обновлении семантики';
      setCurrentError(errorMsg);
      console.error('Semantic refresh error:', e);
    } finally {
      setIsRefreshingSemantics(false);
    }
  };

  const handleMergeUp = async (index: number) => {
    if (index <= 0 || isMergingParagraphs || editingParagraphId !== null) return;
    
    setIsMergingParagraphs(true);
    setCurrentError(null);
    try {
      const updatedSession = await mergeParagraphs(
        sessionData.metadata.session_id,
        index - 1, // Предыдущий абзац
        index // Текущий абзац
      );
      
      // Обновляем все данные сессии, т.к. при слиянии меняются индексы абзацев
      setSessionData(updatedSession);
      setParagraphs(updatedSession.paragraphs);
      markSemanticsAsStale(); // Помечаем, что семантика может быть неактуальна
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при слиянии абзацев';
      setCurrentError(errorMsg);
      console.error('Merge error:', e);
    } finally {
      setIsMergingParagraphs(false);
    }
  };

  const handleMergeDown = async (index: number) => {
    if (index >= paragraphs.length - 1 || isMergingParagraphs || editingParagraphId !== null) return;
    
    setIsMergingParagraphs(true);
    setCurrentError(null);
    try {
      const updatedSession = await mergeParagraphs(
        sessionData.metadata.session_id,
        index, // Текущий абзац
        index + 1 // Следующий абзац
      );
      
      // Обновляем все данные сессии, т.к. при слиянии меняются индексы абзацев
      setSessionData(updatedSession);
      setParagraphs(updatedSession.paragraphs);
      markSemanticsAsStale(); // Помечаем, что семантика может быть неактуальна
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при слиянии абзацев';
      setCurrentError(errorMsg);
      console.error('Merge error:', e);
    } finally {
      setIsMergingParagraphs(false);
    }
  };

  const sortedAndFilteredParagraphs = useMemo(() => {
    let result = [...paragraphs];
    if (semanticFilter !== 'all') {
      result = result.filter(p => (p.metrics.semantic_function || 'Не определено') === semanticFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.text.toLowerCase().includes(query));
    }
    
    result.sort((a, b) => {
      let aValue: any = a.metrics[sortField as keyof ParagraphData["metrics"]] ?? (sortField === 'id' ? a.id : (sortField === 'semantic_function' ? 'Не определено' : 0));
      let bValue: any = b.metrics[sortField as keyof ParagraphData["metrics"]] ?? (sortField === 'id' ? b.id : (sortField === 'semantic_function' ? 'Не определено' : 0));
      
      // Специальная обработка для id
      if (sortField === 'id') {
        aValue = a.id;
        bValue = b.id;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      return sortDirection === 'asc' ? (aValue - bValue) : (bValue - aValue);
    });
    return result;
  }, [paragraphs, sortField, sortDirection, semanticFilter, searchQuery]);

  // Функция скролла к выбранной карточке
  const scrollToCard = (paragraphId: number) => {
    if (paragraphRefs.current[paragraphId]) {
      const cardElement = paragraphRefs.current[paragraphId];
      if (cardElement && contentRef.current) {
        // Вычисляем высоту закрепленной шапки и панели управления
        const headerHeight = 60; // Высота шапки
        const controlPanelHeight = 180; // Примерная высота панели управления
        const totalOffset = headerHeight + controlPanelHeight;
        
        // Вычисляем позицию для скролла, учитывая закрепленные элементы
        const topPosition = cardElement.getBoundingClientRect().top + window.pageYOffset - totalOffset;
        
        // Плавно скроллим до элемента
        window.scrollTo({
          top: topPosition,
          behavior: 'smooth'
        });
      }
    }
  };

  // Функция для начала редактирования темы
  const handleStartEditingTopic = () => {
    setIsEditingTopic(true);
    setEditingTopicText(sessionData.metadata.topic || '');
    setCurrentError(null);
  };

  // Функция для отмены редактирования темы
  const handleCancelEditingTopic = () => {
    setIsEditingTopic(false);
    setEditingTopicText('');
  };

  // Функция для сохранения изменений темы
  const handleSaveTopicEditing = async () => {
    if (!sessionData || editingTopicText.trim() === '') return;
    
    setIsSavingTopic(true);
    setCurrentError(null);
    try {
      const updatedSession = await updateTopic(
        sessionData.metadata.session_id,
        editingTopicText.trim()
      );
      
      // Обновляем данные сессии
      setSessionData(updatedSession);
      // Обновляем список параграфов для отображения обновленных метрик
      setParagraphs(updatedSession.paragraphs);
      document.title = updatedSession.metadata.topic || "Анализ текста";
      setIsEditingTopic(false);
      setEditingTopicText('');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при сохранении темы';
      setCurrentError(errorMsg);
      console.error('Save topic error:', e);
    } finally {
      setIsSavingTopic(false);
    }
  };

  // Стили (можно вынести в CSS модули или styled-components)
  const controlPanelStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' };
  const controlGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: '#555' };
  const inputStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc', width: '80px' };
  const colorInputStyle: React.CSSProperties = { ...inputStyle, width: '50px', height: '25px', padding: '2px' }; 
  const selectStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc' };

  return (
    <div style={{ maxWidth: '950px', margin: '20px auto', padding: '0 15px' }}>
      {/* Шапка с темой и кнопками */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        minHeight: '60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0',
        padding: '0 10px',
      }}>
        {isEditingTopic ? (
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: '70%' }}>
            <input
              type="text"
              value={editingTopicText}
              onChange={(e) => setEditingTopicText(e.target.value)}
              style={{
                fontSize: '1.4rem',
                padding: '5px 10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                flex: 1,
                minWidth: '300px'
              }}
              placeholder="Введите тему анализа"
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px', marginLeft: '10px' }}>
              <button
                onClick={handleCancelEditingTopic}
                disabled={isSavingTopic}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleSaveTopicEditing}
                disabled={isSavingTopic}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#5cb85c',
                  color: 'white',
                  border: '1px solid #4cae4c',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {isSavingTopic ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : (
          <h1 
            style={{ 
              fontSize: '1.6rem', 
              color: '#333', 
              margin: 0,
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
              backgroundColor: '#fff'
            }}
            onClick={handleStartEditingTopic}
            title="Нажмите для редактирования темы"
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
          >
            {sessionData.metadata.topic || "Анализ текста"}
          </h1>
        )}
        <div style={{display: 'flex', gap: '10px'}}>
          {!isSemanticAnalysisUpToDate && (
            <button 
              onClick={handleRefreshSemantics}
              disabled={isRefreshingSemantics}
              style={{ padding: '8px 15px', fontSize: '0.9rem', backgroundColor: '#5bc0de', color:'white', border:'none', borderRadius:'4px', cursor:'pointer' }}
            >
              {isRefreshingSemantics ? 'Обновление семантики...' : 'Обновить семантику всего текста'}
            </button>
          )}
          <button onClick={onReset} style={{ padding: '8px 15px', fontSize: '0.9rem', backgroundColor: '#f0ad4e', color:'white', border:'none', borderRadius:'4px', cursor:'pointer' }}>
            Новый анализ
          </button>
        </div>
      </div>

      {/* Панель управления */} 
      <div style={{
        position: 'sticky',
        top: 60,
        zIndex: 49,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        marginBottom: '20px',
        padding: '15px',
        borderRadius: '4px',
      }}>
        <div style={controlPanelStyle}>
          {/* Размер шрифта */}
          <div style={controlGroupStyle}>
            <label htmlFor="fontSizeInput" style={labelStyle}>Размер шрифта (pt):</label>
            <input id="fontSizeInput" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{...inputStyle, width: '60px'}} />
          </div>
          {/* Сигнал (цвета) */}
          <div style={controlGroupStyle}>
            <label style={labelStyle}>Настройка цветов для Сигнала</label>
            <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
              Мин: <input type="color" value={signalMinColor} onChange={e => setSignalMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сигнала" />
              Макс: <input type="color" value={signalMaxColor} onChange={e => setSignalMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сигнала" />
            </div>
          </div>
          {/* Сложность (цвета) */}
          <div style={controlGroupStyle}>
            <label style={labelStyle}>Настройка цветов для Сложности</label>
            <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
              Мин: <input type="color" value={complexityMinColor} onChange={e => setComplexityMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сложности" />
              Макс: <input type="color" value={complexityMaxColor} onChange={e => setComplexityMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сложности" />
            </div>
          </div>
          {/* Поиск по тексту */}
          <div style={controlGroupStyle}>
            <label htmlFor="searchQuery" style={labelStyle}>Поиск по тексту:</label>
            <input id="searchQuery" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{...inputStyle, width: '150px'}} placeholder="Введите текст..." />
          </div>
        </div>
        
        {/* Тепловая карта распределения Сигнал/Шум */}
        <div style={{ margin: '15px 0 0 0' }}>
          <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '5px' }}>
            Карта распределения соотношения Сигнал/Шум в документе (нажмите на блок для навигации):
          </div>
          <div style={{ 
            display: 'flex', 
            height: '15px', 
            width: '100%', 
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid #ddd'
          }}>
            {paragraphs.length > 0 && paragraphs.map((paragraph, idx) => {
              const signal = paragraph.metrics.signal_strength || 0;
              const normalizedSignal = normalize(signal, globalSignalRange.min, globalSignalRange.max);
              return (
                <div
                  key={idx}
                  style={{
                    flex: '1',
                    height: '100%',
                    backgroundColor: getBackgroundColorForSignal(signal),
                    cursor: 'pointer' // Добавляем курсор-указатель, чтобы пользователь понял, что это кликабельный элемент
                  }}
                  title={`ID: ${paragraph.id}, Сигнал/Шум: ${(normalizedSignal * 100).toFixed(1)}%`}
                  onClick={() => scrollToCard(paragraph.id)}
                />
              );
            })}
            {paragraphs.length === 0 && (
              <div style={{ flex: '1', height: '100%', backgroundColor: '#eee' }}>
                Нет данных
              </div>
            )}
          </div>
        </div>
      </div>

      {currentError && (
        <div style={{ color: 'red', backgroundColor: '#ffe0e0', border: '1px solid red', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
          Ошибка: {currentError}
        </div>
      )}
      
      <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#666' }}>
        Показано абзацев: {sortedAndFilteredParagraphs.length} из {paragraphs.length}
      </div>

      <div ref={contentRef}>
        <DraggableCardList
          sessionData={sessionData}
          paragraphs={paragraphs}
          setParagraphs={setParagraphs}
          setSessionData={setSessionData}
          markSemanticsAsStale={markSemanticsAsStale}
          uiSignalMin={uiSignalMin}
          uiSignalMax={uiSignalMax}
          uiComplexityMin={uiComplexityMin}
          uiComplexityMax={uiComplexityMax}
          fontSize={`${fontSize}pt`}
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
          editingParagraphId={editingParagraphId}
          editingText={editingText}
          setEditingText={setEditingText}
          handleStartEditing={handleStartEditing}
          handleSaveWithSplit={handleSaveWithSplit}
          handleCancelEditing={handleCancelEditing}
          isSaving={isSaving}
          handleMergeDown={handleMergeDown}
          sortedAndFilteredParagraphs={sortedAndFilteredParagraphs}
          paragraphRefs={paragraphRefs}
        />
      </div>
    </div>
  );
};

export default CardList;
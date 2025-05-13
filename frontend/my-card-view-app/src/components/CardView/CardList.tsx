import React, { useEffect, useState, useMemo } from 'react';
import Card from './Card';
import type { ParagraphData, AnalysisResponse } from './types'; // Используем AnalysisResponse
import { updateParagraph, refreshFullSemanticAnalysis } from '../../api'; // Убрали fetchAnalysis, т.к. сессия приходит как prop // Добавили refreshFullSemanticAnalysis

// Типы для сортировки и фильтрации
type SortField = 'id' | 'signal_strength' | 'complexity' | 'semantic_function'; // id вместо paragraph_id
type SortDirection = 'asc' | 'desc';

// Цвета по умолчанию (можно вынести в константы или настройки)
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"; 
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"; 
const DEFAULT_COMPLEXITY_MIN_COLOR = "#FFFFFF"; // Изменил на белый для лучшего контраста с зеленым/красным текстом на карточке
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF6347"; // Томатный, для примера

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

  // Стили (можно вынести в CSS модули или styled-components)
  const controlPanelStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' };
  const controlGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: '#555' };
  const inputStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc', width: '80px' };
  const colorInputStyle: React.CSSProperties = { ...inputStyle, width: '50px', height: '25px', padding: '2px' }; 
  const selectStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc' };

  return (
    <div style={{ maxWidth: '950px', margin: '20px auto', padding: '0 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.6rem', color: '#333' }}>{sessionData.metadata.topic || "Анализ текста"}</h1>
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
      <div style={controlPanelStyle}>
        {/* Размер шрифта */}
        <div style={controlGroupStyle}>
          <label htmlFor="fontSizeInput" style={labelStyle}>Размер шрифта (pt):</label>
          <input id="fontSizeInput" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{...inputStyle, width: '60px'}} />
        </div>
        {/* Сигнал */}
        <div style={controlGroupStyle}>
          <label style={labelStyle}>Сигнал (диапазон: {globalSignalRange.min.toFixed(3)} - {globalSignalRange.max.toFixed(3)})</label>
          <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
            Мин: <input type="number" step="0.01" value={uiSignalMin} onChange={e => setUiSignalMin(parseFloat(e.target.value))} style={inputStyle} title="Мин. значение для шкалы сигнала" />
            Цвет: <input type="color" value={signalMinColor} onChange={e => setSignalMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сигнала" />
            Макс: <input type="number" step="0.01" value={uiSignalMax} onChange={e => setUiSignalMax(parseFloat(e.target.value))} style={inputStyle} title="Макс. значение для шкалы сигнала" />
            Цвет: <input type="color" value={signalMaxColor} onChange={e => setSignalMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сигнала" />
          </div>
        </div>
        {/* Сложность */}
        <div style={controlGroupStyle}>
          <label style={labelStyle}>Сложность (диапазон: {globalComplexityRange.min.toFixed(3)} - {globalComplexityRange.max.toFixed(3)})</label>
          <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
            Мин: <input type="number" step="0.01" value={uiComplexityMin} onChange={e => setUiComplexityMin(parseFloat(e.target.value))} style={inputStyle} title="Мин. значение для шкалы сложности"/>
            Цвет: <input type="color" value={complexityMinColor} onChange={e => setComplexityMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сложности" />
            Макс: <input type="number" step="0.01" value={uiComplexityMax} onChange={e => setUiComplexityMax(parseFloat(e.target.value))} style={inputStyle} title="Макс. значение для шкалы сложности" />
            Цвет: <input type="color" value={complexityMaxColor} onChange={e => setComplexityMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сложности" />
          </div>
        </div>
        {/* Сортировка */}
        <div style={controlGroupStyle}>
          <label htmlFor="sortField" style={labelStyle}>Сортировать по:</label>
          <select id="sortField" value={sortField} onChange={(e) => setSortField(e.target.value as SortField)} style={selectStyle}>
            <option value="id">ID</option>
            <option value="signal_strength">Сигнал</option>
            <option value="complexity">Сложность</option>
            <option value="semantic_function">Семантика</option>
          </select>
        </div>
        <div style={controlGroupStyle}>
          <label htmlFor="sortDirection" style={labelStyle}>Направление:</label>
          <select id="sortDirection" value={sortDirection} onChange={(e) => setSortDirection(e.target.value as SortDirection)} style={selectStyle}>
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
        </div>
        {/* Фильтр по семантике */}
        <div style={controlGroupStyle}>
          <label htmlFor="semanticFilter" style={labelStyle}>Фильтр по семантике:</label>
          <select id="semanticFilter" value={semanticFilter} onChange={(e) => setSemanticFilter(e.target.value)} style={selectStyle}>
            {availableSemanticFunctions.map(func => <option key={func} value={func}>{func}</option>)}
          </select>
        </div>
        {/* Поиск по тексту */}
        <div style={controlGroupStyle}>
          <label htmlFor="searchQuery" style={labelStyle}>Поиск по тексту:</label>
          <input id="searchQuery" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{...inputStyle, width: '150px'}} placeholder="Введите текст..." />
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

      {sortedAndFilteredParagraphs.map((p) => (
        <Card
          key={p.id} // Используем p.id
          paragraph={p}
          minSignal={uiSignalMin} // Используем uiSignalMin/Max для нормализации
          maxSignal={uiSignalMax}
          minComplexity={uiComplexityMin}
          maxComplexity={uiComplexityMax}
          fontSize={`${fontSize}pt`}
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
          isEditing={editingParagraphId === p.id}
          editingText={editingParagraphId === p.id ? editingText : ''}
          onEditingTextChange={setEditingText}
          onStartEditing={() => handleStartEditing(p)}
          onSave={handleSaveEditing}
          onCancel={handleCancelEditing}
          isSaving={isSaving}
        />
      ))}
    </div>
  );
};

export default CardList; 
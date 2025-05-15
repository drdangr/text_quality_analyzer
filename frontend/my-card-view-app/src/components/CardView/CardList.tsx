import React, { useEffect, useState, useMemo } from 'react';
import Card from './Card';
import type { ParagraphData, AnalysisResponse } from './types'; // Используем AnalysisResponse
import { updateParagraph, refreshFullSemanticAnalysis, mergeParagraphs, splitParagraph, fetchAnalysis } from '../../api'; // Добавил fetchAnalysis

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
        zIndex: 10,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        minHeight: '60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0',
        padding: '0 10px',
      }}>
        <h1 style={{ fontSize: '1.6rem', color: '#333', margin: 0 }}>{sessionData.metadata.topic || "Анализ текста"}</h1>
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
        zIndex: 9,
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
      </div>

      {currentError && (
        <div style={{ color: 'red', backgroundColor: '#ffe0e0', border: '1px solid red', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
          Ошибка: {currentError}
        </div>
      )}
      
      <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#666' }}>
        Показано абзацев: {sortedAndFilteredParagraphs.length} из {paragraphs.length}
      </div>

      {sortedAndFilteredParagraphs.map((p, index) => (
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
          onSave={handleSaveWithSplit}
          onCancel={handleCancelEditing}
          isSaving={isSaving}
          isFirst={index === 0}
          isLast={index === sortedAndFilteredParagraphs.length - 1}
          onMergeDown={() => handleMergeDown(index)}
        />
      ))}
    </div>
  );
};

export default CardList; 
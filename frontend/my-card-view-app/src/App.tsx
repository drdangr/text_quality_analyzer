import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import CardList from './components/CardView/CardList';
import FullTextEditor from './components/FullTextEditor';
import { initializeAnalysis, loadDemoData, fetchAnalysis, updateTopic, refreshFullSemanticAnalysis } from './api';
import type { AnalysisResponse, ParagraphData } from './components/CardView/types';
import type { SortField, SortDirection } from './components/CardView/CardList';
import './App.css';

// Вспомогательная функция для подсчета слов
const countWords = (text: string): number => {
  if (!text || text.trim() === '') return 0;
  // Разделение по одному или более пробельным символам или дефисам, окруженным пробелами (чтобы не разделять слова типа "сигнал-шум")
  // и фильтрация пустых строк, которые могут возникнуть из-за нескольких пробелов подряд.
  return text.trim().split(/\s+|\s+-\s+/).filter(word => word.length > 0).length;
};

// Вспомогательная функция для форматирования времени чтения
const formatReadingTime = (totalMinutes: number): string => {
  if (totalMinutes === 0) return "0 мин";
  if (totalMinutes < 1) return "< 1 мин";
  const roundedMinutes = Math.round(totalMinutes);
  return `${roundedMinutes} мин`;
};

// Константы, ранее бывшие в CardList
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"; 
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"; 
const DEFAULT_COMPLEXITY_MIN_COLOR = "#00FF00";
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"; 
const DEFAULT_FONT_FAMILY = "Arial, sans-serif";

// Определяем интерфейс для пропсов CardList здесь, так как App.tsx теперь управляет всеми данными для него
interface AppCardListProps { 
  sessionData: AnalysisResponse;
  paragraphsToRender: ParagraphData[];
  paragraphRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
  onSessionUpdate: (updatedSession: AnalysisResponse) => void;
  markSemanticsAsStale: () => void; 
  isSemanticAnalysisUpToDate: boolean;
  fontSize: number;
  fontFamily: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  globalSignalRange: {min: number, max: number};
  globalComplexityRange: {min: number, max: number};
}

function App() {
  const [session, setSession] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSemanticAnalysisUpToDate, setIsSemanticAnalysisUpToDate] = useState<boolean>(true);

  type ViewMode = 'editor' | 'cards';
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [editorFullText, setEditorFullText] = useState<string>('');
  const [editorTopic, setEditorTopic] = useState<string>(session?.metadata.topic || '');

  const [isEditingTopic, setIsEditingTopic] = useState<boolean>(false);
  const [currentTopicText, setCurrentTopicText] = useState<string>(session?.metadata.topic || '');
  const [isSavingTopic, setIsSavingTopic] = useState<boolean>(false);
  const [isRefreshingSemanticsApp, setIsRefreshingSemanticsApp] = useState<boolean>(false);

  // Состояния для панели управления, перенесенные из CardList
  const [fontSize, setFontSize] = useState<number>(12);
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY);
  const [signalMinColor, setSignalMinColor] = useState<string>(DEFAULT_SIGNAL_MIN_COLOR);
  const [signalMaxColor, setSignalMaxColor] = useState<string>(DEFAULT_SIGNAL_MAX_COLOR);
  const [complexityMinColor, setComplexityMinColor] = useState<string>(DEFAULT_COMPLEXITY_MIN_COLOR);
  const [complexityMaxColor, setComplexityMaxColor] = useState<string>(DEFAULT_COMPLEXITY_MAX_COLOR);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [semanticFilter, setSemanticFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isControlPanelExpanded, setIsControlPanelExpanded] = useState<boolean>(false);
  const controlPanelContentRef = useRef<HTMLDivElement>(null);
  const paragraphRefsApp = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const contentRefApp = useRef<HTMLDivElement>(null); // Для основного скроллящегося контента

  const paragraphs = useMemo(() => session?.paragraphs || [], [session]);

  const estimatedReadingTime = useMemo(() => {
    if (!session || session.paragraphs.length === 0) return "0 мин";
    const totalWords = session.paragraphs.reduce((acc, p) => acc + countWords(p.text), 0);
    const WPM = 180; // Слов в минуту (среднее для русского языка, можно вынести в константу)
    if (totalWords === 0) return "0 мин";
    const readingTimeMinutes = totalWords / WPM;
    return formatReadingTime(readingTimeMinutes);
  }, [session]);

  const availableSemanticFunctions = useMemo(() => {
    if (!session) return ['all'];
    const functions = new Set(session.paragraphs.map(p => p.metrics.semantic_function || 'Не определено'));
    return ['all', ...Array.from(functions)];
  }, [session]);

  const globalSignalRange = useMemo(() => {
    if (!session || session.paragraphs.length === 0) return { min: 0, max: 1 };
    const signals = session.paragraphs.map(p => p.metrics.signal_strength || 0).filter(s => typeof s === 'number' && !isNaN(s));
    if (signals.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...signals), max: Math.max(...signals) || 1 };
  }, [session]);

  const globalComplexityRange = useMemo(() => {
    if (!session || session.paragraphs.length === 0) return { min: 0, max: 1 };
    const complexities = session.paragraphs.map(p => p.metrics.complexity || 0).filter(c => typeof c === 'number' && !isNaN(c));
    if (complexities.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...complexities), max: Math.max(...complexities) || 1 };
  }, [session]);

  // Хелперы для панели управления
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  };
  const normalize = (value: number, min: number, max: number): number => {
    if (max === min) return value >= max ? 1 : 0;
    const N = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return isNaN(N) ? 0 : N;
  };
  const getBackgroundColorForSignal = (signal: number) => {
    const normalizedSignal = normalize(signal, globalSignalRange.min, globalSignalRange.max);
    const startColor = hexToRgb(signalMinColor) || { r: 255, g: 255, b: 255 };
    const endColor = hexToRgb(signalMaxColor) || { r: 255, g: 219, b: 88 };
    const r = Math.round(startColor.r * (1 - normalizedSignal) + endColor.r * normalizedSignal);
    const g = Math.round(startColor.g * (1 - normalizedSignal) + endColor.g * normalizedSignal);
    const b = Math.round(startColor.b * (1 - normalizedSignal) + endColor.b * normalizedSignal);
    return `rgb(${r}, ${g}, ${b})`;
  };
  const formatMetric = (value: number | null | undefined): string => {
    if (value === null || typeof value === 'undefined') return 'N/A';
    return value.toFixed(2);
  };

  const scrollToCard = (paragraphId: number) => {
    const topHeaderHeight = document.getElementById('app-top-header')?.offsetHeight || 60;
    const controlPanelHeight = document.getElementById('control-panel-sticky-app')?.offsetHeight || 0;
    const stickyOffset = topHeaderHeight + (viewMode === 'cards' && session ? controlPanelHeight : 0) + 20; // +20px запаса
    
    if (paragraphRefsApp.current[paragraphId]) {
      const cardElement = paragraphRefsApp.current[paragraphId];
      if (cardElement) {
        const elementPosition = cardElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - stickyOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      }
    }
  };

  // ... (useEffect для загрузки сессии, handleAnalyzeText, handleLoadDemoData, и т.д. остаются)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = params.get('session_id');
    console.log("App.tsx: Initial useEffect, sessionIdFromUrl:", sessionIdFromUrl);
    if (sessionIdFromUrl) {
      setLoading(true);
      setError(null);
      setIsSemanticAnalysisUpToDate(true);
      fetchAnalysis(sessionIdFromUrl)
        .then(loadedSession => {
          console.log("App.tsx: Session loaded from URL:", loadedSession);
          setSession(loadedSession);
          setEditorFullText(loadedSession.paragraphs.map(p => p.text).join('\n\n'));
          setCurrentTopicText(loadedSession.metadata.topic || '');
          setEditorTopic(loadedSession.metadata.topic || '');
          document.title = loadedSession.metadata.topic || "Анализ текста";
          setIsSemanticAnalysisUpToDate(true);
          setViewMode('cards');
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Ошибка при загрузке сессии по ID из URL');
          console.error('Ошибка при загрузке сессии из URL:', err);
          setViewMode('editor');
        })
        .finally(() => {
          setLoading(false);
          console.log("App.tsx: useEffect for session_id finally. Current session:", session, "Current viewMode:", viewMode);
        });
    } else {
      setViewMode('editor'); 
      console.log("App.tsx: useEffect, no sessionIdFromUrl. viewMode set to 'editor'");
    }
  }, []); // Зависимость session здесь может вызвать цикл, если setSession внутри then его меняет

  useEffect(() => {
    if (session) {
      setCurrentTopicText(session.metadata.topic || '');
      setEditorTopic(session.metadata.topic || ''); // Убедимся, что editorTopic тоже синхронизируется
       console.log("App.tsx: session updated, currentTopicText set to:", session.metadata.topic);
    } else {
      // Если сессия сброшена (null), сбрасываем и тему
      setCurrentTopicText('');
      setEditorTopic('');
      console.log("App.tsx: session is null, currentTopicText and editorTopic cleared");
    }
  }, [session]);

  const handleAnalyzeText = async (text: string, topic: string) => {
    console.log("App.tsx: handleAnalyzeText called with topic:", topic, "text:", text.substring(0,100));
    setLoading(true);
    setError(null);
    setIsSemanticAnalysisUpToDate(false);
    try {
      const analysisSessionData = await initializeAnalysis(text, topic);
      console.log("App.tsx: analysisSessionData received:", analysisSessionData);
      setSession(analysisSessionData);
      setEditorFullText(text);
      document.title = analysisSessionData.metadata.topic || "Анализ текста";
      window.history.pushState({}, '', `?session_id=${analysisSessionData.metadata.session_id}`);
      setIsSemanticAnalysisUpToDate(true);
      setViewMode('cards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при анализе текста');
      console.error('Ошибка при анализе:', err);
    } finally {
      setLoading(false);
      console.log("App.tsx: handleAnalyzeText finally. Current session:", session, "Current viewMode:", viewMode);
    }
  };

  const handleLoadDemoData = async () => {
    console.log("App.tsx: handleLoadDemoData called");
    setLoading(true);
    setError(null);
    setIsSemanticAnalysisUpToDate(false);
    try {
      const demoSessionData = await loadDemoData();
      console.log("App.tsx: demoSessionData received:", demoSessionData);
      setSession(demoSessionData);
      setEditorFullText(demoSessionData.paragraphs.map(p => p.text).join('\n\n'));
      document.title = demoSessionData.metadata.topic || "Демо данные";
      window.history.pushState({}, '', `?session_id=${demoSessionData.metadata.session_id}`);
      setIsSemanticAnalysisUpToDate(true);
      setViewMode('cards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке демо-данных');
      console.error('Ошибка при загрузке демо:', err);
    } finally {
      setLoading(false);
      console.log("App.tsx: handleLoadDemoData finally. Current session:", session, "Current viewMode:", viewMode);
    }
  };

  const switchToEditorMode = () => {
    if (session) {
      setEditorFullText(session.paragraphs.map(p => p.text).join('\n\n'));
      console.log("App.tsx: switchToEditorMode. editorFullText and editorTopic set from session.");
    }
    setViewMode('editor');
  };

  const handleResetAndGoToEditor = () => {
    console.log("App.tsx: handleResetAndGoToEditor called");
    setSession(null); // Это вызовет useEffect[session] и сбросит currentTopicText/editorTopic
    setError(null);
    setIsSemanticAnalysisUpToDate(true);
    setEditorFullText('');
    document.title = "Анализатор текста";
    window.history.pushState({}, document.title, window.location.pathname);
    setViewMode('editor');
  };

  const markSemanticsAsStale = () => setIsSemanticAnalysisUpToDate(false);

  const handleSemanticRefreshSuccess = (updatedSession: AnalysisResponse) => {
    console.log("App.tsx: handleSemanticRefreshSuccess called with:", updatedSession);
    setSession(updatedSession);
    setIsSemanticAnalysisUpToDate(true);
    document.title = updatedSession.metadata.topic || "Анализ текста (обновлено)";
  };

  const handleStartEditingTopic = () => setIsEditingTopic(true);
  const handleCancelEditingTopic = () => {
    setIsEditingTopic(false);
    if (session) setCurrentTopicText(session.metadata.topic || '');
  };

  const handleSaveTopicEditing = async () => {
    if (!session || currentTopicText.trim() === '') return;
    console.log("App.tsx: handleSaveTopicEditing. Saving topic:", currentTopicText);
    setIsSavingTopic(true); setError(null);
    try {
      const updatedSession = await updateTopic(session.metadata.session_id, currentTopicText.trim());
      handleSemanticRefreshSuccess(updatedSession); 
      setIsEditingTopic(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при сохранении темы');
      console.error('Save topic error:', e);
    } finally { setIsSavingTopic(false); }
  };

  const handleRefreshSemanticsApp = async () => {
    if (!session) return;
    console.log("App.tsx: handleRefreshSemanticsApp called for session:", session.metadata.session_id);
    setIsRefreshingSemanticsApp(true); setError(null);
    try {
      const updatedSession = await refreshFullSemanticAnalysis(session.metadata.session_id);
      handleSemanticRefreshSuccess(updatedSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при обновлении семантики');
      console.error('Semantic refresh error:', e);
    } finally { setIsRefreshingSemanticsApp(false); }
  };
  
  const headerButtonStyle: React.CSSProperties = { padding: '8px 15px', fontSize: '0.9rem', border:'none', borderRadius:'4px', cursor:'pointer', marginLeft: '10px'};
  const controlPanelContainerStyle: React.CSSProperties = { overflow: 'hidden', transition: 'max-height 0.3s ease-in-out', maxHeight: isControlPanelExpanded ? '1000px' : '40px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '10px', backgroundColor: '#f9f9f9' };
  const controlPanelHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer', borderBottom: isControlPanelExpanded ? '1px solid #ddd' : 'none', backgroundColor: '#f0f0f0' };
  const controlPanelToggleIconStyle: React.CSSProperties = { fontSize: '1.2em', marginRight: '10px', transform: isControlPanelExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease-in-out' };
  const controlPanelActualControlsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '15px', padding: '15px' };
  const controlGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: '#555' };
  const inputStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc', width: '80px' };
  const colorInputStyle: React.CSSProperties = { ...inputStyle, width: '50px', height: '25px', padding: '2px' }; 
  const selectStyle: React.CSSProperties = { padding: '5px', borderRadius: '3px', border: '1px solid #ccc', minWidth: '120px' }; 
  const summaryAndSearchRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', backgroundColor: '#f0f0f0', borderRadius: '4px', marginTop: '10px', fontSize: '0.9rem', color: '#555' };
  const summaryStatsStyle: React.CSSProperties = { flexGrow: 1, textAlign: 'left' };
  const searchInputStyle: React.CSSProperties = { ...inputStyle, width: '200px', marginLeft: '15px' };

  // Закомментируем ранний return для отладки ошибки с хуками
  // if (loading && !session) { 
  //   console.log("App.tsx: Rendering global loading state...");
  //   return <div className="app-loading">Загрузка...</div>;
  // }

  const sortedAndFilteredParagraphs = useMemo(() => {
    if (!session) return [];
    let result = [...session.paragraphs]; 
    if (semanticFilter !== 'all') {
      result = result.filter(p => (p.metrics.semantic_function || 'Не определено') === semanticFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.text.toLowerCase().includes(query));
    }
    result.sort((a, b) => {
      let aValue: any = sortField === 'id' ? a.id : a.metrics[sortField as keyof ParagraphData["metrics"]] ?? (sortField === 'semantic_function' ? 'Не определено' : 0);
      let bValue: any = sortField === 'id' ? b.id : b.metrics[sortField as keyof ParagraphData["metrics"]] ?? (sortField === 'semantic_function' ? 'Не определено' : 0);
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      return sortDirection === 'asc' ? (aValue - bValue) : (bValue - aValue);
    });
    return result;
  }, [session, sortField, sortDirection, semanticFilter, searchQuery]);
  
  console.log("App.tsx: Rendering. ViewMode:", viewMode, "Session ID:", session?.metadata.session_id, "Loading:", loading, "Error:", error);

  // Если идет загрузка и еще нет сессии, показываем только лоадер
  if (loading && !session) {
    return <div className="app-loading">Загрузка данных сессии...</div>;
  }

  const appContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1, // Растягивается внутри #root
    width: '100%', // Занимает всю ширину #root
    overflow: 'hidden', // Предотвращаем возможный лишний скролл
    minHeight: 0, // Важно для вложенных flex-элементов
  };

  const contentRefAppStyles: React.CSSProperties = {
    position: 'relative', // Уже было
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto', // Разрешаем вертикальный скролл для этого блока
    minHeight: 0, // Важно для вложенных flex-элементов
  };

  return (
    <div className="app-container" style={appContainerStyles}>
      {/* Верхняя шапка - отображается всегда, кроме случая loading && !session */}
      {!(loading && !session) && (
        <div id="app-top-header" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', minHeight: '60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #eee' }}>
          {isEditingTopic ? (
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: '70%' }}>
              <input type="text" value={currentTopicText} onChange={(e) => setCurrentTopicText(e.target.value)} style={{ fontSize: '1.4rem', padding: '5px 10px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, minWidth: '300px' }} placeholder="Введите тему анализа" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveTopicEditing()} />
              <div style={{ display: 'flex', gap: '10px', marginLeft: '10px' }}>
                <button onClick={handleCancelEditingTopic} disabled={isSavingTopic} style={{...headerButtonStyle, backgroundColor: '#f0f0f0'}}>Отмена</button>
                <button onClick={handleSaveTopicEditing} disabled={isSavingTopic || !currentTopicText.trim()} style={{...headerButtonStyle, backgroundColor: '#5cb85c', color: 'white'}}>{isSavingTopic ? 'Сохранение...' : 'Сохранить'}</button>
              </div>
            </div>
          ) : (
            <h1 style={{ fontSize: '1.6rem', color: '#333', margin: 0, cursor: 'pointer', padding: '6px 10px', borderRadius: '4px', transition: 'background-color 0.2s', backgroundColor: 'transparent'}} onClick={handleStartEditingTopic} title="Нажмите для редактирования темы" onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
              {currentTopicText || editorTopic || 'Тема анализа'} 
            </h1>
          )}
          <div style={{display: 'flex', gap: '10px'}}>
            {viewMode === 'cards' && session && (
              <button onClick={switchToEditorMode} style={{...headerButtonStyle, backgroundColor: '#6c757d', color: 'white'}} title="Редактировать весь текст">В редактор</button>
            )}
            {viewMode === 'cards' && session && !isSemanticAnalysisUpToDate && (
              <button onClick={handleRefreshSemanticsApp} disabled={isRefreshingSemanticsApp} style={{...headerButtonStyle, backgroundColor: '#5bc0de', color:'white'}}>
                {isRefreshingSemanticsApp ? 'Обновление семантики...' : 'Обновить семантику'}
              </button>
            )}
            <button onClick={handleResetAndGoToEditor} style={{...headerButtonStyle, backgroundColor: '#f0ad4e', color:'white' }}>Новый анализ</button>
          </div>
        </div>
      )}

      {viewMode === 'cards' && session && (
        <div id="control-panel-sticky-app" style={{position: 'sticky', top: 60, zIndex: 49, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '20px', borderRadius: '4px', padding: '15px' }}>
          <div style={controlPanelContainerStyle}>
            <div style={controlPanelHeaderStyle} onClick={() => setIsControlPanelExpanded(!isControlPanelExpanded)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && setIsControlPanelExpanded(!isControlPanelExpanded)}>
              <span style={controlPanelToggleIconStyle}>{isControlPanelExpanded ? '˅' : '>'}</span>
              <span>Управление шрифтом и цветами</span> 
            </div>
            {isControlPanelExpanded && (
               <div style={controlPanelActualControlsStyle} ref={controlPanelContentRef}>
                  <div style={controlGroupStyle}>
                      <label htmlFor="appFontSizeInput" style={labelStyle}>Размер шрифта (pt):</label>
                      <input id="appFontSizeInput" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{...inputStyle, width: '60px'}} />
                  </div>
                  <div style={controlGroupStyle}>
                      <label htmlFor="appFontFamilySelect" style={labelStyle}>Гарнитура шрифта:</label>
                      <select id="appFontFamilySelect" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={selectStyle}>
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                          <option value="'Times New Roman', Times, serif">Times New Roman</option>
                          <option value="'Courier New', Courier, monospace">Courier New</option>
                          <option value="'Lucida Console', Monaco, monospace">Lucida Console</option>
                          <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                          <option value="'Palatino Linotype', 'Book Antiqua', Palatino, serif">Palatino</option>
                      </select>
                  </div>
                  <div style={controlGroupStyle}>
                      <label style={labelStyle}>Настройка цветов для Сигнала</label>
                      <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
                      Мин: <input type="color" value={signalMinColor} onChange={e => setSignalMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сигнала" />
                      Макс: <input type="color" value={signalMaxColor} onChange={e => setSignalMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сигнала" />
                      </div>
                  </div>
                  <div style={controlGroupStyle}>
                      <label style={labelStyle}>Настройка цветов для Сложности</label>
                      <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
                      Мин: <input type="color" value={complexityMinColor} onChange={e => setComplexityMinColor(e.target.value)} style={colorInputStyle} title="Цвет для мин. сложности" />
                      Макс: <input type="color" value={complexityMaxColor} onChange={e => setComplexityMaxColor(e.target.value)} style={colorInputStyle} title="Цвет для макс. сложности" />
                      </div>
                  </div>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '15px'}}>
            <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '5px' }}>
              Карта распределения соотношения Сигнал/Шум в документе (нажмите на блок для навигации):
            </div>
            <div style={{ display: 'flex', height: '15px', width: '100%', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ddd' }}>
              {session && session.paragraphs.length > 0 && session.paragraphs.map((p) => {
                const signal = p.metrics.signal_strength || 0;
                const normalizedSignal = normalize(signal, globalSignalRange.min, globalSignalRange.max);
                return (
                  <div
                    key={p.id} 
                    style={{ flex: '1', height: '100%', backgroundColor: getBackgroundColorForSignal(signal), cursor: 'pointer' }}
                    title={`ID: ${p.id}, Сигнал/Шум: ${(normalizedSignal * 100).toFixed(1)}%`}
                    onClick={() => scrollToCard(p.id)}
                  />
                );
              })}
              {(!session || session.paragraphs.length === 0) && ( <div style={{ flex: '1', height: '100%', backgroundColor: '#eee' }}>Нет данных</div> )}
            </div>
          </div>
          
          <div style={summaryAndSearchRowStyle}>
            <span style={summaryStatsStyle}>
              Время чтения: <strong>{estimatedReadingTime}</strong> | 
              Сложность: <strong>{formatMetric(session?.metadata.avg_complexity)}</strong> | 
              Сигнал/Шум: <strong>{formatMetric(session?.metadata.avg_signal_strength)}</strong> | 
              Абзацев: {sortedAndFilteredParagraphs.length} из {paragraphs.length} 
            </span>
            <input id="appSearchQuerySticky" type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={searchInputStyle} placeholder="Поиск по тексту..." />
          </div>
        </div>
      )}

      <div ref={contentRefApp} style={contentRefAppStyles}> {/* Обертка для основного контента и оверлея */}
        {viewMode === 'editor' && (
          <FullTextEditor
            initialText={editorFullText}
            initialTopic={editorTopic}
            onSubmit={handleAnalyzeText}
            onDemoDataClick={!editorFullText && !session ? handleLoadDemoData : undefined}
            loading={loading}
            error={error} 
          />
        )}

        {viewMode === 'cards' && session && (
          <CardList 
            key={session.metadata.session_id} 
            sessionData={session} 
            isSemanticAnalysisUpToDate={isSemanticAnalysisUpToDate}
            markSemanticsAsStale={markSemanticsAsStale}
            onSessionUpdate={handleSemanticRefreshSuccess}
            fontSize={fontSize}
            fontFamily={fontFamily}
            signalMinColor={signalMinColor}
            signalMaxColor={signalMaxColor}
            complexityMinColor={complexityMinColor}
            complexityMaxColor={complexityMaxColor}
            paragraphsToRender={sortedAndFilteredParagraphs}
            globalSignalRange={globalSignalRange}
            globalComplexityRange={globalComplexityRange}
            paragraphRefs={paragraphRefsApp}
          />
        )}
        
        {/* Оверлей загрузки, отображается поверх контента */}
        {loading && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)', // Менее прозрачный фон
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 200,
            fontSize: '1.8em',
            color: '#fff',
            flexDirection: 'column'
          }}>
            <div style={{ marginBottom: '15px' }}>Анализ текста...</div>
            <div className="loading-dots" style={{ fontSize: '2em' }}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {error && (
          <div style={{maxWidth: '800px', margin: '20px auto', padding: '15px', color: '#a94442', backgroundColor: '#f2dede', borderRadius: '4px', border: '1px solid #ebccd1', textAlign: 'center' }} role="alert">
              <strong>Ошибка:</strong> {error}
            </div>
        )}
      </div>
    </div>
  );
}

export default App;

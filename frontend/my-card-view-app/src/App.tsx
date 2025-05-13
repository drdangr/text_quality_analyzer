import { useState, useEffect } from 'react';
import CardList from './components/CardView/CardList';
import TextInput from './components/TextInput';
import { initializeAnalysis, loadDemoData, fetchAnalysis } from './api';
import type { AnalysisResponse } from './components/CardView/types';
import './App.css';

function App() {
  const [session, setSession] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSemanticAnalysisUpToDate, setIsSemanticAnalysisUpToDate] = useState<boolean>(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = params.get('session_id');
    if (sessionIdFromUrl) {
      setLoading(true);
      setError(null);
      setIsSemanticAnalysisUpToDate(true);
      fetchAnalysis(sessionIdFromUrl)
        .then(loadedSession => {
          setSession(loadedSession);
          document.title = loadedSession.metadata.topic || "Анализ текста";
          setIsSemanticAnalysisUpToDate(true);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Ошибка при загрузке сессии по ID из URL');
          console.error('Ошибка при загрузке сессии из URL:', err);
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const handleAnalyzeText = async (text: string, topic: string) => {
    setLoading(true);
    setError(null);
    setIsSemanticAnalysisUpToDate(false);
    
    try {
      const analysisSessionData = await initializeAnalysis(text, topic);
      setSession(analysisSessionData);
      document.title = analysisSessionData.metadata.topic || "Анализ текста";
      window.history.pushState({}, '', `?session_id=${analysisSessionData.metadata.session_id}`);
      setIsSemanticAnalysisUpToDate(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при анализе текста');
      console.error('Ошибка при анализе:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemoData = async () => {
    setLoading(true);
    setError(null);
    setIsSemanticAnalysisUpToDate(false);
    try {
      const demoSessionData = await loadDemoData();
      setSession(demoSessionData);
      document.title = demoSessionData.metadata.topic || "Демо данные";
      window.history.pushState({}, '', `?session_id=${demoSessionData.metadata.session_id}`);
      setIsSemanticAnalysisUpToDate(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке демо-данных');
      console.error('Ошибка при загрузке демо:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSession(null);
    setError(null);
    setIsSemanticAnalysisUpToDate(true);
    document.title = "Анализатор текста";
    window.history.pushState({}, document.title, window.location.pathname);
  };

  const markSemanticsAsStale = () => {
    setIsSemanticAnalysisUpToDate(false);
  };

  const handleSemanticRefresh = (updatedSession: AnalysisResponse) => {
    setSession(updatedSession);
    setIsSemanticAnalysisUpToDate(true);
    document.title = updatedSession.metadata.topic || "Анализ текста (обновлено)";
  };

  if (loading && !session) {
    return <div className="app-loading">Загрузка данных сессии...</div>;
  }

  return (
    <div className="app-container">
      {!session ? (
        <TextInput 
          onSubmit={handleAnalyzeText} 
          loading={loading} 
          error={error}
          onDemoDataClick={handleLoadDemoData}
        />
      ) : (
        <CardList 
          initialSession={session} 
          onReset={handleReset}
          isSemanticAnalysisUpToDate={isSemanticAnalysisUpToDate}
          markSemanticsAsStale={markSemanticsAsStale}
          onSemanticRefresh={handleSemanticRefresh}
        />
      )}
    </div>
  );
}

export default App;

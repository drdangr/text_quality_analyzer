### 1. Обновление типов данных

Обновите файл `src/components/CardView/types.ts` для соответствия формату данных API:

```typescript
// types.ts
export interface ParagraphData {
  paragraph_id: number;
  text: string;
  signal_strength: number;
  complexity: number;
  semantic_function?: string;
  semantic_method?: string;
  // Добавьте другие поля, которые возвращает API
}

export interface AnalysisSession {
  session_id: string;
  topic: string;
  paragraphs: ParagraphData[];
  metadata?: {
    timestamp?: string;
    [key: string]: any;
  };
}

export interface UpdateParagraphRequest {
  session_id: string;
  paragraph_id: number;
  text: string;
}

export interface UpdateParagraphResponse {
  paragraph: ParagraphData;
}
```

### 2. Создание API-клиента

Создайте файл `src/api/index.ts`:

```typescript
// src/api/index.ts
import { ParagraphData, AnalysisSession, UpdateParagraphRequest, UpdateParagraphResponse } from '../components/CardView/types';

// Базовый URL API
const API_URL = process.env.REACT_APP_API_URL || '/api';

// Инициализация анализа (для нового текста)
export async function initializeAnalysis(text: string, topic: string): Promise<AnalysisSession> {
  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, topic }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Получение результатов анализа по session_id
export async function fetchAnalysis(sessionId: string): Promise<AnalysisSession> {
  const response = await fetch(`${API_URL}/analysis/${sessionId}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Обновление текста абзаца
export async function updateParagraph(
  sessionId: string, 
  paragraphId: number, 
  text: string
): Promise<UpdateParagraphResponse> {
  const request: UpdateParagraphRequest = {
    session_id: sessionId,
    paragraph_id: paragraphId,
    text
  };
  
  const response = await fetch(`${API_URL}/update-paragraph`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Загрузка демо-данных (использует локальный JSON в режиме разработки)
export async function loadDemoData(): Promise<AnalysisSession> {
  try {
    // Загружаем локальные демо-данные
    const [paragraphsResponse, configResponse] = await Promise.all([
      fetch('/card_view_data.json'),
      fetch('/config.json')
    ]);

    if (!paragraphsResponse.ok) {
      throw new Error(`HTTP error fetching demo paragraphs! status: ${paragraphsResponse.status}`);
    }
    if (!configResponse.ok) {
      throw new Error(`HTTP error fetching demo config! status: ${configResponse.status}`);
    }

    const paragraphs: ParagraphData[] = await paragraphsResponse.json();
    const config = await configResponse.json();
    
    // Создаем фиктивную сессию на основе локальных данных
    const demoSession: AnalysisSession = {
      session_id: "demo-session",
      topic: config.topicName || "Демонстрационные данные",
      paragraphs,
      metadata: {
        source: "demo",
        timestamp: new Date().toISOString()
      }
    };
    
    return demoSession;
  } catch (error) {
    console.error("Error loading demo data:", error);
    throw new Error("Не удалось загрузить демонстрационные данные");
  }
}

// Вспомогательная функция для экспорта (если реализовано в API)
export async function exportAnalysis(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/${sessionId}?format=${format}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.blob();
}
```

### 3. Расширение компонента `App.tsx`

Обновите корневой компонент для управления сессией анализа:

```tsx
// src/App.tsx
import React, { useState } from 'react';
import CardList from './components/CardView/CardList';
import TextInput from './components/TextInput'; // Новый компонент для ввода текста
import { initializeAnalysis, loadDemoData } from './api';
import { AnalysisSession } from './components/CardView/types';

function App() {
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Обработчик отправки текста на анализ
  const handleAnalyzeText = async (text: string, topic: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const analysisSession = await initializeAnalysis(text, topic);
      setSession(analysisSession);
      // Устанавливаем заголовок вкладки
      document.title = analysisSession.topic || "Анализ текста";
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при анализе текста');
      console.error('Ошибка при анализе:', err);
    } finally {
      setLoading(false);
    }
  };

  // Обработчик загрузки демо-данных
  const handleLoadDemoData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const demoSession = await loadDemoData();
      setSession(demoSession);
      // Устанавливаем заголовок вкладки
      document.title = demoSession.topic || "Демо данные";
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке демо-данных');
      console.error('Ошибка при загрузке демо:', err);
    } finally {
      setLoading(false);
    }
  };

  // Обработчик сброса сессии (возврат к форме ввода)
  const handleReset = () => {
    setSession(null);
    setError(null);
    document.title = "Анализатор текста";
  };

  return (
    <div className="app-container">
      {!session ? (
        // Если сессия не инициализирована, показываем форму ввода текста
        <TextInput 
          onSubmit={handleAnalyzeText} 
          loading={loading} 
          error={error}
          onDemoDataClick={handleLoadDemoData}
        />
      ) : (
        // Если сессия инициализирована, показываем список карточек
        <CardList 
          initialSession={session} 
          onReset={handleReset} 
        />
      )}
    </div>
  );
}

export default App;
```

### 4. Создание компонента для ввода текста

Создайте компонент `src/components/TextInput.tsx`:

```tsx
// src/components/TextInput.tsx
import React, { useState } from 'react';

interface TextInputProps {
  onSubmit: (text: string, topic: string) => void;
  loading: boolean;
  error: string | null;
  onDemoDataClick?: () => void;
}

const TextInput: React.FC<TextInputProps> = ({ 
  onSubmit, 
  loading, 
  error,
  onDemoDataClick 
}) => {
  const [text, setText] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  
  // Состояние для показа инструкции
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && topic.trim()) {
      onSubmit(text, topic);
    }
  };

  // Стили
  const containerStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  };

  const titleStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '1.8rem',
    marginBottom: '20px',
    color: '#333'
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '15px'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '1rem'
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '200px',
    resize: 'vertical'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    fontSize: '1rem',
    fontWeight: 'bold'
  };

  const demoButtonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    marginLeft: '10px'
  };

  const errorStyle: React.CSSProperties = {
    color: 'red',
    marginTop: '10px',
    padding: '10px',
    backgroundColor: '#ffeeee',
    borderRadius: '4px',
    borderLeft: '3px solid red'
  };

  const instructionsToggleStyle: React.CSSProperties = {
    marginTop: '15px',
    marginBottom: '15px',
    color: '#2196F3',
    cursor: 'pointer',
    textDecoration: 'underline',
    display: 'inline-block'
  };

  const instructionsStyle: React.CSSProperties = {
    backgroundColor: '#f9f9f9',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '20px',
    border: '1px solid #eaeaea'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Анализатор текста</h1>
      
      <div 
        style={instructionsToggleStyle}
        onClick={() => setShowInstructions(!showInstructions)}
      >
        {showInstructions ? '▼ Скрыть инструкции' : '▶ Показать инструкции'}
      </div>
      
      {showInstructions && (
        <div style={instructionsStyle}>
          <h3>Как использовать анализатор текста:</h3>
          <ol>
            <li>Введите тему анализа в соответствующее поле</li>
            <li>Вставьте или введите текст для анализа</li>
            <li>Нажмите кнопку "Анализировать" для обработки текста</li>
            <li>После анализа вы сможете просматривать и редактировать абзацы</li>
          </ol>
          <p>Анализатор разбивает текст на абзацы и вычисляет для каждого:</p>
          <ul>
            <li><strong>Сигнал</strong> - значимость абзаца (от 0 до 1)</li>
            <li><strong>Сложность</strong> - семантическая сложность текста (от 0 до 1)</li>
            <li><strong>Семантическую функцию</strong> - роль абзаца в тексте</li>
          </ul>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label htmlFor="topic" style={labelStyle}>
            Тема анализа:
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={inputStyle}
            placeholder="Например: Объяснение эмбеддингов, токенов и чанкинга"
            required
          />
        </div>
        
        <div style={formGroupStyle}>
          <label htmlFor="text" style={labelStyle}>
            Текст для анализа:
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={textareaStyle}
            placeholder="Вставьте или введите текст для анализа..."
            required
          />
        </div>
        
        <div style={{ display: 'flex' }}>
          <button
            type="submit"
            disabled={loading}
            style={buttonStyle}
          >
            {loading ? 'Анализ...' : 'Анализировать'}
          </button>
          
          {onDemoDataClick && (
            <button
              type="button"
              onClick={onDemoDataClick}
              style={demoButtonStyle}
              disabled={loading}
            >
              Загрузить демо-данные
            </button>
          )}
        </div>
        
        {error && (
          <div style={errorStyle}>
            <strong>Ошибка:</strong> {error}
          </div>
        )}
      </form>
    </div>
  );
};

export default TextInput;
```

### 5. Модификация компонента CardList

Обновите `src/components/CardView/CardList.tsx` для работы с данными из API:

```tsx
import React, { useEffect, useState, useMemo } from 'react';
import Card from './Card';
import { ParagraphData, AnalysisSession } from './types';
import { fetchAnalysis, updateParagraph } from '../../api';

// Типы для сортировки и фильтрации
type SortField = 'paragraph_id' | 'signal_strength' | 'complexity' | 'semantic_function';
type SortDirection = 'asc' | 'desc';

// Цвета по умолчанию
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"; // Белый
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"; // Горчичный
const DEFAULT_COMPLEXITY_MIN_COLOR = "#008000"; // Зеленый
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"; // Красный

interface CardListProps {
  initialSession: AnalysisSession;
  onReset: () => void;
}

const CardList: React.FC<CardListProps> = ({ initialSession, onReset }) => {
  const [session, setSession] = useState<AnalysisSession>(initialSession);
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>(initialSession.paragraphs);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [signalRange, setSignalRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });
  const [complexityRange, setComplexityRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });
  
  const [fontSizeValue, setFontSizeValue] = useState<number>(12);

  // Состояния для цветов
  const [signalMinColor, setSignalMinColor] = useState<string>(DEFAULT_SIGNAL_MIN_COLOR);
  const [signalMaxColor, setSignalMaxColor] = useState<string>(DEFAULT_SIGNAL_MAX_COLOR);
  const [complexityMinColor, setComplexityMinColor] = useState<string>(DEFAULT_COMPLEXITY_MIN_COLOR);
  const [complexityMaxColor, setComplexityMaxColor] = useState<string>(DEFAULT_COMPLEXITY_MAX_COLOR);

  // Состояния для сортировки и фильтрации
  const [sortField, setSortField] = useState<SortField>('paragraph_id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [semanticFilter, setSemanticFilter] = useState<string>('all');
  const [availableSemanticFunctions, setAvailableSemanticFunctions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Состояние для отслеживания редактируемого абзаца
  const [editingParagraphId, setEditingParagraphId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    // Инициализация данных из сессии
    if (paragraphs.length > 0) {
      // Получение уникальных семантических функций
      const semanticFunctions = [...new Set(paragraphs
        .map(p => p.semantic_function || 'Не определено')
        .filter(Boolean))];
      setAvailableSemanticFunctions(semanticFunctions);
      
      // Вычисление диапазонов значений для сигнала и сложности
      const signals = paragraphs.map(p => p.signal_strength);
      const complexities = paragraphs.map(p => p.complexity);
      
      setSignalRange({ 
        min: Math.min(...signals), 
        max: Math.max(...signals) 
      });
      
      setComplexityRange({ 
        min: Math.min(...complexities), 
        max: Math.max(...complexities) 
      });
      
      // Установка заголовка страницы
      document.title = session.topic || "Card View";
    }
  }, [paragraphs, session.topic]);

  // Функция для обновления данных сессии
  const refreshSessionData = async () => {
    setLoading(true);
    try {
      const refreshedSession = await fetchAnalysis(session.session_id);
      setSession(refreshedSession);
      setParagraphs(refreshedSession.paragraphs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при обновлении данных');
    } finally {
      setLoading(false);
    }
  };

  // Функция для начала редактирования абзаца
  const startEditing = (paragraph: ParagraphData) => {
    setEditingParagraphId(paragraph.paragraph_id);
    setEditingText(paragraph.text);
  };

  // Функция для отмены редактирования
  const cancelEditing = () => {
    setEditingParagraphId(null);
    setEditingText('');
  };

  // Функция для сохранения изменений абзаца
  const saveEditing = async () => {
    if (editingParagraphId === null) return;
    
    setSaving(true);
    try {
      const response = await updateParagraph(
        session.session_id,
        editingParagraphId,
        editingText
      );
      
      // Обновляем локальный массив абзацев
      setParagraphs(prev => prev.map(p => 
        p.paragraph_id === editingParagraphId 
          ? response.paragraph 
          : p
      ));
      
      setEditingParagraphId(null);
      setEditingText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка при сохранении изменений');
    } finally {
      setSaving(false);
    }
  };

  // Функция для изменения направления сортировки
  const toggleSortDirection = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // Функция для изменения поля сортировки
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      toggleSortDirection();
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Применяем фильтры и сортировку к абзацам на стороне клиента
  const filteredAndSortedParagraphs = useMemo(() => {
    // Сначала применяем фильтр по семантической функции
    let result = [...paragraphs];
    
    if (semanticFilter !== 'all') {
      result = result.filter(p => 
        (p.semantic_function || 'Не определено') === semanticFilter
      );
    }

    // Применяем поисковый запрос
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.text.toLowerCase().includes(query)
      );
    }
    
    // Затем сортируем
    return result.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      // Обработка undefined значений
      if (aValue === undefined) aValue = sortField === 'semantic_function' ? 'Не определено' : 0;
      if (bValue === undefined) bValue = sortField === 'semantic_function' ? 'Не определено' : 0;
      
      // Сравнение значений в зависимости от направления сортировки
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }, [paragraphs, sortField, sortDirection, semanticFilter, searchQuery]);

  // Стили для панели управления и элементов управления...
  // (предполагается, что они будут скопированы из предыдущей версии компонента)

  // Возвращаем JSX интерфейса
  return (
    <div style={{ maxWidth: '950px', margin: '20px auto', padding: '0 15px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '1.44rem' }}>
        {session.topic || "Анализ текста"}
        <button 
          onClick={onReset}
          style={{
            marginLeft: '10px',
            padding: '5px 10px',
            fontSize: 'small',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Назад к вводу текста
        </button>
      </h1>

      {/* Панель управления с фильтрами, сортировкой и настройками отображения */}
      {/* ... */}

      {/* Информация о количестве отображаемых карточек */}
      <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: '#666' }}>
        Показано {filteredAndSortedParagraphs.length} из {paragraphs.length} абзацев
        {loading && <span style={{ marginLeft: '10px' }}>Загрузка...</span>}
        {error && (
          <div style={{ color: 'red', marginTop: '5px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Список карточек */}
      {filteredAndSortedParagraphs.length === 0 && !loading && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Нет абзацев для отображения.
        </div>
      )}
      
      {filteredAndSortedParagraphs.map((p) => (
        <Card
          key={p.paragraph_id}
          paragraph={p}
          minSignal={signalRange.min}
          maxSignal={signalRange.max}
          minComplexity={complexityRange.min}
          maxComplexity={complexityRange.max}
          fontSize={`${fontSizeValue}pt`}
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
          isEditing={editingParagraphId === p.paragraph_id}
          editingText={editingParagraphId === p.paragraph_id ? editingText : ''}
          onEditingTextChange={setEditingText}
          onStartEditing={() => startEditing(p)}
          onSave={saveEditing}
          onCancel={cancelEditing}
          isSaving={saving}
        />
      ))}
    </div>
  );
};

export default CardList;
```

### 6. Обновление компонента Card

Доработайте компонент `src/components/CardView/Card.tsx` для поддержки редактирования:

````tsx
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
  // Новые props для редактирования
  isEditing: boolean;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEditing: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

// В JSX добавьте интерфейс редактирования
return (
  <div style={cardStyle}>
    <div style={metaInfoStyle}>
      <div>
        ID: {paragraph.paragraph_id} | Сигнал: {paragraph.signal_strength.toFixed(3)} | 
        Сложность: {paragraph.complexity.toFixed(3)} | 
        Семантика: {paragraph.semantic_function || 'Не определено'}
      </div>
      
      {!isEditing && (
        <button 
          onClick={onStartEditing}
          style={buttonStyle}
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
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '8px',
            fontSize: fontSize,
            marginBottom: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical'
          }}
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
      marginTop: '10px',
      fontSize: `calc(${fontSize} * 0.7)`,
      color: '#555'
    }}>
      <div>
        <div style={{ marginBottom: '2px' }}>Сигнал:</div>
        <div style={{ 
          width: '100px', 
          height: '6px', 
          backgroundColor: '#eee',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            width: `${normalizedSignal * 100}%`, 
            height: '100%', 
            backgroundColor: signalMaxColor 
          }} />
        </div>
      </div>
      
      <div>
        <div style={{ marginBottom: '2px' }}>Сложность:</div>
        <div style={{ 
          width: '100px', 
          height: '6px', 
          backgroundColor: '#eee',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{ 
            width: `${normalizedComplexity * 100}%`, 
            height: '100%', 
            backgroundColor: complexityMaxColor 
          }} />
        </div>
      </div>
    </div>
  </div>
);### 1. Обновление типов данных

Обновите файл `src/components/CardView/types.ts` для соответствия формату данных API:

```typescript
// types.ts
export interface ParagraphData {
  paragraph_id: number;
  text: string;
  signal_strength: number;
  complexity: number;
  semantic_function?: string;
  semantic_method?: string;
  // Добавьте другие поля, которые возвращает API
}

export interface AnalysisSession {
  session_id: string;
  topic: string;
  paragraphs: ParagraphData[];
  metadata?: {
    timestamp?: string;
    [key: string]: any;
  };
}

export interface UpdateParagraphRequest {
  session_id: string;
  paragraph_id: number;
  text: string;
}

export interface UpdateParagraphResponse {
  paragraph: ParagraphData;
}
````

### 2. Создание API-клиента

Создайте файл `src/api/index.ts`:

```typescript
// src/api/index.ts
import { ParagraphData, AnalysisSession, UpdateParagraphRequest, UpdateParagraphResponse } from '../components/CardView/types';

// Базовый URL API
const API_URL = process.env.REACT_APP_API_URL || '/api';

// Инициализация анализа (для нового текста)
export async function initializeAnalysis(text: string, topic: string): Promise<AnalysisSession> {
  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, topic }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Получение результатов анализа по session_id
export async function fetchAnalysis(sessionId: string): Promise<AnalysisSession> {
  const response = await fetch(`${API_URL}/analysis/${sessionId}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Обновление текста абзаца
export async function updateParagraph(
  sessionId: string, 
  paragraphId: number, 
  text: string
): Promise<UpdateParagraphResponse> {
  const request: UpdateParagraphRequest = {
    session_id: sessionId,
    paragraph_id: paragraphId,
    text
  };
  
  const response = await fetch(`${API_URL}/update-paragraph`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Загруз# Руководство по интеграции фронтенда CardView с новой FastAPI архитектурой

## Обзор

Данный документ описывает пошаговую стратегию интеграции существующего React-фронтенда модуля CardView с новой серверной архитектурой на FastAPI. Документ охватывает необходимые изменения, структуру API, а также рекомендации по деплою.

## Содержание

1. [Текущая структура проекта](#текущая-структура-проекта)
2. [Архитектура интеграции](#архитектура-интеграции)
3. [Настройка FastAPI бэкенда](#настройка-fastapi-бэкенда)
4. [Адаптация фронтенда](#адаптация-фронтенда)
5. [Варианты деплоя](#варианты-деплоя)
6. [Дорожная карта развития](#дорожная-карта-развития)

## Текущая структура проекта

### Фронтенд

Текущий фронтенд на React имеет следующую структуру:

```

frontend/my-card-view-app/ ├── public/ │ ├── card_view_data.json # Тестовые данные абзацев │ └── config.json # Конфигурация приложения ├── src/ │ ├── components/ │ │ └── CardView/ │ │ ├── Card.tsx # Компонент отдельной карточки │ │ ├── CardList.tsx # Список карточек с управлением │ │ └── types.ts # Типы данных │ ├── App.tsx # Корневой компонент │ └── main.tsx # Точка входа └── ...

````

### Новый бэкенд

Бэкенд на FastAPI планируется строить с использованием сервисного подхода, асинхронности и модулей анализа.

## Архитектура интеграции

![Архитектура интеграции](https://via.placeholder.com/800x400?text=Интеграция+React+и+FastAPI)

Предлагаемая архитектура интеграции:

1. **Frontend (React)** - отвечает за отображение и взаимодействие с пользователем
2. **Backend (FastAPI)** - предоставляет API для:
   - Получения проанализированных данных абзацев
   - Конфигурации отображения
   - Выполнения аналитических операций

## Настройка FastAPI бэкенда

### 1. Структура API и маршрутизация

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import paragraphs, config, analysis

app = FastAPI(
    title="Jeeves Text Analytics API",
    description="API для текстового анализатора Jeeves с визуализацией CardView"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # URL React-приложения в режиме разработки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(paragraphs.router, prefix="/api", tags=["paragraphs"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(analysis.router, prefix="/api", tags=["analysis"])
````

### 2. Роутер для абзацев

```python
# routers/paragraphs.py
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from ..services.paragraph_service import ParagraphService
from ..schemas.paragraph import Paragraph, ParagraphCreate, ParagraphUpdate

router = APIRouter()

@router.get("/paragraphs", response_model=List[Paragraph])
async def get_paragraphs(
    semantic_function: Optional[str] = None,
    min_signal: Optional[float] = None,
    max_signal: Optional[float] = None,
    min_complexity: Optional[float] = None,
    max_complexity: Optional[float] = None,
    search_query: Optional[str] = None,
    service: ParagraphService = Depends()
):
    """
    Получить список абзацев с возможностью фильтрации.
    
    - **semantic_function**: Фильтр по семантической функции
    - **min_signal/max_signal**: Диапазон значений силы сигнала
    - **min_complexity/max_complexity**: Диапазон значений сложности
    - **search_query**: Поиск по тексту
    """
    return await service.get_paragraphs(
        semantic_function=semantic_function,
        min_signal=min_signal,
        max_signal=max_signal,
        min_complexity=min_complexity,
        max_complexity=max_complexity,
        search_query=search_query
    )

@router.get("/paragraphs/{paragraph_id}", response_model=Paragraph)
async def get_paragraph(paragraph_id: int, service: ParagraphService = Depends()):
    """Получить данные конкретного абзаца по ID"""
    paragraph = await service.get_paragraph(paragraph_id)
    if paragraph is None:
        raise HTTPException(status_code=404, detail="Абзац не найден")
    return paragraph

# Дополнительные эндпоинты для создания/обновления/удаления абзацев...
```

### 3. Роутер для конфигурации

```python
# routers/config.py
from fastapi import APIRouter, Depends
from ..services.config_service import ConfigService
from ..schemas.config import AppConfig

router = APIRouter()

@router.get("/config", response_model=AppConfig)
async def get_config(service: ConfigService = Depends()):
    """Получить текущую конфигурацию приложения"""
    return await service.get_config()

@router.put("/config", response_model=AppConfig)
async def update_config(config: AppConfig, service: ConfigService = Depends()):
    """Обновить конфигурацию приложения"""
    return await service.update_config(config)
```

### 4. Определение схем данных

```python
# schemas/paragraph.py
from pydantic import BaseModel, Field
from typing import Optional

class ParagraphBase(BaseModel):
    text: str
    signal_strength: float = Field(..., ge=0, le=1)
    complexity: float = Field(..., ge=0, le=1)
    semantic_function: Optional[str] = None

class ParagraphCreate(ParagraphBase):
    pass

class ParagraphUpdate(ParagraphBase):
    text: Optional[str] = None
    signal_strength: Optional[float] = Field(None, ge=0, le=1)
    complexity: Optional[float] = Field(None, ge=0, le=1)
    semantic_function: Optional[str] = None

class Paragraph(ParagraphBase):
    paragraph_id: int

    class Config:
        from_attributes = True
```

```python
# schemas/config.py
from pydantic import BaseModel

class AppConfig(BaseModel):
    topicName: str
    # Другие параметры конфигурации...
```

### 5. Сервисы для работы с данными

```python
# services/paragraph_service.py
from typing import List, Optional
from ..schemas.paragraph import Paragraph, ParagraphCreate, ParagraphUpdate
from ..db.repository import ParagraphRepository

class ParagraphService:
    def __init__(self, repo: ParagraphRepository = None):
        self.repo = repo or ParagraphRepository()
    
    async def get_paragraphs(
        self,
        semantic_function: Optional[str] = None,
        min_signal: Optional[float] = None,
        max_signal: Optional[float] = None,
        min_complexity: Optional[float] = None,
        max_complexity: Optional[float] = None,
        search_query: Optional[str] = None
    ) -> List[Paragraph]:
        """Получить список абзацев с применением фильтров"""
        return await self.repo.get_paragraphs(
            semantic_function=semantic_function,
            min_signal=min_signal,
            max_signal=max_signal,
            min_complexity=min_complexity,
            max_complexity=max_complexity,
            search_query=search_query
        )
    
    async def get_paragraph(self, paragraph_id: int) -> Optional[Paragraph]:
        """Получить абзац по ID"""
        return await self.repo.get_paragraph(paragraph_id)
    
    # Дополнительные методы...
```

## Адаптация фронтенда

### 1. Создание API-клиента

Создайте файл `src/api/index.ts`:

```typescript
// src/api/index.ts
import { ParagraphData } from '../components/CardView/types';

// Базовый URL API
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

// Интерфейс для параметров фильтрации
export interface ParagraphFilters {
  semantic_function?: string;
  min_signal?: number;
  max_signal?: number;
  min_complexity?: number;
  max_complexity?: number;
  search_query?: string;
}

// Получение списка абзацев с фильтрацией
export async function fetchParagraphs(filters: ParagraphFilters = {}): Promise<ParagraphData[]> {
  // Формирование query-параметров
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, value.toString());
    }
  });
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  
  const response = await fetch(`${API_URL}/paragraphs${queryString}`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Получение конфигурации приложения
export async function fetchConfig() {
  const response = await fetch(`${API_URL}/config`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Получение конкретного абзаца по ID
export async function fetchParagraph(id: number): Promise<ParagraphData> {
  const response = await fetch(`${API_URL}/paragraphs/${id}`);
  
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  
  return response.json();
}

// Функции для обновления абзацев и другие API-вызовы...
```

### 2. Модификация компонента CardList

Обновите `src/components/CardView/CardList.tsx` для использования API:

```typescript
// Вместо прямого импорта данных из JSON-файлов:
import { fetchParagraphs, fetchConfig, ParagraphFilters } from '../../api';

const CardList: React.FC = () => {
  // ... существующие состояния ...
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Создаем объект фильтров
        const filters: ParagraphFilters = {
          semantic_function: semanticFilter !== 'all' ? semanticFilter : undefined,
          search_query: searchQuery.trim() || undefined
          // Можно добавить другие параметры...
        };
        
        // Используем API-клиент для запросов
        const [paragraphsData, configData] = await Promise.all([
          fetchParagraphs(filters),
          fetchConfig()
        ]);
        
        setParagraphs(paragraphsData);
        setConfig(configData);
        document.title = configData.topicName || "Card View";
        
        // Остальной код обработки данных...
      } catch (e) {
        // Обработка ошибок...
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [semanticFilter, searchQuery]); // Зависимости для повторного запроса при изменении фильтров
  
  // Остальной код компонента...
};
```

## Варианты деплоя

### Вариант 1: Раздельный деплой

1. **Frontend**:
    
    - Собрать React-приложение: `npm run build`
    - Разместить собранные статические файлы на любом статическом хостинге (Nginx, Apache, S3, Netlify, Vercel)
    - Настроить переменную окружения `REACT_APP_API_URL` с адресом бэкенда
2. **Backend**:
    
    - Развернуть FastAPI на сервере с поддержкой ASGI (Uvicorn, Hypercorn)
    - Настроить CORS для доступа со статического хостинга

### Вариант 2: Монолитный деплой через FastAPI

```python
# main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Подключение API-роутеров
# ...

# Настройка раздачи статических файлов React-приложения
app.mount("/", StaticFiles(directory="frontend/my-card-view-app/dist", html=True), name="static")
```

1. Собрать React-приложение в директорию `/frontend/my-card-view-app/dist`
2. Настроить базовый URL API как относительный: `/api`
3. Развернуть FastAPI, который будет раздавать и API, и статику для фронтенда

### Вариант 3: Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/jeeves
    depends_on:
      - db
    volumes:
      - ./backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    volumes:
      - ./frontend/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=jeeves
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Дорожная карта развития

1. **Этап 1: Базовая интеграция**
    
    - Настройка API-эндпоинтов для текущего функционала
    - Адаптация фронтенда для работы с новым API
    - Базовое тестирование интеграции
2. **Этап 2: Расширенная функциональность**
    
    - Добавление вебсокетов для онлайн-обновления данных
    - Реализация функционала редактирования абзацев
    - Добавление функций кастомного анализа текста
3. **Этап 3: Оптимизация производительности**
    
    - Кэширование результатов с использованием Redis
    - Оптимизация запросов к базе данных
    - Внедрение поддержки работы с GPU для тяжелых аналитических задач

## Заключение

Предложенная стратегия интеграции фронтенда CardView с существующей архитектурой FastAPI позволяет эффективно использовать уже реализованный API, работающий на основе "сессий анализа". Такой подход минимизирует необходимые изменения в бэкенде и сосредотачивается на адаптации фронтенда к текущему API.

Ключевые преимущества выбранной стратегии:

1. **Быстрая реализация** - существующие эндпоинты API уже обеспечивают основную функциональность, необходимую для CardView
2. **Минимальные изменения в бэкенде** - не требуется внедрять новую систему хранения данных или переписывать API
3. **Поэтапное развитие** - возможность постепенно улучшать как фронтенд, так и бэкенд без необходимости полной переработки системы
4. **Сохранение текущей логики работы с сессиями** - поддержка существующей модели работы с текстом как единым целым

Следующими шагами рекомендуются:

1. Реализация базового интерфейса для ввода текста и работы с карточками
2. Тестирование взаимодействия с API и отработка потенциальных ошибок
3. Постепенное внедрение дополнительных функций (редактирование, фильтрация, экспорт)

Этот подход обеспечит плавную интеграцию и позволит быстро получить рабочий прототип с возможностью дальнейшего развития.ключение

Данный план интеграции обеспечивает постепенный и плавный переход от текущего статичного прототипа к полноценному интерактивному приложению с использованием новой архитектуры FastAPI. Подход позволяет сохранить существующий код фронтенда и одновременно расширить его возможности через взаимодействие с мощным и гибким бэкендом.
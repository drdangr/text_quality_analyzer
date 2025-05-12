import React, { useEffect, useState } from 'react';
import Card from './Card';
import type { ParagraphData } from './types'; // Используем type-only import

interface AppConfig {
  topicName: string;
}

// Цвета по умолчанию
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"; // Белый
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"; // Горчичный (был rgb(255, 219, 88))
const DEFAULT_COMPLEXITY_MIN_COLOR = "#008000"; // Зеленый (был rgb(0, 128, 0))
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"; // Красный (был rgb(255, 0, 0))

const CardList: React.FC = () => {
  const [paragraphs, setParagraphs] = useState<ParagraphData[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [signalRange, setSignalRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });
  const [complexityRange, setComplexityRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });
  
  const [fontSizeValue, setFontSizeValue] = useState<number>(12); // Значение по умолчанию - число

  // Состояния для цветов
  const [signalMinColor, setSignalMinColor] = useState<string>(DEFAULT_SIGNAL_MIN_COLOR);
  const [signalMaxColor, setSignalMaxColor] = useState<string>(DEFAULT_SIGNAL_MAX_COLOR);
  const [complexityMinColor, setComplexityMinColor] = useState<string>(DEFAULT_COMPLEXITY_MIN_COLOR);
  const [complexityMaxColor, setComplexityMaxColor] = useState<string>(DEFAULT_COMPLEXITY_MAX_COLOR);

  // Состояния для пользовательских границ
  const [customSignalMin, setCustomSignalMin] = useState<string>('');
  const [customSignalMax, setCustomSignalMax] = useState<string>('');
  const [customComplexityMin, setCustomComplexityMin] = useState<string>('');
  const [customComplexityMax, setCustomComplexityMax] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Загружаем параллельно данные абзацев и конфиг
        const [paragraphsResponse, configResponse] = await Promise.all([
          fetch('/card_view_data.json'),
          fetch('/config.json')
        ]);

        if (!paragraphsResponse.ok) {
          throw new Error(`HTTP error fetching paragraphs! status: ${paragraphsResponse.status}`);
        }
        if (!configResponse.ok) {
          throw new Error(`HTTP error fetching config! status: ${configResponse.status}`);
        }

        const paragraphsData: ParagraphData[] = await paragraphsResponse.json();
        const configData: AppConfig = await configResponse.json();
        
        setParagraphs(paragraphsData);
        setConfig(configData);
        document.title = configData.topicName || "Card View"; // Устанавливаем заголовок вкладки

        if (paragraphsData.length > 0) {
          const signals = paragraphsData.map(p => p.signal_strength);
          const complexities = paragraphsData.map(p => p.complexity);
          
          const sigMin = Math.min(...signals);
          const sigMax = Math.max(...signals);
          const compMin = Math.min(...complexities);
          const compMax = Math.max(...complexities);
          
          setSignalRange({ min: sigMin, max: sigMax });
          setComplexityRange({ min: compMin, max: compMax });
          
          // Заполняем поля пользовательских границ начальными значениями
          setCustomSignalMin(sigMin.toFixed(3));
          setCustomSignalMax(sigMax.toFixed(3));
          setCustomComplexityMin(compMin.toFixed(3));
          setCustomComplexityMax(compMax.toFixed(3));
        }

      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Произошла неизвестная ошибка при загрузке данных.");
        }
        console.error("Failed to fetch data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Пустой массив зависимостей означает, что эффект выполнится один раз при монтировании

  // Функция для применения пользовательских границ
  const applyCustomRange = (value: string, type: 'signalMin' | 'signalMax' | 'complexityMin' | 'complexityMax') => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    switch (type) {
      case 'signalMin':
        setSignalRange(prev => ({ 
          min: Math.min(numValue, prev.max), 
          max: prev.max
        }));
        break;
      case 'signalMax':
        setSignalRange(prev => ({ 
          min: prev.min, 
          max: Math.max(numValue, prev.min) 
        }));
        break;
      case 'complexityMin':
        setComplexityRange(prev => ({ 
          min: Math.min(numValue, prev.max), 
          max: prev.max 
        }));
        break;
      case 'complexityMax':
        setComplexityRange(prev => ({ 
          min: prev.min, 
          max: Math.max(numValue, prev.min) 
        }));
        break;
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка данных...</div>;
  }

  if (error) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Ошибка загрузки данных: {error}</div>;
  }

  // Заголовок по умолчанию, если конфиг не загрузился
  const pageTitle = config?.topicName || "Карточки абзацев";

  // --- Стили для панели управления ---
  const controlPanelStyle: React.CSSProperties = {
    marginBottom: '20px',
    padding: '10px',
    border: '1px solid #eee',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const controlRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '15px',
    alignItems: 'center',
  };

  const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  };

  const numberInputStyle: React.CSSProperties = {
    width: '60px',
    padding: '5px',
  };

  const minMaxGroupStyle: React.CSSProperties = {
    display: 'flex', 
    alignItems: 'center',
    gap: '5px',
    flexWrap: 'wrap',
  };

  const currentFontSizeProp = `${fontSizeValue}pt`;

  return (
    <div style={{ maxWidth: '950px', margin: '20px auto', padding: '0 15px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '1.44rem' }}>{pageTitle}</h1>

      <div style={controlPanelStyle}>
        <div style={controlRowStyle}>
          <div style={controlGroupStyle}>
            <label htmlFor="fontSizeInput">Размер шрифта: </label>
            <input
              type="number"
              id="fontSizeInput"
              value={fontSizeValue}
              onChange={(e) => setFontSizeValue(parseInt(e.target.value, 10) || 0)} 
              style={numberInputStyle} 
              min="1" 
            />
            <span style={{ marginLeft: '2px' }}>pt</span>
          </div>
          
          <div style={minMaxGroupStyle}>
            <label>Сигнал:</label>
            <div style={controlGroupStyle}>
              <label htmlFor="sigMinColor">Мин:</label>
              <input type="color" id="sigMinColor" value={signalMinColor} onChange={e => setSignalMinColor(e.target.value)} />
            </div>
            <div style={controlGroupStyle}>
              <label htmlFor="sigMaxColor">Макс:</label>
              <input type="color" id="sigMaxColor" value={signalMaxColor} onChange={e => setSignalMaxColor(e.target.value)} />
            </div>
          </div>

          <div style={minMaxGroupStyle}>
            <label>Сложность:</label>
            <div style={controlGroupStyle}>
              <label htmlFor="compMinColor">Мин:</label>
              <input type="color" id="compMinColor" value={complexityMinColor} onChange={e => setComplexityMinColor(e.target.value)} />
            </div>
            <div style={controlGroupStyle}>
              <label htmlFor="compMaxColor">Макс:</label>
              <input type="color" id="compMaxColor" value={complexityMaxColor} onChange={e => setComplexityMaxColor(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {paragraphs.length === 0 && !loading && <div style={{ padding: '20px', textAlign: 'center' }}>Нет абзацев для отображения.</div>}
      {paragraphs.map((p) => (
        <Card
          key={p.paragraph_id}
          paragraph={p}
          minSignal={signalRange.min}
          maxSignal={signalRange.max}
          minComplexity={complexityRange.min}
          maxComplexity={complexityRange.max}
          fontSize={currentFontSizeProp}
          // Передаем цвета
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
        />
      ))}
    </div>
  );
};

export default CardList; 
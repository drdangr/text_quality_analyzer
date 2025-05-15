import React, { useState, useRef } from 'react';

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
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && topic.trim()) {
      onSubmit(text, topic);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Проверяем тип файла (допускаем текстовые файлы)
    if (!file.type.match('text.*') && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      setFileError('Пожалуйста, загрузите текстовый файл (.txt, .md или другой текстовый формат)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    // Максимальный размер файла: 1MB
    if (file.size > 1024 * 1024) {
      setFileError('Размер файла не должен превышать 1MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setText(content || '');
    };
    
    reader.onerror = () => {
      setFileError('Ошибка при чтении файла');
    };
    
    reader.readAsText(file);
  };

  const handleUploadButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Инлайн-стили (как в вашем документе)
  const containerStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '40px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    borderRadius: '8px',
    backgroundColor: '#fff'
  };

  const titleStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '2rem',
    marginBottom: '30px',
    color: '#333'
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '20px'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    fontSize: '0.9rem',
    color: '#555'
  };

  const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box' // Важно для корректной ширины с padding и border
  };

  const textareaStyle: React.CSSProperties = {
    ...inputBaseStyle,
    minHeight: '250px',
    resize: 'vertical',
    fontFamily: 'inherit'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 25px',
    backgroundColor: '#5cb85c', // Зеленый
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    fontSize: '1rem',
    fontWeight: 'bold',
    transition: 'background-color 0.2s ease'
  };

  const demoButtonStyle: React.CSSProperties = {
    ...buttonStyle, // Наследуем основные стили
    backgroundColor: '#337ab7', // Синий
    marginLeft: '15px'
  };

  const uploadButtonStyle: React.CSSProperties = {
    ...buttonStyle, // Наследуем основные стили
    backgroundColor: '#f0ad4e', // Оранжевый
    marginLeft: '15px'
  };

  const errorStyle: React.CSSProperties = {
    color: '#a94442', // Темно-красный
    marginTop: '15px',
    padding: '12px',
    backgroundColor: '#f2dede', // Светло-розовый
    borderRadius: '4px',
    border: '1px solid #ebccd1' // Розовая рамка
  };

  const instructionsToggleStyle: React.CSSProperties = {
    marginTop: '20px',
    marginBottom: '10px',
    color: '#337ab7',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    fontWeight: 'bold',
    fontSize: '0.9rem'
  };

  const instructionsStyle: React.CSSProperties = {
    backgroundColor: '#f9f9f9',
    padding: '15px 20px',
    borderRadius: '4px',
    marginBottom: '25px',
    border: '1px solid #eee',
    fontSize: '0.9rem',
    lineHeight: '1.6'
  };

  const fileInputStyle: React.CSSProperties = {
    display: 'none'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Анализатор Качества Текста</h1>
      
      <div 
        role="button"
        tabIndex={0}
        style={instructionsToggleStyle}
        onClick={() => setShowInstructions(!showInstructions)}
        onKeyPress={(e) => e.key === 'Enter' && setShowInstructions(!showInstructions)} // Для доступности
      >
        {showInstructions ? '▼ Скрыть инструкции' : '▶ Показать инструкции'}
      </div>
      
      {showInstructions && (
        <div style={instructionsStyle}>
          <h3>Как использовать анализатор:</h3>
          <ol>
            <li><strong>Тема анализа:</strong> Введите ключевую тему или вопрос, относительно которого будет оцениваться текст.</li>
            <li><strong>Текст для анализа:</strong> Вставьте, напишите текст или загрузите файл с текстом, который вы хотите проанализировать. Абзацы разделяются пустой строкой.</li>
            <li>Нажмите кнопку <strong>"Анализировать"</strong>.</li>
            <li>После анализа вы увидите карточки с результатами для каждого абзаца. Вы сможете их просматривать и редактировать.</li>
          </ol>
          <p>Анализатор вычисляет следующие метрики:</p>
          <ul>
            <li><strong>Сигнал (Signal Strength):</strong> Насколько абзац релевантен заданной теме (0 до 1).</li>
            <li><strong>Сложность (Complexity):</strong> Комплексный показатель удобочитаемости текста (0 до 1, где выше - сложнее).</li>
            <li><strong>Семантическая функция:</strong> Роль абзаца в контексте всего текста (например, "раскрытие темы", "пример", "шум").</li>
          </ul>
          {onDemoDataClick && <p>Вы также можете <strong>Загрузить демо-данные</strong> для быстрого ознакомления с функционалом или <strong>Загрузить из файла</strong> для анализа содержимого текстового файла.</p>}
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
            style={inputBaseStyle} // Используем inputBaseStyle
            placeholder="Например: Объяснение эмбеддингов, токенов и чанкинга"
            required
            aria-describedby={error ? "error-message" : undefined}
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
            aria-describedby={error ? "error-message" : undefined}
          />
        </div>
        
        {/* Скрытый input для загрузки файла */}
        <input 
          type="file" 
          ref={fileInputRef}
          style={fileInputStyle}
          accept=".txt,.md,text/plain,text/markdown"
          onChange={handleFileUpload}
        />
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading || !text.trim() || !topic.trim()} // Блокируем, если поля пустые
            style={buttonStyle}
            title={(!text.trim() || !topic.trim()) ? "Пожалуйста, заполните тему и текст" : "Начать анализ"}
          >
            {loading ? 'Анализ...' : 'Анализировать'}
          </button>
          
          <button
            type="button"
            onClick={handleUploadButtonClick}
            style={uploadButtonStyle}
            disabled={loading}
          >
            Загрузить из файла
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
          <div id="error-message" style={errorStyle} role="alert">
            <strong>Ошибка:</strong> {error}
          </div>
        )}
        
        {fileError && (
          <div id="file-error-message" style={errorStyle} role="alert">
            <strong>Ошибка загрузки файла:</strong> {fileError}
          </div>
        )}
      </form>
    </div>
  );
};

export default TextInput; 
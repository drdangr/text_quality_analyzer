import React, { useState, useEffect, useRef } from 'react';

interface FullTextEditorProps {
  initialText?: string;
  initialTopic?: string;
  onSubmit: (text: string, topic: string) => void;
  onDemoDataClick?: () => void;
  loading: boolean;
  error: string | null;
  isBackendReady?: boolean;
  backendError?: string | null;
}

const FullTextEditor: React.FC<FullTextEditorProps> = ({ 
  initialText = '',
  initialTopic = '',
  onSubmit,
  onDemoDataClick,
  loading,
  error,
  isBackendReady = true,
  backendError = null
}) => {
  const [text, setText] = useState<string>(initialText);
  const [topic, setTopic] = useState<string>(initialTopic);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    setTopic(initialTopic);
  }, [initialTopic]);

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
    
    if (!file.type.match('text.*') && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      setFileError('Пожалуйста, загрузите текстовый файл (.txt, .md или другой текстовый формат)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    if (file.size > 1024 * 1024) { // 1MB limit
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

  const containerStyle: React.CSSProperties = {
    fontFamily: 'Arial, sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    borderRadius: '8px',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    margin: '20px 0',
    padding: '20px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    minHeight: 0,
  };

  const titleStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '2.2rem',
    marginBottom: '35px',
    color: '#333'
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '25px'
  };

  const textAreaGroupStyle: React.CSSProperties = {
    ...formGroupStyle,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minHeight: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '10px',
    fontWeight: 'bold',
    fontSize: '1rem',
    color: '#444'
  };

  const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    padding: '15px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box'
  };

  const textareaStyle: React.CSSProperties = {
    ...inputBaseStyle,
    flexGrow: 1,
    resize: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.6',
    overflowY: 'auto',
    minHeight: '150px',
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    gap: '15px',
    marginTop: '30px',
    flexWrap: 'wrap'
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 25px',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    fontSize: '1rem',
    fontWeight: 'bold',
    transition: 'background-color 0.2s ease'
  };
  
  const analyzeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#28a745',
  };

  const uploadButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#ffc107',
    color: '#212529'
  };
  
  const fileInputStyle: React.CSSProperties = {
    display: 'none'
  };

  const errorStyle: React.CSSProperties = {
    color: '#dc3545',
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#f8d7da',
    borderRadius: '5px',
    border: '1px solid #f5c6cb'
  };

  const formStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    height: '100%',
    minHeight: 0,
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Редактор Текста</h1>
      <form onSubmit={handleSubmit} style={formStyles}>
        <div style={formGroupStyle}>
          <label htmlFor="editorTopic" style={labelStyle}>Тема анализа:</label>
          <input
            id="editorTopic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={inputBaseStyle}
            placeholder="Введите тему для анализа текста..."
            required
          />
        </div>
        <div style={textAreaGroupStyle}>
          <label htmlFor="editorText" style={labelStyle}>Текст для анализа:</label>
          <textarea
            id="editorText"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={textareaStyle}
            placeholder="Введите или вставьте ваш текст сюда..."
            required
          />
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef}
          style={fileInputStyle}
          accept=".txt,.md,text/plain,text/markdown"
          onChange={handleFileUpload}
        />

        <div style={buttonContainerStyle}>
          <button
            type="submit"
            disabled={loading || !text.trim() || !topic.trim() || !isBackendReady}
            style={{
              ...analyzeButtonStyle,
              backgroundColor: !isBackendReady ? '#6c757d' : '#28a745',
            }}
            title={
              !isBackendReady ? "Ожидание подключения к бэкенду..." :
              (!text.trim() || !topic.trim()) ? "Пожалуйста, заполните тему и текст" : 
              "Анализировать и перейти к карточкам"
            }
          >
            {loading ? 'Анализ...' : 'Анализировать и перейти к карточкам'}
          </button>

          <button
            type="button"
            onClick={handleUploadButtonClick}
            style={uploadButtonStyle}
            disabled={loading}
          >
            Загрузить из файла
          </button>
        </div>
        
        {error && (
          <div style={errorStyle} role="alert">
            <strong>Ошибка:</strong> {error}
          </div>
        )}
        {fileError && (
          <div style={{...errorStyle, backgroundColor: '#fff3cd', borderColor: '#ffeeba', color: '#856404'}} role="alert">
            <strong>Ошибка файла:</strong> {fileError}
          </div>
        )}
      </form>
    </div>
  );
};

export default FullTextEditor; 
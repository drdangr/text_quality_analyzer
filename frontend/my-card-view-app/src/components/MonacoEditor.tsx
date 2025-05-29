// Monaco Editor с интеграцией в систему чанков

import React, { useRef, useEffect } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useDocumentStore } from '../store/documentStore';
import type { ChangeInfo } from '../types/chunks';

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string, changeInfo?: ChangeInfo) => void;
  height?: string;
  language?: string;
  options?: editor.IStandaloneEditorConstructionOptions;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  height = '200px',
  language = 'plaintext',
  options = {}
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Дефолтные настройки для нашего случая
  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'off',
    wordWrap: 'on',
    automaticLayout: false, // Отключаем для предотвращения проблем с layout
    // Отключаем автодополнение и подсказки
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'off',
    wordBasedSuggestions: 'off',
    quickSuggestions: false,
    parameterHints: { enabled: false },
    // Настройки скролла
    scrollbar: {
      horizontal: 'hidden',
      vertical: 'auto'
    }
  };

  // Объединяем настройки: дефолтные сначала, пользовательские перезаписывают
  const finalOptions = {
    ...defaultOptions,
    ...options
  };

  // Безопасный обработчик изменений
  const handleChange = (newValue: string | undefined) => {
    if (onChange && newValue !== undefined) {
      try {
        onChange(newValue);
      } catch (error) {
        console.warn('Ошибка при обработке изменения в Monaco Editor:', error);
      }
    }
  };

  // Безопасный обработчик монтирования
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    try {
      editorRef.current = editor;
      
      // Устанавливаем размеры вручную для предотвращения проблем с layout
      setTimeout(() => {
        try {
          if (editorRef.current) {
            editorRef.current.layout();
          }
        } catch (layoutError) {
          console.warn('Ошибка при установке layout Monaco Editor:', layoutError);
        }
      }, 100);
    } catch (mountError) {
      console.warn('Ошибка при монтировании Monaco Editor:', mountError);
    }
  };

  // Безопасная очистка при размонтировании
  useEffect(() => {
    return () => {
      try {
        if (editorRef.current) {
          editorRef.current.dispose();
          editorRef.current = null;
        }
      } catch (disposeError) {
        console.warn('Ошибка при очистке Monaco Editor:', disposeError);
      }
    };
  }, []);

  return (
    <div 
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
      className="monaco-container"
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          language={language}
          value={value}
          options={finalOptions}
          onChange={handleChange}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
};

export default MonacoEditor;
export { MonacoEditor }; 
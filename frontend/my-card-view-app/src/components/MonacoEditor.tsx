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
    automaticLayout: true,
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

  // Простой обработчик изменений без детального отслеживания
  const handleChange = (newValue: string | undefined) => {
    if (onChange && newValue !== undefined) {
      try {
        onChange(newValue);
      } catch (error) {
        console.warn('Ошибка при обработке изменения в Monaco Editor:', error);
      }
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <style>
        {`
          .monaco-editor .editor-scrollable {
            overflow-x: hidden !important;
          }
        `}
      </style>
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
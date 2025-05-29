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

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  height = '200px',
  language = 'plaintext',
  options = {}
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isUpdatingFromProps = useRef(false);
  const lastValue = useRef(value);

  // Дефолтные настройки для нашего случая
  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'off',
    wordWrap: 'on',
    automaticLayout: true,
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'off',
    wordBasedSuggestions: 'off',
    quickSuggestions: false,
    parameterHints: { enabled: false }
  };

  // Объединяем настройки: дефолтные сначала, пользовательские перезаписывают
  const finalOptions = {
    ...defaultOptions,
    ...options
  };

  console.log('🎨 Monaco Editor настройки:', {
    fontSize: finalOptions.fontSize,
    lineHeight: finalOptions.lineHeight
  });

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    
    console.log('🎯 Monaco Editor инициализирован');

    // Подписываемся на события изменений с детальной информацией
    editor.onDidChangeModelContent((e: editor.IModelContentChangedEvent) => {
      // Пропускаем события если мы сами обновляем редактор из props
      if (isUpdatingFromProps.current) {
        return;
      }

      const currentValue = editor.getValue();

      // Обрабатываем каждое изменение
      e.changes.forEach((change: editor.IModelContentChange, index: number) => {
        const changeInfo: ChangeInfo = {
          start: change.rangeOffset,
          end: change.rangeOffset + change.rangeLength,
          newText: change.text,
          oldText: lastValue.current.slice(
            change.rangeOffset, 
            change.rangeOffset + change.rangeLength
          )
        };

        // Передаем изменение в onChange
        if (onChange) {
          onChange(currentValue, changeInfo);
        }
      });

      // Обновляем последнее известное значение
      lastValue.current = currentValue;
    });
  };

  // Обновляем редактор при изменении value из props
  useEffect(() => {
    if (editorRef.current && value !== lastValue.current) {
      isUpdatingFromProps.current = true;
      editorRef.current.setValue(value);
      lastValue.current = value;
      isUpdatingFromProps.current = false;
    }
  }, [value]);

  return (
    <div className="border rounded">
      <style>
        {`
          .monaco-editor .view-lines .view-line {
            line-height: 13px !important;
          }
          .monaco-editor .margin {
            display: none !important;
          }
          .monaco-editor .view-zones {
            display: none !important;
          }
        `}
      </style>
      <Editor
        height={height}
        language={language}
        value={value}
        options={finalOptions}
        onMount={handleEditorDidMount}
      />
    </div>
  );
}; 
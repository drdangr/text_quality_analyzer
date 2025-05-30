// Monaco Editor с интеграцией в систему чанков

import React, { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useDocumentStore } from '../store/documentStore';
import type { ChangeInfo } from '../types/chunks';

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string, changeInfo?: ChangeInfo, cursorPosition?: number) => void;
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Дефолтные настройки для нашего случая
  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'off',
    wordWrap: 'on',
    automaticLayout: true, // ВКЛЮЧАЕМ автоматический layout
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
    },
    // Обеспечиваем адаптивность
    wordWrapColumn: 120,
    rulers: [],
    renderLineHighlight: 'none'
  };

  // Объединяем настройки: дефолтные сначала, пользовательские перезаписывают
  const finalOptions = {
    ...defaultOptions,
    ...options
  };

  // Функция принудительного обновления размера
  const resizeEditor = useCallback(() => {
    if (editorRef.current && containerRef.current) {
      try {
        // Принудительно обновляем layout
        editorRef.current.layout();
        console.log('🔧 Monaco Editor layout обновлен');
      } catch (layoutError) {
        console.warn('Ошибка при обновлении layout Monaco Editor:', layoutError);
      }
    }
  }, []);

  // Безопасный обработчик изменений
  const handleChange = (newValue: string | undefined) => {
    if (onChange && newValue !== undefined) {
      try {
        // Получаем позицию курсора ПОСЛЕ изменения
        let cursorPosition = newValue.length; // По умолчанию - конец текста
        
        // Пытаемся получить точную позицию курсора из редактора
        setTimeout(() => { // Небольшая задержка чтобы позиция обновилась
          if (editorRef.current) {
            const position = editorRef.current.getPosition();
            if (position) {
              // Конвертируем позицию курсора в offset в тексте
              const actualPosition = editorRef.current.getModel()?.getOffsetAt(position) || newValue.length;
              
              console.log('📍 Monaco Editor позиция курсора обновлена:', {
                line: position.lineNumber,
                column: position.column,
                offset: actualPosition,
                textLength: newValue.length
              });
            }
          }
        }, 10);
        
        console.log('📍 Monaco Editor изменение:', {
          textLength: newValue.length,
          cursorPosition: cursorPosition,
          preview: newValue.substring(0, 30) + '...'
        });
        
        onChange(newValue, undefined, cursorPosition);
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
            console.log('🎯 Monaco Editor смонтирован и размер установлен');
          }
        } catch (layoutError) {
          console.warn('Ошибка при установке layout Monaco Editor:', layoutError);
        }
      }, 100);

      // Добавляем слушатель изменения размера окна
      const handleWindowResize = () => {
        setTimeout(resizeEditor, 100);
      };
      
      window.addEventListener('resize', handleWindowResize);

      // Очистка слушателя при демонтаже
      return () => {
        window.removeEventListener('resize', handleWindowResize);
      };
    } catch (mountError) {
      console.warn('Ошибка при монтировании Monaco Editor:', mountError);
    }
  };

  // Наблюдатель за изменением размера контейнера
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // Задержка для стабильности
      setTimeout(resizeEditor, 50);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [resizeEditor]);

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
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%', // Обеспечиваем 100% ширины
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden' // Предотвращаем переполнение
      }}
      className="monaco-container"
    >
      <div style={{ 
        flex: 1, 
        minHeight: 0, 
        width: '100%', // Обеспечиваем 100% ширины для внутреннего контейнера
        position: 'relative' 
      }}>
        <Editor
          height="100%"
          width="100%" // Явно указываем 100% ширины
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
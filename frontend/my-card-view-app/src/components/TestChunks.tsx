// Тестовый компонент для новой архитектуры чанков

import React, { useState } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { MonacoEditor } from './MonacoEditor';
import type { ChangeInfo } from '../types/chunks';

export const TestChunks: React.FC = () => {
  const [testText, setTestText] = useState(`Первый абзац текста для тестирования системы чанков.

Второй абзац с другим содержимым.

Третий абзац для проверки разбиения.`);

  const {
    document,
    loading,
    error,
    initializeDocument,
    updateText,
    getChunkText,
    getAllChunkTexts,
    getFilteredAndSortedChunks,
    setSelectedChunk,
    setHoveredChunk,
    ui
  } = useDocumentStore();

  const handleInitialize = () => {
    initializeDocument(testText, 'Тестовый документ');
  };

  const handleTextChange = (newText: string, changeInfo?: ChangeInfo) => {
    setTestText(newText);
    
    console.log('🔄 handleTextChange (Monaco):', {
      newLength: newText.length,
      hasChangeInfo: !!changeInfo,
      hasDocument: !!document,
      documentVersion: document?.version,
      changeInfo
    });
    
    if (document) {
      try {
        if (changeInfo) {
          console.log('📝 Используем точный changeInfo от Monaco:', changeInfo);
          updateText(newText, changeInfo);
        } else {
          console.log('🔄 Fallback: полный пересчет (нет changeInfo)');
          updateText(newText); // Без changeInfo
        }
      } catch (error) {
        console.error('❌ ОШИБКА в handleTextChange:', error);
        console.error('❌ Переинициализируем документ...');
        // Переинициализируем документ при ошибке
        initializeDocument(newText, 'Тестовый документ (восстановлен)');
      }
    } else {
      console.log('⚠️ Нет документа для обновления - инициализируем заново');
      initializeDocument(newText, 'Тестовый документ (создан заново)');
    }
  };

  const chunks = getFilteredAndSortedChunks();

  return (
    <div className="p-3 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold mb-3">Тест архитектуры чанков (Monaco Editor)</h1>
      
      {/* Статус */}
      <div className="mb-3 p-2 bg-gray-100 rounded text-sm">
        <h2 className="font-semibold mb-1">Статус:</h2>
        <div className="flex gap-4">
          <span>Документ: {document ? '✅ Загружен' : '❌ Не загружен'}</span>
          <span>Загрузка: {loading ? '⏳ Да' : '✅ Нет'}</span>
          <span>Ошибка: {error || '✅ Нет'}</span>
          {document && (
            <>
              <span>Чанков: {document.chunks.length}</span>
              <span>Версия: {document.version}</span>
              <span>Длина: {document.text.length}</span>
            </>
          )}
        </div>
      </div>

      {/* Кнопка инициализации */}
      {!document && (
        <button
          onClick={handleInitialize}
          className="mb-3 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          Инициализировать документ
        </button>
      )}

      {/* Monaco Editor */}
      <div className="mb-3">
        <h2 className="font-semibold mb-1 text-sm">Редактор текста (Monaco):</h2>
        <MonacoEditor
          value={testText}
          onChange={handleTextChange}
          height="150px"
          options={{
            fontSize: 12,
            lineHeight: 13,  // Очень компактно (соотношение ~1.08x)
            padding: { top: 4, bottom: 4 },
            wordWrap: 'on',
            lineNumbers: 'off',
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'hidden'
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',  // Убираем подсветку строки
            glyphMargin: false,           // Убираем отступ для глифов
            folding: false,               // Убираем фолдинг
            lineDecorationsWidth: 0,      // Убираем декорации строк
            lineNumbersMinChars: 0        // Минимум символов для номеров строк
          }}
        />
      </div>

      {/* Список чанков */}
      {document && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Чанки как карточки */}
          <div className="lg:col-span-2">
            <h2 className="font-semibold mb-2 text-sm">Чанки ({chunks.length}):</h2>
            <div className="space-y-2">
              {chunks.map((chunk, index) => {
                const text = getChunkText(chunk.id);
                const isSelected = ui.selectedChunks.includes(chunk.id);
                const isHovered = ui.hoveredChunk === chunk.id;
                
                return (
                  <div
                    key={chunk.id}
                    className={`p-2 border rounded cursor-pointer transition-colors text-xs ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 
                      isHovered ? 'border-gray-400 bg-gray-50' : 
                      'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedChunk(isSelected ? null : chunk.id)}
                    onMouseEnter={() => setHoveredChunk(chunk.id)}
                    onMouseLeave={() => setHoveredChunk(null)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-mono text-gray-500">
                        #{index + 1} ({chunk.start}-{chunk.end})
                      </span>
                      <span className="text-gray-400">
                        {chunk.id.slice(0, 8)}...
                      </span>
                    </div>
                    
                    <p className="mb-1 text-gray-700">{text}</p>
                    
                    <div className="text-gray-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Сигнал:</span>
                        <span className={chunk.metrics.isUpdating ? 'text-blue-500' : ''}>
                          {chunk.metrics.isUpdating ? '⏳' : 
                           chunk.metrics.signal_strength?.toFixed(2) || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Сложность:</span>
                        <span className={chunk.metrics.isUpdating ? 'text-blue-500' : ''}>
                          {chunk.metrics.isUpdating ? '⏳' : 
                           chunk.metrics.complexity?.toFixed(2) || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Функция:</span>
                        <span className={chunk.metrics.isUpdating ? 'text-blue-500' : ''}>
                          {chunk.metrics.isUpdating ? '⏳' : 
                           chunk.metrics.semantic_function || '—'}
                        </span>
                      </div>
                      {chunk.metrics.isStale && (
                        <div className="text-orange-500">⚠️ Требует обновления</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Информация о документе */}
          <div>
            <h2 className="font-semibold mb-2 text-sm">Информация:</h2>
            <div className="space-y-2">
              
              {/* Метаданные */}
              <div className="p-2 bg-gray-50 rounded">
                <h3 className="font-medium mb-1 text-xs">Метаданные:</h3>
                <div className="text-xs space-y-0.5">
                  <p><strong>ID:</strong> {document.metadata.session_id.slice(0, 12)}...</p>
                  <p><strong>Тема:</strong> {document.metadata.topic}</p>
                  <p><strong>Создан:</strong> {new Date(document.metadata.created_at).toLocaleTimeString()}</p>
                </div>
              </div>

              {/* Статистика */}
              <div className="p-2 bg-gray-50 rounded">
                <h3 className="font-medium mb-1 text-xs">Статистика:</h3>
                <div className="text-xs space-y-0.5">
                  <p><strong>Чанков:</strong> {document.chunks.length}</p>
                  <p><strong>Символов:</strong> {document.text.length}</p>
                  <p><strong>Требуют обновления:</strong> {
                    document.chunks.filter(c => c.metrics.isStale).length
                  }</p>
                  <p><strong>Обновляются:</strong> {
                    document.chunks.filter(c => c.metrics.isUpdating).length
                  }</p>
                </div>
              </div>

              {/* Все тексты чанков */}
              <div className="p-2 bg-gray-50 rounded">
                <h3 className="font-medium mb-1 text-xs">Тексты чанков:</h3>
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {getAllChunkTexts().map((item, index) => (
                    <div key={item.id} className="border-l-2 border-gray-300 pl-1">
                      <div className="text-gray-500">#{index + 1}: {item.id.slice(0, 6)}...</div>
                      <div className="text-gray-700">{item.text.slice(0, 50)}...</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 
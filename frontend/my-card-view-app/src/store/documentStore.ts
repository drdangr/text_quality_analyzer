// Новый store для архитектуры чанков

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { 
  DocumentState, 
  Chunk, 
  ChangeInfo, 
  MetricsUpdateQueue,
  ChunkMetrics 
} from '../types/chunks';
import { 
  createChunksFromText,
  updateChunkPositions,
  recalculateAllChunks,
  getChunkText,
  getAllChunkTexts,
  shouldCreateNewChunks,
  updateChunkMetrics,
  markChunkAsUpdating,
  getStaleChunks,
  validateChunkPositions,
  moveChunk
} from '../utils/chunkUtils';

// UI состояние
interface UIState {
  activePanel: string;
  selectedChunks: string[];
  hoveredChunk: string | null;
  showEditorSettings: boolean;
  
  // Настройки отображения
  fontSize: number;
  fontFamily: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  
  // Фильтрация и сортировка
  sortField: 'position' | 'id' | 'signal_strength' | 'complexity' | 'semantic_function';
  sortDirection: 'asc' | 'desc';
  semanticFilter: string;
  searchQuery: string;
}

// Основное состояние приложения
interface AppState {
  // === ДОКУМЕНТ ===
  document: DocumentState | null;
  loading: boolean;
  error: string | null;
  
  // === UI ===
  ui: UIState;
  
  // === ОЧЕРЕДЬ ОБНОВЛЕНИЯ МЕТРИК ===
  metricsQueue: MetricsUpdateQueue;
  
  // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
  
  // Инициализация документа
  initializeDocument: (text: string, topic: string) => void;
  
  // Обновление текста
  updateText: (newText: string, changeInfo?: ChangeInfo) => void;
  
  // Обновление метрик
  updateChunkMetrics: (chunkId: string, metrics: Partial<ChunkMetrics>) => void;
  queueMetricsUpdate: (chunkId: string, type: 'local' | 'contextual') => void;
  processMetricsQueue: () => Promise<void>;
  
  // Перемещение чанков
  moveChunk: (sourceChunkId: string, targetPosition: number) => void;
  
  // UI действия
  setSelectedChunk: (chunkId: string | null) => void;
  setHoveredChunk: (chunkId: string | null) => void;
  updateUISettings: (settings: Partial<UIState>) => void;
  
  // Утилиты
  getChunkText: (chunkId: string) => string;
  getAllChunkTexts: () => Array<{id: string, text: string}>;
  getFilteredAndSortedChunks: () => Chunk[];
}

// Константы по умолчанию
const DEFAULT_UI_STATE: UIState = {
  activePanel: 'editor',
  selectedChunks: [],
  hoveredChunk: null,
  showEditorSettings: false,
  fontSize: 12,
  fontFamily: 'Arial, sans-serif',
  signalMinColor: '#FFFFFF',
  signalMaxColor: '#FFDB58',
  complexityMinColor: '#00FF00',
  complexityMaxColor: '#FF0000',
  sortField: 'position',
  sortDirection: 'asc',
  semanticFilter: 'all',
  searchQuery: ''
};

const DEFAULT_METRICS_QUEUE: MetricsUpdateQueue = {
  localUpdates: new Set(),
  contextualUpdates: new Set()
};

export const useDocumentStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // === НАЧАЛЬНОЕ СОСТОЯНИЕ ===
      document: null,
      loading: false,
      error: null,
      ui: DEFAULT_UI_STATE,
      metricsQueue: DEFAULT_METRICS_QUEUE,

      // === ИНИЦИАЛИЗАЦИЯ ДОКУМЕНТА ===
      initializeDocument: (text: string, topic: string) => {
        console.log('🚨🚨🚨 INITIALIZADOCUMENT ВЫЗВАНА! 🚨🚨🚨');
        console.log('📝 Передан текст:', JSON.stringify(text));
        
        console.log('🚀 СЕЙЧАС БУДЕМ ВЫЗЫВАТЬ createChunksFromText!');
        const chunks = createChunksFromText(text);
        console.log('✅ createChunksFromText ЗАВЕРШЕНА, результат:', {
          chunksCount: chunks.length,
          chunks: chunks.map(c => ({id: c.id.slice(0,8), start: c.start, end: c.end}))
        });
        
        const document: DocumentState = {
          text,
          chunks,
          version: 1,
          metadata: {
            session_id: crypto.randomUUID(),
            topic,
            created_at: new Date().toISOString(),
            last_modified: new Date().toISOString()
          }
        };

        // Валидируем чанки
        if (!validateChunkPositions(chunks, text.length)) {
          console.error('❌ Ошибка валидации чанков при инициализации');
          set({ error: 'Ошибка при создании чанков' });
          return;
        }

        set({ 
          document,
          error: null,
          loading: false 
        });

        // Запускаем анализ метрик для всех чанков
        chunks.forEach(chunk => {
          get().queueMetricsUpdate(chunk.id, 'local');
        });

        console.log('✅ Документ инициализирован:', { 
          chunksCount: chunks.length,
          sessionId: document.metadata.session_id 
        });
      },

      // === ОБНОВЛЕНИЕ ТЕКСТА ===
      updateText: (newText: string, changeInfo?: ChangeInfo) => {
        const state = get();
        if (!state.document) {
          console.warn('⚠️ Попытка обновить текст без документа');
          return;
        }

        console.log('🔥 updateText ВЫЗВАН с параметрами:', {
          newTextLength: newText.length,
          oldTextLength: state.document.text.length,
          newText: JSON.stringify(newText),
          oldText: JSON.stringify(state.document.text),
          changeInfo,
          hasChangeInfo: !!changeInfo
        });

        // Проверяем, действительно ли текст изменился
        if (newText === state.document.text) {
          console.log('ℹ️ Текст не изменился, пропускаем обновление');
          return;
        }

        try {
          let updatedChunks: Chunk[];

          if (changeInfo) {
            console.log('🔍 Используем инкрементальное обновление с changeInfo:', changeInfo);
            
            // Инкрементальное обновление
            if (shouldCreateNewChunks(newText, changeInfo)) {
              // Нужно пересчитать все чанки
              console.log('🔄 Пересчет всех чанков (изменилось количество)');
              updatedChunks = recalculateAllChunks(newText, state.document.chunks);
              
              // АВТОМАТИЧЕСКАЯ КОРРЕКЦИЯ: если последний чанк не доходит до конца текста
              if (updatedChunks.length > 0) {
                const lastChunk = updatedChunks[updatedChunks.length - 1];
                if (lastChunk.end < newText.length) {
                  console.log(`🔧 КОРРЕКЦИЯ: расширяем последний чанк с ${lastChunk.end} до ${newText.length}`);
                  updatedChunks = updatedChunks.map((chunk, index) => 
                    index === updatedChunks.length - 1 
                      ? { ...chunk, end: newText.length, metrics: { ...chunk.metrics, isStale: true } }
                      : chunk
                  );
                }
              }
            } else {
              // Обновляем только позиции
              console.log('📍 Обновление позиций чанков (количество не изменилось)');
              updatedChunks = updateChunkPositions(state.document.chunks, changeInfo);
              
              // АВТОМАТИЧЕСКАЯ КОРРЕКЦИЯ: если последний чанк не доходит до конца текста
              if (updatedChunks.length > 0) {
                const lastChunk = updatedChunks[updatedChunks.length - 1];
                if (lastChunk.end < newText.length) {
                  console.log(`🔧 КОРРЕКЦИЯ: расширяем последний чанк с ${lastChunk.end} до ${newText.length}`);
                  updatedChunks = updatedChunks.map((chunk, index) => 
                    index === updatedChunks.length - 1 
                      ? { ...chunk, end: newText.length, metrics: { ...chunk.metrics, isStale: true } }
                      : chunk
                  );
                }
              }
            }
          } else {
            // Полный пересчет
            console.log('🔄 Полный пересчет чанков (нет информации об изменениях)');
            updatedChunks = recalculateAllChunks(newText, state.document.chunks);
            
            // АВТОМАТИЧЕСКАЯ КОРРЕКЦИЯ: если последний чанк не доходит до конца текста
            if (updatedChunks.length > 0) {
              const lastChunk = updatedChunks[updatedChunks.length - 1];
              if (lastChunk.end < newText.length) {
                console.log(`🔧 КОРРЕКЦИЯ: расширяем последний чанк с ${lastChunk.end} до ${newText.length}`);
                updatedChunks = updatedChunks.map((chunk, index) => 
                  index === updatedChunks.length - 1 
                    ? { ...chunk, end: newText.length, metrics: { ...chunk.metrics, isStale: true } }
                    : chunk
                );
              }
            }
          }

          console.log('📊 Результат обновления:', {
            oldChunksCount: state.document.chunks.length,
            newChunksCount: updatedChunks.length,
            updatedChunks: updatedChunks.map(c => ({
              id: c.id.slice(0,8),
              start: c.start,
              end: c.end,
              text: newText.slice(c.start, c.end)
            }))
          });

          // Валидируем результат
          if (!validateChunkPositions(updatedChunks, newText.length)) {
            console.error('❌ Ошибка валидации чанков после обновления');
            set({ error: 'Ошибка при обновлении чанков' });
            return;
          }

          const updatedDocument: DocumentState = {
            ...state.document,
            text: newText,
            chunks: updatedChunks,
            version: state.document.version + 1,
            metadata: {
              ...state.document.metadata,
              last_modified: new Date().toISOString()
            }
          };

          set({ document: updatedDocument, error: null });

          // Запускаем обновление метрик для измененных чанков
          const staleChunks = getStaleChunks(updatedChunks);
          staleChunks.forEach(chunk => {
            get().queueMetricsUpdate(chunk.id, 'local');
          });

          console.log('✅ Текст обновлен:', { 
            chunksCount: updatedChunks.length,
            staleChunksCount: staleChunks.length 
          });
        } catch (error) {
          console.error('❌ Критическая ошибка при обновлении текста:', error);
          set({ error: `Критическая ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}` });
        }
      },

      // === ОБНОВЛЕНИЕ МЕТРИК ===
      updateChunkMetrics: (chunkId: string, metrics: Partial<ChunkMetrics>) => {
        const state = get();
        if (!state.document) return;

        console.log('📊 Обновление метрик чанка:', { chunkId, metrics });

        const updatedChunks = updateChunkMetrics(
          state.document.chunks,
          chunkId,
          metrics
        );

        set({
          document: {
            ...state.document,
            chunks: updatedChunks,
            version: state.document.version + 1
          }
        });
      },

      queueMetricsUpdate: (chunkId: string, type: 'local' | 'contextual') => {
        const state = get();
        const queue = state.metricsQueue;

        if (type === 'local') {
          queue.localUpdates.add(chunkId);
        } else {
          queue.contextualUpdates.add(chunkId);
        }

        // Дебаунс для батчинга
        if (queue.debounceTimer) {
          clearTimeout(queue.debounceTimer);
        }

        queue.debounceTimer = window.setTimeout(() => {
          get().processMetricsQueue();
        }, 300); // 300ms дебаунс

        set({ metricsQueue: { ...queue } });
      },

      processMetricsQueue: async () => {
        const state = get();
        const queue = state.metricsQueue;

        if (queue.localUpdates.size === 0 && queue.contextualUpdates.size === 0) {
          return;
        }

        console.log('🔄 Обработка очереди метрик:', {
          localUpdates: queue.localUpdates.size,
          contextualUpdates: queue.contextualUpdates.size
        });

        // Помечаем чанки как обновляющиеся
        const allUpdateIds = new Set([...queue.localUpdates, ...queue.contextualUpdates]);
        let updatedChunks = state.document!.chunks;
        
        allUpdateIds.forEach(chunkId => {
          updatedChunks = markChunkAsUpdating(updatedChunks, chunkId);
        });

        set({
          document: {
            ...state.document!,
            chunks: updatedChunks
          }
        });

        // Очищаем очередь сразу чтобы избежать повторной обработки
        set({
          metricsQueue: {
            localUpdates: new Set(),
            contextualUpdates: new Set()
          }
        });

        // Реальный вызов API для анализа метрик
        try {
          // Прямой импорт API
          const { calculateParagraphMetrics } = await import('../api/index');
          
          // Получаем session_id из documentStore или создаем временный
          const sessionId = state.document!.metadata.session_id;
          
          // Анализируем каждый чанк
          for (const chunkId of allUpdateIds) {
            const chunkText = get().getChunkText(chunkId);
            if (chunkText.trim()) {
              console.log(`🔄 Анализ метрик чанка ${chunkId}:`, chunkText.substring(0, 50) + '...');
              
              try {
                // Прямой вызов API для расчета метрик
                const chunkIndex = state.document!.chunks.findIndex(c => c.id === chunkId);
                if (chunkIndex >= 0) {
                  const metrics = await calculateParagraphMetrics(
                    sessionId,
                    chunkIndex + 1, // API ожидает 1-based индекс
                    chunkText
                  );
                  
                  // Обновляем метрики напрямую в documentStore
                  get().updateChunkMetrics(chunkId, {
                    signal_strength: metrics.signal_strength ?? undefined,
                    complexity: metrics.complexity ?? undefined,
                    semantic_function: metrics.semantic_function ?? undefined,
                    isStale: false,
                    isUpdating: false
                  });
                  
                  console.log(`✅ Метрики чанка ${chunkId} обновлены:`, metrics);
                }
              } catch (error) {
                console.error(`❌ Ошибка анализа метрик чанка ${chunkId}:`, error);
                // Снимаем флаг обновления при ошибке
                get().updateChunkMetrics(chunkId, { isUpdating: false });
              }
            }
          }
        } catch (error) {
          console.error('❌ Критическая ошибка при анализе метрик:', error);
          // Снимаем флаги обновления для всех чанков
          allUpdateIds.forEach(chunkId => {
            get().updateChunkMetrics(chunkId, { isUpdating: false });
          });
        }
      },

      // === ПЕРЕМЕЩЕНИЕ ЧАНКОВ ===
      moveChunk: (sourceChunkId: string, targetPosition: number) => {
        const state = get();
        if (!state.document) return;

        console.log('🔄 Перемещение чанка:', { sourceChunkId, targetPosition });

        try {
          const updatedDocument = moveChunk(
            state.document,
            sourceChunkId,
            targetPosition
          );

          set({ document: updatedDocument });

          // Запускаем обновление метрик для всех чанков (контекст изменился)
          updatedDocument.chunks.forEach(chunk => {
            get().queueMetricsUpdate(chunk.id, 'contextual');
          });

          console.log('✅ Чанк перемещен успешно');
        } catch (error) {
          console.error('❌ Ошибка при перемещении чанка:', error);
          set({ error: error instanceof Error ? error.message : 'Ошибка перемещения' });
        }
      },

      // === UI ДЕЙСТВИЯ ===
      setSelectedChunk: (chunkId: string | null) => {
        set(state => ({
          ui: {
            ...state.ui,
            selectedChunks: chunkId ? [chunkId] : []
          }
        }));
      },

      setHoveredChunk: (chunkId: string | null) => {
        set(state => ({
          ui: {
            ...state.ui,
            hoveredChunk: chunkId
          }
        }));
      },

      updateUISettings: (settings: Partial<UIState>) => {
        set(state => ({
          ui: {
            ...state.ui,
            ...settings
          }
        }));
      },

      // === УТИЛИТЫ ===
      getChunkText: (chunkId: string) => {
        const state = get();
        if (!state.document) return '';
        return getChunkText(state.document, chunkId);
      },

      getAllChunkTexts: () => {
        const state = get();
        if (!state.document) return [];
        return getAllChunkTexts(state.document);
      },

      getFilteredAndSortedChunks: () => {
        const state = get();
        if (!state.document) return [];

        let chunks = [...state.document.chunks];
        const { searchQuery, semanticFilter, sortField, sortDirection } = state.ui;

        // Фильтрация по поиску
        if (searchQuery.trim()) {
          chunks = chunks.filter(chunk => {
            const text = getChunkText(state.document!, chunk.id);
            return text.toLowerCase().includes(searchQuery.toLowerCase());
          });
        }

        // Фильтрация по семантической функции
        if (semanticFilter !== 'all') {
          chunks = chunks.filter(chunk => 
            chunk.metrics.semantic_function === semanticFilter
          );
        }

        // Сортировка
        chunks.sort((a, b) => {
          let aValue: any, bValue: any;

          switch (sortField) {
            case 'position':
              aValue = a.start;
              bValue = b.start;
              break;
            case 'signal_strength':
              aValue = a.metrics.signal_strength || 0;
              bValue = b.metrics.signal_strength || 0;
              break;
            case 'complexity':
              aValue = a.metrics.complexity || 0;
              bValue = b.metrics.complexity || 0;
              break;
            case 'semantic_function':
              aValue = a.metrics.semantic_function || '';
              bValue = b.metrics.semantic_function || '';
              break;
            default: // 'id'
              aValue = a.id;
              bValue = b.id;
          }

          if (typeof aValue === 'string') {
            return sortDirection === 'asc' 
              ? aValue.localeCompare(bValue)
              : bValue.localeCompare(aValue);
          } else {
            return sortDirection === 'asc' 
              ? aValue - bValue
              : bValue - aValue;
          }
        });

        return chunks;
      }
    })),
    {
      name: 'document-store'
    }
  )
); 
// Новый store для архитектуры чанков

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { 
  DocumentState, 
  Chunk, 
  ChangeInfo, 
  MetricsUpdateQueue,
  ChunkMetrics,
  SemanticAnalysisProgress
} from '../types/chunks';
import { SemanticUpdateType } from '../types/chunks';
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
  moveChunk,
  mergeAdjacentChunks,
  reorderChunksInDocument as reorderChunksInDocumentUtil,
  mergeTwoChunks,
  classifySemanticUpdate
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
  
  // === ПРОГРЕСС СЕМАНТИЧЕСКОГО АНАЛИЗА ===
  semanticProgress: SemanticAnalysisProgress | null;
  
  // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
  
  // Инициализация документа
  initializeDocument: (text: string, topic: string) => void;
  
  // Обновление текста
  updateText: (newText: string, changeInfo?: ChangeInfo) => void;
  
  // Обновление метрик
  updateChunkMetrics: (chunkId: string, metrics: Partial<ChunkMetrics>) => void;
  queueMetricsUpdate: (chunkId: string, type: 'local' | 'contextual') => void;
  processMetricsQueue: () => Promise<void>;
  
  // Управление прогрессом семантического анализа
  startSemanticProgress: (type: SemanticUpdateType, totalChunks: number) => void;
  updateSemanticProgress: (processedChunks: number) => void;
  finishSemanticProgress: () => void;
  
  // Перемещение чанков
  moveChunk: (sourceChunkId: string, targetPosition: number) => void;
  
  // Слияние и перестановка чанков
  mergeChunks: (sourceChunkId: string, targetChunkId?: string) => void;
  reorderChunks: (oldIndex: number, newIndex: number) => void;
  
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
      semanticProgress: null,

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

        // Запускаем ТОЛЬКО глобальный семантический анализ для всех чанков
        console.log('🌍 Запускаем ГЛОБАЛЬНЫЙ анализ для всех чанков после initializeDocument');
        chunks.forEach(chunk => {
          // Только contextual (семантический) анализ, БЕЗ локального!
          get().queueMetricsUpdate(chunk.id, 'contextual');
        });

        console.log('✅ Документ инициализирован:', { 
          chunksCount: chunks.length,
          sessionId: document.metadata.session_id,
          analysisType: 'ТОЛЬКО семантический (глобальный)'
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

        // Классифицируем тип семантического обновления ЗАРАНЕЕ
        const semanticUpdateType = classifySemanticUpdate(changeInfo);
        console.log(`🧠 Классификация семантического обновления: ${semanticUpdateType}`);

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

          // УБИРАЕМ АВТОМАТИЧЕСКИЙ АНАЛИЗ - теперь TextEditorPanelV2 сам контролирует запуск
          const staleChunks = getStaleChunks(updatedChunks);
          console.log('✅ Текст обновлен (БЕЗ автоматического анализа):', { 
            chunksCount: updatedChunks.length,
            staleChunksCount: staleChunks.length,
            semanticUpdateType: semanticUpdateType,
            note: 'Анализ будет запущен только по триггерам из TextEditorPanelV2'
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

        console.log('🔄 updateChunkMetrics НАЧАЛО - ТОЧНЫЕ ПАРАМЕТРЫ:', { 
          chunkId: chunkId.slice(0, 8),
          metrics,
          semantic_function_param: metrics.semantic_function,
          semantic_function_type: typeof metrics.semantic_function,
          semantic_function_defined: metrics.semantic_function !== undefined,
          semantic_function_not_null: metrics.semantic_function !== null,
          allMetricsKeys: Object.keys(metrics),
          allMetricsValues: Object.values(metrics),
          stringified: JSON.stringify(metrics)
        });

        // Найдем старые метрики для сравнения
        const oldChunk = state.document.chunks.find(c => c.id === chunkId);
        console.log('📊 Старые метрики чанка:', {
          chunkId: chunkId.slice(0, 8),
          oldMetrics: oldChunk?.metrics,
          oldSemanticFunction: oldChunk?.metrics.semantic_function
        });

        const updatedChunks = updateChunkMetrics(
          state.document.chunks,
          chunkId,
          metrics
        );

        // Найдем обновленный чанк для проверки
        const updatedChunk = updatedChunks.find(c => c.id === chunkId);
        console.log('✅ updateChunkMetrics РЕЗУЛЬТАТ:', {
          chunkId: chunkId.slice(0, 8),
          oldMetrics: state.document.chunks.find(c => c.id === chunkId)?.metrics,
          newMetrics: updatedChunk?.metrics,
          semantic_function_updated: updatedChunk?.metrics.semantic_function,
          isStoreUpdated: state.document.chunks !== updatedChunks
        });

        // Обновляем store
        const newDocument = {
          ...state.document,
          chunks: updatedChunks,
          version: state.document.version + 1
        };
        
        console.log('📄 Обновляем документ в store:', {
          oldVersion: state.document.version,
          newVersion: newDocument.version,
          chunksChanged: state.document.chunks !== newDocument.chunks
        });

        set({ document: newDocument });
        
        console.log('🔄 ПРОВЕРКА: set() выполнен, проверяем состояние store...');
        
        // НЕМЕДЛЕННАЯ ПРОВЕРКА состояния store
        setTimeout(() => {
          const freshState = get();
          const freshChunk = freshState.document?.chunks.find(c => c.id === chunkId);
          console.log('🔍 НЕМЕДЛЕННАЯ ПРОВЕРКА store (через setTimeout 0):', {
            chunkId: chunkId.slice(0, 8),
            freshSemanticFunction: freshChunk?.metrics.semantic_function,
            freshIsUpdating: freshChunk?.metrics.isUpdating,
            storeIsUpdated: !!freshChunk?.metrics.semantic_function,
            timestamp: new Date().toISOString()
          });
        }, 0);
      },

      queueMetricsUpdate: (chunkId: string, type: 'local' | 'contextual') => {
        const state = get();
        const queue = state.metricsQueue;

        console.log('📋 queueMetricsUpdate ВЫЗВАНА:', {
          chunkId: chunkId.slice(0, 8),
          type,
          currentLocalQueue: Array.from(queue.localUpdates),
          currentContextualQueue: Array.from(queue.contextualUpdates),
          timestamp: new Date().toISOString()
        });

        if (type === 'local') {
          queue.localUpdates.add(chunkId);
        } else {
          queue.contextualUpdates.add(chunkId);
        }

        console.log('📋 queueMetricsUpdate ПОСЛЕ добавления:', {
          chunkId: chunkId.slice(0, 8),
          type,
          newLocalQueue: Array.from(queue.localUpdates),
          newContextualQueue: Array.from(queue.contextualUpdates)
        });

        // Дебаунс для батчинга
        if (queue.debounceTimer) {
          clearTimeout(queue.debounceTimer);
        }

        queue.debounceTimer = window.setTimeout(() => {
          console.log('⏰ queueMetricsUpdate дебаунс сработал - вызываем processMetricsQueue');
          get().processMetricsQueue();
        }, 300); // 300ms дебаунс

        set({ metricsQueue: { ...queue } });
      },

      processMetricsQueue: async () => {
        try {
          const state = get();
          const queue = state.metricsQueue;

          console.log('🔄 processMetricsQueue ВЫЗВАНА:', {
            localUpdates: Array.from(queue.localUpdates),
            contextualUpdates: Array.from(queue.contextualUpdates),
            hasDocument: !!state.document,
            timestamp: new Date().toISOString()
          });

          if (queue.localUpdates.size === 0 && queue.contextualUpdates.size === 0) {
            console.log('⏭️ processMetricsQueue: пустая очередь, выходим');
            return;
          }

          console.log('🔄 Обработка очереди метрик:', {
            localUpdates: queue.localUpdates.size,
            contextualUpdates: queue.contextualUpdates.size
          });

          // Помечаем чанки как обновляющиеся
          const allUpdateIds = new Set([...queue.localUpdates, ...queue.contextualUpdates]);
          
          console.log('🏷️ Помечаем чанки как обновляющиеся:', {
            allUpdateIds: Array.from(allUpdateIds),
            localUpdates: Array.from(queue.localUpdates),
            contextualUpdates: Array.from(queue.contextualUpdates)
          });
          
          // Сохраняем копии очередей ДО очистки
          const localUpdatesCopy = new Set(queue.localUpdates);
          const contextualUpdatesCopy = new Set(queue.contextualUpdates);
          const semanticUpdateType = queue.semanticUpdateType || SemanticUpdateType.LOCAL;
          
          let updatedChunks = state.document!.chunks;
          
          allUpdateIds.forEach(chunkId => {
            try {
              console.log(`🏷️ Помечаем чанк ${chunkId.slice(0, 8)} как isUpdating=true`);
              updatedChunks = markChunkAsUpdating(updatedChunks, chunkId);
              
              // Проверяем, что флаг установился
              const updatedChunk = updatedChunks.find(c => c.id === chunkId);
              console.log(`✅ Чанк ${chunkId.slice(0, 8)} помечен:`, {
                isUpdating: updatedChunk?.metrics.isUpdating,
                isStale: updatedChunk?.metrics.isStale
              });
            } catch (error) {
              console.warn(`Ошибка при пометке чанка ${chunkId} как обновляющийся:`, error);
            }
          });

          set({
            document: {
              ...state.document!,
              chunks: updatedChunks
            }
          });
          
          console.log('📄 Store обновлен с isUpdating флагами');

          // Очищаем очередь сразу чтобы избежать повторной обработки
          set({
            metricsQueue: {
              localUpdates: new Set(),
              contextualUpdates: new Set()
            }
          });

          // === ЭТАП 1: ЛОКАЛЬНЫЙ АНАЛИЗ (СИНХРОННО) ===
          if (localUpdatesCopy.size > 0) {
            try {
              console.log(`📊 ЭТАП 1: Локальный анализ ${localUpdatesCopy.size} чанков (signal_strength, complexity)`);
              
              // Импортируем API функции для локальных метрик
              let getBatchChunkLocalMetrics, getChunkLocalMetrics;
              try {
                const apiModule = await import('../api/index');
                getBatchChunkLocalMetrics = apiModule.getBatchChunkLocalMetrics;
                getChunkLocalMetrics = apiModule.getChunkLocalMetrics;
              } catch (importError) {
                console.warn('Ошибка импорта API модуля для локальных метрик:', importError);
                localUpdatesCopy.forEach(chunkId => {
                  try {
                    get().updateChunkMetrics(chunkId, { isUpdating: false });
                  } catch (flagError) {
                    console.warn(`Ошибка снятия флага обновления для локального чанка ${chunkId}:`, flagError);
                  }
                });
                return;
              }

              if (!getBatchChunkLocalMetrics || !getChunkLocalMetrics) {
                console.warn('API функции для локальных метрик не найдены');
                localUpdatesCopy.forEach(chunkId => {
                  try {
                    get().updateChunkMetrics(chunkId, { isUpdating: false });
                  } catch (flagError) {
                    console.warn(`Ошибка снятия флага обновления для локального чанка ${chunkId}:`, flagError);
                  }
                });
                return;
              }
              
              // Получаем тему из метаданных документа
              const currentState = get();
              if (!currentState.document || !currentState.document.metadata) {
                console.warn('Нет документа или метаданных для локального анализа');
                return;
              }
              
              const topic = currentState.document.metadata.topic;
              
              // Подготавливаем данные для пакетного запроса локальных метрик
              const localChunks = Array.from(localUpdatesCopy).map(chunkId => ({
                id: chunkId,
                text: get().getChunkText(chunkId)
              })).filter(chunk => chunk.text && chunk.text.trim());

              if (localChunks.length > 0) {
                console.log(`🔄 Пакетный анализ локальных метрик для ${localChunks.length} чанков`);

                try {
                  const batchResult = await getBatchChunkLocalMetrics(localChunks, topic);
                  
                  // Обновляем метрики для всех чанков из результата
                  if (batchResult && (batchResult as any).results) {
                    (batchResult as any).results.forEach((result: any) => {
                      try {
                        const chunkId = result.chunk_id;
                        const metrics = result.metrics as any;
                        
                        console.log('📦 СЕМАНТИЧЕСКИЙ РЕЗУЛЬТАТ с API:', {
                          chunkId: chunkId,
                          rawMetrics: metrics,
                          semantic_function: metrics.semantic_function,
                          semantic_method: metrics.semantic_method,
                          semantic_error: metrics.semantic_error,
                          hasSemanticFunction: !!metrics.semantic_function
                        });
                        
                        get().updateChunkMetrics(chunkId, {
                          signal_strength: metrics.signal_strength ?? undefined,
                          complexity: metrics.complexity ?? undefined,
                          isStale: false,
                          isUpdating: false
                        });
                        
                        console.log(`✅ Локальные метрики чанка ${chunkId} обновлены:`, metrics);
                      } catch (updateError) {
                        console.warn(`Ошибка обновления локальных метрик для чанка ${result.chunk_id}:`, updateError);
                        try {
                          get().updateChunkMetrics(result.chunk_id, { isUpdating: false });
                        } catch (flagError) {
                          console.warn(`Ошибка снятия флага обновления для локального чанка ${result.chunk_id}:`, flagError);
                        }
                      }
                    });
                    
                    console.log(`✅ ЭТАП 1 ЗАВЕРШЕН: Локальный анализ для ${(batchResult as any).results.length} чанков`);
                  }
                } catch (apiError) {
                  console.warn('Ошибка пакетного API для локальных метрик, переходим на индивидуальный анализ:', apiError);
                  
                  // Fallback: анализируем каждый чанк отдельно
                  for (const chunk of localChunks) {
                    try {
                      console.log(`🔄 Индивидуальный анализ локальных метрик чанка ${chunk.id}:`, chunk.text.substring(0, 50) + '...');
                      
                      const metrics = await getChunkLocalMetrics(chunk.text, topic) as any;
                      
                      // Обновляем метрики
                      try {
                        get().updateChunkMetrics(chunk.id, {
                          signal_strength: metrics.signal_strength ?? undefined,
                          complexity: metrics.complexity ?? undefined,
                          isStale: false,
                          isUpdating: false
                        });
                        
                        console.log(`✅ Индивидуальные локальные метрики чанка ${chunk.id} обновлены:`, metrics);
                      } catch (updateError) {
                        console.warn(`Ошибка обновления локальных метрик для чанка ${chunk.id}:`, updateError);
                        try {
                          get().updateChunkMetrics(chunk.id, { isUpdating: false });
                        } catch (flagError) {
                          console.warn(`Ошибка снятия флага обновления для локального чанка ${chunk.id}:`, flagError);
                        }
                      }
                    } catch (chunkError) {
                      console.warn(`Ошибка индивидуального анализа локальных метрик чанка ${chunk.id}:`, chunkError);
                      try {
                        get().updateChunkMetrics(chunk.id, { isUpdating: false });
                      } catch (flagError) {
                        console.warn(`Ошибка снятия флага обновления для локального чанка ${chunk.id}:`, flagError);
                      }
                    }
                  }
                }
              }
            } catch (localError) {
              console.warn('Критическая ошибка в анализе локальных метрик:', localError);
              localUpdatesCopy.forEach(chunkId => {
                try {
                  get().updateChunkMetrics(chunkId, { isUpdating: false });
                } catch (flagError) {
                  console.warn(`Ошибка снятия флага обновления для локального чанка ${chunkId}:`, flagError);
                }
              });
            }
          }

          // === ЭТАП 2: СЕМАНТИЧЕСКИЙ АНАЛИЗ (АСИНХРОННО) ===
          if (contextualUpdatesCopy.size > 0) {
            console.log(`🧠 ЭТАП 2: Запуск асинхронного семантического анализа ${contextualUpdatesCopy.size} чанков (semantic_function)`);
            console.log('🧠 ДЕТАЛИ семантического анализа:', {
              contextualChunks: Array.from(contextualUpdatesCopy),
              semanticUpdateType,
              hasDocument: !!state.document,
              hasTopic: !!state.document?.metadata?.topic
            });
            
            // Запускаем семантический анализ асинхронно (не блокируем UI)
            setTimeout(async () => {
              console.log('🧠 СТАРТ асинхронного семантического анализа');
              try {
                // Определяем тип семантического обновления
                const currentSemanticUpdateType = semanticUpdateType;
                
                console.log(`🧠 Запуск семантического анализа: ${currentSemanticUpdateType} (${contextualUpdatesCopy.size} чанков)`);
                
                // Запускаем прогресс-бар
                get().startSemanticProgress(currentSemanticUpdateType, contextualUpdatesCopy.size);

                try {
                  // Импортируем семантические API функции
                  let getBatchChunkSemantic;
                  try {
                    const apiModule = await import('../api/index');
                    getBatchChunkSemantic = apiModule.getBatchChunkSemantic;
                  } catch (importError) {
                    console.warn('Ошибка импорта семантических API:', importError);
                    get().finishSemanticProgress();
                    contextualUpdatesCopy.forEach(chunkId => {
                      try {
                        get().updateChunkMetrics(chunkId, { isUpdating: false });
                      } catch (flagError) {
                        console.warn(`Ошибка снятия флага обновления для семантического чанка ${chunkId}:`, flagError);
                      }
                    });
                    return;
                  }

                  if (!getBatchChunkSemantic) {
                    console.warn('Семантические API функции не найдены');
                    get().finishSemanticProgress();
                    contextualUpdatesCopy.forEach(chunkId => {
                      try {
                        get().updateChunkMetrics(chunkId, { isUpdating: false });
                      } catch (flagError) {
                        console.warn(`Ошибка снятия флага обновления для семантического чанка ${chunkId}:`, flagError);
                      }
                    });
                    return;
                  }

                  // Получаем тему из метаданных документа
                  const currentState = get();
                  if (!currentState.document || !currentState.document.metadata) {
                    console.warn('Нет документа или метаданных для семантического анализа');
                    get().finishSemanticProgress();
                    return;
                  }
                  
                  const topic = currentState.document.metadata.topic;

                  // Подготавливаем данные для семантического анализа
                  const semanticChunks = Array.from(contextualUpdatesCopy).map(chunkId => ({
                    id: chunkId,
                    text: get().getChunkText(chunkId)
                  })).filter(chunk => chunk.text && chunk.text.trim());

                  if (semanticChunks.length > 0) {
                    try {
                      let processedChunks = 0;
                      
                      // Для глобального анализа - пакетный запрос
                      if (currentSemanticUpdateType === SemanticUpdateType.GLOBAL) {
                        const semanticResult = await getBatchChunkSemantic(
                          semanticChunks,
                          currentState.document.text,
                          topic
                        );

                        // Обновляем семантические метрики
                        if (semanticResult && (semanticResult as any).results) {
                          console.log('🎉 ПОЛУЧЕНЫ результаты пакетного семантического анализа:', {
                            resultsCount: (semanticResult as any).results.length,
                            results: (semanticResult as any).results.map((r: any) => ({
                              chunk_id: r.chunk_id,
                              semantic_function: r.metrics?.semantic_function,
                              rawMetrics: r.metrics
                            }))
                          });
                          
                          (semanticResult as any).results.forEach((result: any) => {
                            try {
                              const chunkId = result.chunk_id;
                              const metrics = result.metrics;
                              
                              console.log('📦 ОБРАБОТКА одного семантического результата:', {
                                chunkId: chunkId,
                                rawResult: result,
                                rawMetrics: metrics,
                                semantic_function: metrics?.semantic_function,
                                semantic_function_type: typeof metrics?.semantic_function,
                                hasSemanticFunction: !!metrics?.semantic_function,
                                metricsKeys: Object.keys(metrics || {}),
                                // ОТЛАДКА ПЕРЕДАЧИ В updateChunkMetrics
                                willPass: {
                                  semantic_function: metrics.semantic_function,
                                  direct_value: metrics.semantic_function
                                }
                              });
                              
                              // Проверяем что semantic_function действительно есть
                              if (!metrics?.semantic_function) {
                                console.warn('⚠️ ВНИМАНИЕ: semantic_function отсутствует в metrics!', {
                                  chunkId,
                                  metrics,
                                  result
                                });
                              }
                              
                              get().updateChunkMetrics(chunkId, {
                                semantic_function: metrics.semantic_function,
                                isStale: false,
                                isUpdating: false
                              });
                              
                              processedChunks++;
                              get().updateSemanticProgress(processedChunks);
                              
                              console.log(`✅ Семантические метрики чанка ${chunkId} переданы в updateChunkMetrics:`, {
                                semantic_function: metrics?.semantic_function
                              });
                            } catch (updateError) {
                              console.warn(`Ошибка обновления семантических метрик для чанка ${result.chunk_id}:`, updateError);
                              try {
                                get().updateChunkMetrics(result.chunk_id, { isUpdating: false });
                              } catch (flagError) {
                                console.warn(`Ошибка снятия флага обновления для семантического чанка ${result.chunk_id}:`, flagError);
                              }
                            }
                          });
                          
                          console.log(`✅ Глобальный семантический анализ завершен для ${(semanticResult as any).results.length} чанков`);
                        }
                      } else {
                        // Для локального анализа - индивидуальные запросы с прогрессом
                        const { getChunkSemantic } = await import('../api/index');
                        
                        for (const chunk of semanticChunks) {
                          try {
                            console.log(`🔄 Локальный семантический анализ чанка ${chunk.id}:`, chunk.text.substring(0, 50) + '...');
                            
                            const metrics = await getChunkSemantic(
                              chunk.id,
                              chunk.text,
                              currentState.document.text,
                              topic
                            ) as any;
                            
                            console.log('📦 ИНДИВИДУАЛЬНЫЙ семантический результат с API:', {
                              chunkId: chunk.id,
                              rawMetrics: metrics,
                              semantic_function: metrics?.semantic_function,
                              semantic_function_type: typeof metrics?.semantic_function,
                              hasSemanticFunction: !!metrics?.semantic_function,
                              metricsKeys: Object.keys(metrics || {}),
                              // ОТЛАДКА: показываем разницу между metrics и result
                              fullResult: metrics,
                              resultMetrics: metrics.metrics,
                              correctSemanticFunction: metrics.metrics?.semantic_function
                            });
                            
                            // Проверяем что semantic_function действительно есть
                            const actualMetrics = metrics.metrics || {};
                            if (!actualMetrics.semantic_function) {
                              console.warn('⚠️ ВНИМАНИЕ: semantic_function отсутствует в индивидуальном результате!', {
                                chunkId: chunk.id,
                                metrics: actualMetrics,
                                fullResult: metrics
                              });
                            }
                            
                            // Обновляем метрики
                            try {
                              get().updateChunkMetrics(chunk.id, {
                                semantic_function: actualMetrics.semantic_function,
                                isStale: false,
                                isUpdating: false
                              });
                              
                              processedChunks++;
                              get().updateSemanticProgress(processedChunks);
                              
                              console.log(`✅ Индивидуальные семантические метрики чанка ${chunk.id} переданы в updateChunkMetrics:`, {
                                semantic_function: metrics?.semantic_function
                              });
                            } catch (updateError) {
                              console.warn(`Ошибка обновления семантических метрик для чанка ${chunk.id}:`, updateError);
                              try {
                                get().updateChunkMetrics(chunk.id, { isUpdating: false });
                              } catch (flagError) {
                                console.warn(`Ошибка снятия флага обновления для чанка ${chunk.id}:`, flagError);
                              }
                            }
                          } catch (chunkError) {
                            console.warn(`Ошибка локального семантического анализа чанка ${chunk.id}:`, chunkError);
                            try {
                              get().updateChunkMetrics(chunk.id, { isUpdating: false });
                            } catch (flagError) {
                              console.warn(`Ошибка снятия флага обновления для семантического чанка ${chunk.id}:`, flagError);
                            }
                          }
                        }
                      }
                    } catch (semanticError) {
                      console.warn('Ошибка семантического анализа:', semanticError);
                      contextualUpdatesCopy.forEach(chunkId => {
                        try {
                          get().updateChunkMetrics(chunkId, { isUpdating: false });
                        } catch (flagError) {
                          console.warn(`Ошибка снятия флага обновления для семантического чанка ${chunkId}:`, flagError);
                        }
                      });
                    }
                  }
                } catch (semanticError) {
                  console.warn('Критическая ошибка в семантическом анализе:', semanticError);
                  contextualUpdatesCopy.forEach(chunkId => {
                    try {
                      get().updateChunkMetrics(chunkId, { isUpdating: false });
                    } catch (flagError) {
                      console.warn(`Ошибка снятия флага обновления для семантического чанка ${chunkId}:`, flagError);
                    }
                  });
                } finally {
                  // Завершаем прогресс-бар
                  get().finishSemanticProgress();
                  console.log(`✅ ЭТАП 2 ЗАВЕРШЕН: Семантический анализ`);
                }
              } catch (asyncError) {
                console.warn('Критическая ошибка в асинхронном семантическом анализе:', asyncError);
                get().finishSemanticProgress();
              }
            }, 100); // Небольшая задержка для позволения UI обновиться после локальных метрик
          }

        } catch (queueError) {
          console.warn('Критическая ошибка в processMetricsQueue:', queueError);
          get().finishSemanticProgress();
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

          // Запускаем обновление метрик для перемещенного чанка (контекст изменился)
          get().queueMetricsUpdate(sourceChunkId, 'local');
          get().queueMetricsUpdate(sourceChunkId, 'contextual'); // Только для перемещенного чанка

          console.log('✅ Чанк перемещен успешно');
        } catch (error) {
          console.error('❌ Ошибка при перемещении чанка:', error);
          set({ error: error instanceof Error ? error.message : 'Ошибка перемещения' });
        }
      },

      // === СЛИЯНИЕ И ПЕРЕСТАНОВКА ЧАНКОВ ===
      mergeChunks: (sourceChunkId: string, targetChunkId?: string) => {
        const state = get();
        if (!state.document) return;

        console.log('🔗 Слияние чанков в documentStore:', { sourceChunkId: sourceChunkId.slice(0, 8), targetChunkId: targetChunkId?.slice(0, 8) });

        try {
          if (targetChunkId) {
            // Если указан целевой чанк, используем новую функцию для слияния любых двух чанков
            const updatedDocument = mergeTwoChunks(state.document, sourceChunkId, targetChunkId);
            set({ document: updatedDocument });
          } else {
            // Используем упрощенную функцию слияния соседних чанков
            const updatedDocument = mergeAdjacentChunks(state.document, sourceChunkId);
            set({ document: updatedDocument });
          }

          // Запускаем обновление метрик для всех чанков после слияния
          const currentDocument = get().document;
          if (currentDocument) {
            currentDocument.chunks.forEach(chunk => {
              get().queueMetricsUpdate(chunk.id, 'local');
            });
          }

          console.log('✅ Чанки объединены успешно');
        } catch (error) {
          console.error('❌ Ошибка при объединении чанков:', error);
          set({ error: error instanceof Error ? error.message : 'Ошибка объединения' });
        }
      },
      
      reorderChunks: (oldIndex: number, newIndex: number) => {
        const state = get();
        if (!state.document) {
          console.warn('⚠️ Нет документа для перестановки чанков');
          return;
        }

        console.log('🔄 Изменение порядка чанков:', { oldIndex, newIndex });

        // Добавляем дополнительные проверки безопасности
        if (oldIndex < 0 || newIndex < 0 || 
            oldIndex >= state.document.chunks.length || 
            newIndex >= state.document.chunks.length ||
            oldIndex === newIndex) {
          console.warn('⚠️ Некорректные индексы для перестановки:', { 
            oldIndex, 
            newIndex, 
            chunksLength: state.document.chunks.length 
          });
          return;
        }

        try {
          // Используем функцию, которая реально изменяет текст документа
          const updatedDocument = reorderChunksInDocumentUtil(
            state.document,
            oldIndex,
            newIndex
          );

          // Проверяем, что обновленный документ корректен
          if (!updatedDocument || !updatedDocument.text || !updatedDocument.chunks || updatedDocument.chunks.length === 0) {
            console.error('❌ Получен некорректный документ после перестановки');
            set({ error: 'Ошибка при перестановке чанков - некорректный результат' });
            return;
          }

          set({ document: updatedDocument, error: null });

          // Запускаем обновление метрик для всех чанков (контекст изменился)
          setTimeout(() => {
            const currentState = get();
            if (currentState.document && currentState.document.chunks) {
              currentState.document.chunks.forEach(chunk => {
                get().queueMetricsUpdate(chunk.id, 'local');
              });
            }
          }, 100); // Небольшая задержка для стабильности

          console.log('✅ Порядок чанков изменен успешно');
        } catch (error) {
          console.error('❌ Ошибка при изменении порядка чанков:', error);
          set({ 
            error: error instanceof Error 
              ? `Ошибка перестановки: ${error.message}` 
              : 'Неизвестная ошибка при перестановке чанков' 
          });
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
      },

      // === УПРАВЛЕНИЕ ПРОГРЕССОМ СЕМАНТИЧЕСКОГО АНАЛИЗА ===
      startSemanticProgress: (type: SemanticUpdateType, totalChunks: number) => {
        console.log(`🎬 СТАРТ прогресс-бар: ${type}, чанков: ${totalChunks}`);
        set({
          semanticProgress: {
            type,
            totalChunks,
            processedChunks: 0,
            startTime: Date.now(),
            isActive: true
          }
        });
        console.log(`✅ Прогресс-бар установлен:`, get().semanticProgress);
      },

      updateSemanticProgress: (processedChunks: number) => {
        const currentProgress = get().semanticProgress;
        console.log(`📊 ОБНОВЛЕНИЕ прогресс-бар: ${processedChunks}/${currentProgress?.totalChunks || 0}`);
        set(state => ({
          semanticProgress: state.semanticProgress ? {
            ...state.semanticProgress,
            processedChunks
          } : null
        }));
        console.log(`✅ Прогресс обновлен:`, get().semanticProgress);
      },

      finishSemanticProgress: () => {
        console.log(`🏁 ЗАВЕРШЕНИЕ прогресс-бар`);
        set({
          semanticProgress: null
        });
        console.log(`✅ Прогресс-бар скрыт`);
      }
    })),
    {
      name: 'document-store'
    }
  )
); 
import type {
    AnalysisResponse, // Используем обновленное имя
    UpdateParagraphRequest,
    UpdateParagraphResponse,
    ParagraphTextUpdateRequest
} from '../components/CardView/types';

// ВРЕМЕННО ЖЕСТКО ЗАДАЕМ URL ДЛЯ ТЕСТИРОВАНИЯ
const API_BASE_URL = 'http://localhost:8000'; 
// Оригинальная строка была: const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

console.log("[APIClient] Effective API_BASE_URL:", API_BASE_URL);

/**
 * Обрабатывает ошибки ответа fetch API.
 * @param response - Объект Response от fetch.
 * @throws Error с сообщением об ошибке.
 */
async function handleResponseError(response: Response) {
    if (!response.ok) {
        let errorDetail = `HTTP error! Status: ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData && errorData.detail) {
                // Если detail - это список (как в FastAPI ValidationError),
                // преобразуем его в строку
                if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
                    errorDetail = errorData.detail.map((err: any) => `${err.loc?.join(' -> ') || 'field'}: ${err.msg}`).join('; ');
                } else if (typeof errorData.detail === 'string') {
                    errorDetail = errorData.detail;
                }
            }
        } catch (e) {
            // Если тело ответа не JSON или пустое, используем статус
            logger.warn("Не удалось распарсить JSON из ответа об ошибке API", e) // Требует logger
        }
        throw new Error(errorDetail);
    }
}

// Инициализация анализа (для нового текста)
export async function initializeAnalysis(text: string, topic: string, sessionId?: string | null): Promise<AnalysisResponse> {
    console.log('🚀 API initializeAnalysis called:', { 
        textLength: text.length, 
        topic, 
        sessionId,
        apiUrl: API_BASE_URL 
    })
    
    const requestBody: { text: string; topic: string; session_id?: string | null } = { text, topic };
    if (sessionId) {
        requestBody.session_id = sessionId;
    }

    console.log('📡 Sending request to:', `${API_BASE_URL}/api/analyze`)
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json', // Явно указываем, что ожидаем JSON
            },
            body: JSON.stringify(requestBody),
        });
        
        console.log('📡 Response received:', response.status, response.statusText)
        
        await handleResponseError(response); // Обработка ошибок
        const result = await response.json() as AnalysisResponse;
        console.log('✅ API initializeAnalysis success:', result)
        return result;
    } catch (error) {
        console.error('❌ API initializeAnalysis error:', error)
        throw error;
    }
}

// Получение результатов анализа по session_id
export async function fetchAnalysis(sessionId: string): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/analysis/${sessionId}`, {
        headers: {
            'Accept': 'application/json',
        },
    });
  
    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Обновление текста абзаца
export async function updateParagraph(
    sessionId: string, 
    paragraphId: number, // В теле запроса это paragraph_id
    newText: string
): Promise<UpdateParagraphResponse> {
    const request: UpdateParagraphRequest = {
        session_id: sessionId,
        paragraph_id: paragraphId, // Поле в теле запроса
        text: newText
    };
  
    const response = await fetch(`${API_BASE_URL}/api/update-paragraph`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(request),
    });
  
    await handleResponseError(response);
    return response.json() as Promise<UpdateParagraphResponse>;
}

// Экспорт результатов анализа
export async function exportAnalysis(sessionId: string, format: 'json' | 'csv' = 'csv'): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/api/export/${sessionId}?format=${format}`);
  
    await handleResponseError(response); // Ошибки здесь также могут быть в JSON формате
    return response.blob();
}

// Обновление полной семантики для сессии
export async function refreshFullSemanticAnalysis(sessionId: string): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/analysis/${sessionId}/refresh-semantics`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
        },
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Слияние двух абзацев в один
export async function mergeParagraphs(
    sessionId: string,
    paragraph_id_1: number,
    paragraph_id_2: number
): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/merge-paragraphs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            paragraph_id_1,
            paragraph_id_2
        }),
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Разделение абзаца на два
export async function splitParagraph(
    sessionId: string,
    paragraphId: number,
    splitPosition: number
): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/split-paragraph`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            paragraph_id: paragraphId,
            split_position: splitPosition
        }),
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Изменение порядка абзацев
export async function reorderParagraphs(
    sessionId: string,
    newOrder: number[]
): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/reorder-paragraphs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            new_order: newOrder
        }),
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Обновление темы анализа
export async function updateTopic(
    sessionId: string,
    newTopic: string
): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/update-topic`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId,
            topic: newTopic
        }),
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Удаление абзаца
export async function deleteParagraph(
    sessionId: string,
    paragraphId: number
): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/api/paragraph/${sessionId}/${paragraphId}`, {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
        },
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// Обновление текста абзаца с возможным разделением или удалением
export async function updateTextAndRestructureParagraph(
    sessionId: string,
    paragraphId: number,
    newText: string
): Promise<AnalysisResponse> {
    const requestBody: ParagraphTextUpdateRequest = {
        session_id: sessionId,
        paragraph_id: paragraphId,
        text: newText
    };

    const response = await fetch(`${API_BASE_URL}/api/paragraph/update-text-and-restructure`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    await handleResponseError(response);
    return response.json() as Promise<AnalysisResponse>;
}

// --- Logger (простой, для использования в handleResponseError) ---
// В реальном приложении лучше использовать более продвинутый логгер или систему мониторинга
const logger = {
    warn: (...args: any[]) => console.warn("[APIClient]", ...args),
    error: (...args: any[]) => console.error("[APIClient]", ...args),
};

// Загрузка демо-данных
export async function loadDemoData(): Promise<AnalysisResponse> {
    try {
        // Загружаем локальные демо-данные
        const [paragraphsResponse, configResponse] = await Promise.all([
            fetch('/card_view_data.json'),
            fetch('/config.json')
        ]);

        if (!paragraphsResponse.ok) {
            throw new Error(`HTTP error fetching demo paragraphs! status: ${paragraphsResponse.status}`);
        }
        if (!configResponse.ok) {
            throw new Error(`HTTP error fetching demo config! status: ${configResponse.status}`);
        }

        const rawParagraphs: any[] = await paragraphsResponse.json();
        const config = await configResponse.json();
        
        // Объединяем тексты всех абзацев в один текст
        const fullText = rawParagraphs.map(p => p.text || "").join("\n\n");
        
        // Используем тему из конфига или устанавливаем значение по умолчанию
        const topic = config.topicName || "Объяснение эмбеддингов, токенов и чанкинга";
        
        // Теперь вместо прямого возврата данных, создаем полноценную сессию через API
        return initializeAnalysis(fullText, topic);
        
    } catch (error) {
        console.error("Ошибка загрузки демо-данных:", error);
        throw error;
    }
}

// Интерфейс для метрик абзаца
interface ParagraphMetrics {
  lix?: number | null;
  smog?: number | null;
  complexity?: number | null;
  signal_strength?: number | null;
  semantic_function?: string | null;
}

// --- НОВЫЕ API ФУНКЦИИ ДЛЯ ЛОКАЛЬНЫХ МЕТРИК ЧАНКОВ ---

// Интерфейс для запроса локальных метрик одного чанка  
export interface ChunkLocalMetricsRequest {
  chunk_text: string;
  topic: string;
}

// Интерфейс для ответа локальных метрик одного чанка
export interface ChunkLocalMetricsResponse {
  signal_strength?: number;
  complexity?: number;
  lix?: number;
  smog?: number;
}

// Интерфейс для пакетного запроса локальных метрик
export interface BatchChunkLocalMetricsRequest {
  chunks: Array<{
    id: string;
    text: string;
  }>;
  topic: string;
}

// Интерфейс для пакетного ответа локальных метрик
export interface BatchChunkLocalMetricsResponse {
  results: Array<{
    chunk_id: string;
    metrics: ChunkLocalMetricsResponse;
  }>;
}

// Функция для получения локальных метрик одного чанка
export async function getChunkLocalMetrics(
  chunkText: string,
  topic: string
): Promise<ChunkLocalMetricsResponse> {
  const requestBody: ChunkLocalMetricsRequest = {
    chunk_text: chunkText,
    topic: topic
  };

  const response = await fetch(`${API_BASE_URL}/api/v1/chunk/metrics/local`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  await handleResponseError(response);
  return response.json() as Promise<ChunkLocalMetricsResponse>;
}

// Функция для пакетного получения локальных метрик чанков
export async function getBatchChunkLocalMetrics(
  chunks: Array<{ id: string; text: string }>,
  topic: string
): Promise<BatchChunkLocalMetricsResponse> {
  const requestBody: BatchChunkLocalMetricsRequest = {
    chunks: chunks,
    topic: topic
  };

  const response = await fetch(`${API_BASE_URL}/api/v1/chunks/metrics/batch-local`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  await handleResponseError(response);
  return response.json() as Promise<BatchChunkLocalMetricsResponse>;
}

// Функция для расчета метрик одного абзаца
export const calculateParagraphMetrics = async (
  sessionId: string,
  paragraphId: number,
  text: string
): Promise<ParagraphMetrics> => {
  const response = await fetch(`${API_BASE_URL}/api/paragraph/${sessionId}/${paragraphId}/metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(text), // Отправляем строку напрямую, а не объект
  });

  if (!response.ok) {
    throw new Error('Ошибка при расчете метрик абзаца');
  }

  return response.json();
};

// Функция для расчета метрик всего текста
export const calculateTextMetrics = async (
  sessionId: string,
  text: string
): Promise<AnalysisResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/analysis/${sessionId}/metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(text), // Отправляем строку напрямую, а не объект
  });

  if (!response.ok) {
    throw new Error('Ошибка при расчете метрик текста');
  }

  return response.json();
};

// --- НОВЫЕ API ФУНКЦИИ ДЛЯ СЕМАНТИЧЕСКИХ МЕТРИК ЧАНКОВ ---

// Интерфейс для запроса семантических метрик одного чанка
export interface ChunkSemanticRequest {
  chunk_id: string;
  chunk_text: string;
  full_text: string;
  topic: string;
}

// Интерфейс для ответа семантических метрик одного чанка
export interface ChunkSemanticResponse {
  chunk_id: string;
  metrics: {
    semantic_function?: string;
    semantic_method?: string;
    semantic_error?: string;
  };
}

// Интерфейс для пакетного запроса семантических метрик
export interface BatchChunkSemanticRequest {
  chunks: Array<{
    id: string;
    text: string;
  }>;
  full_text: string;
  topic: string;
}

// Интерфейс для пакетного ответа семантических метрик
export interface BatchChunkSemanticResponse {
  results: Array<ChunkSemanticResponse>;
  failed: Array<string>;
}

// Функция для получения семантических метрик одного чанка
export async function getChunkSemantic(
  chunkId: string,
  chunkText: string,
  fullText: string,
  topic: string
): Promise<ChunkSemanticResponse> {
  const requestBody: ChunkSemanticRequest = {
    chunk_id: chunkId,
    chunk_text: chunkText,
    full_text: fullText,
    topic: topic
  };

  // Используем новый гибридный эндпоинт с параметром prefer_realtime=false
  const response = await fetch(`${API_BASE_URL}/api/v1/hybrid/chunk/metrics/semantic?prefer_realtime=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  await handleResponseError(response);
  
  return response.json() as Promise<ChunkSemanticResponse>;
}

// Функция для пакетного получения семантических метрик чанков
export async function getBatchChunkSemantic(
  chunks: Array<{ id: string; text: string }>,
  fullText: string,
  topic: string
): Promise<BatchChunkSemanticResponse> {
  const requestBody: BatchChunkSemanticRequest = {
    chunks: chunks,
    full_text: fullText,
    topic: topic
  };

  // Используем новый гибридный эндпоинт с параметром prefer_realtime=false
  const response = await fetch(`${API_BASE_URL}/api/v1/hybrid/chunks/metrics/semantic-batch?prefer_realtime=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  await handleResponseError(response);
  
  return response.json() as Promise<BatchChunkSemanticResponse>;
}

// --- ОПТИМИЗИРОВАННЫЙ API ДЛЯ СЕМАНТИЧЕСКОГО АНАЛИЗА ---

// Интерфейс для границ чанка
export interface ChunkBoundary {
  chunk_id: string;
  start: number;
  end: number;
}

// Интерфейс для запроса оптимизированного пакетного семантического анализа
export interface OptimizedBatchSemanticRequest {
  full_text: string;
  chunk_boundaries: ChunkBoundary[];
  topic: string;
}

// Интерфейс для ответа оптимизированного семантического анализа
export interface OptimizedSemanticResponse {
  results: Array<ChunkSemanticResponse>;
  method: string;
  requests_count: number;
  tokens_saved: number;
}

// Функция для оптимизированного пакетного семантического анализа
export async function getBatchChunkSemanticOptimized(
  chunks: Array<{ id: string; text: string }>,
  fullText: string,
  topic: string
): Promise<BatchChunkSemanticResponse> {
  // Вычисляем границы чанков на основе их позиции в полном тексте
  const chunk_boundaries: ChunkBoundary[] = [];
  let currentPos = 0;
  
  for (const chunk of chunks) {
    const start = fullText.indexOf(chunk.text, currentPos);
    if (start !== -1) {
      const end = start + chunk.text.length;
      chunk_boundaries.push({
        chunk_id: chunk.id,
        start: start,
        end: end
      });
      currentPos = end;
    } else {
      // Если чанк не найден, логируем предупреждение
      console.warn(`[API] Чанк ${chunk.id} не найден в полном тексте`);
    }
  }

  const requestBody: OptimizedBatchSemanticRequest = {
    full_text: fullText,
    chunk_boundaries: chunk_boundaries,
    topic: topic
  };

  try {
    // Используем новый оптимизированный эндпоинт
    const response = await fetch(`${API_BASE_URL}/api/v2/optimized/semantic/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    await handleResponseError(response);
    
    const optimizedResponse = await response.json() as OptimizedSemanticResponse;
    
    // Логируем статистику оптимизации
    console.log(`[API] 🚀 Оптимизированный анализ: ${optimizedResponse.results.length} чанков, ` +
                `${optimizedResponse.requests_count} запросов, ` +
                `~${optimizedResponse.tokens_saved} токенов сэкономлено`);
    
    // Преобразуем ответ в формат BatchChunkSemanticResponse
    const failed = optimizedResponse.results
      .filter(r => r.metrics.semantic_error)
      .map(r => r.chunk_id);
    
    return {
      results: optimizedResponse.results,
      failed: failed
    };
    
  } catch (error) {
    console.error('[API] Ошибка оптимизированного анализа, возврат к стандартному методу:', error);
    // В случае ошибки возвращаемся к стандартному методу
    return getBatchChunkSemantic(chunks, fullText, topic);
  }
}

// Функция-переключатель для использования оптимизированного API когда возможно
export async function getBatchChunkSemanticSmart(
  chunks: Array<{ id: string; text: string }>,
  fullText: string,
  topic: string,
  useOptimized: boolean = true
): Promise<BatchChunkSemanticResponse> {
  // Используем оптимизированный API для больших документов
  if (useOptimized && chunks.length > 5) {
    console.log(`[API] Используем оптимизированный API для ${chunks.length} чанков`);
    return getBatchChunkSemanticOptimized(chunks, fullText, topic);
  } else {
    console.log(`[API] Используем стандартный API для ${chunks.length} чанков`);
    return getBatchChunkSemantic(chunks, fullText, topic);
  }
} 
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
  signal_strength: number;
  complexity: number;
  semantic_function?: string;
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
    body: JSON.stringify({
      text: text,
    }),
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
    body: JSON.stringify({
      text: text,
    }),
  });

  if (!response.ok) {
    throw new Error('Ошибка при расчете метрик текста');
  }

  return response.json();
}; 
import type {
    ParagraphData,
    AnalysisResponse, // Используем обновленное имя
    UpdateParagraphRequest,
    UpdateParagraphResponse
} from '../components/CardView/types';

// ВРЕМЕННО ЖЕСТКО ЗАДАЕМ URL ДЛЯ ТЕСТИРОВАНИЯ
const API_BASE_URL = 'http://localhost:8000/api'; 
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
    const requestBody: { text: string; topic: string; session_id?: string | null } = { text, topic };
    if (sessionId) {
        requestBody.session_id = sessionId;
    }

    const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json', // Явно указываем, что ожидаем JSON
        },
        body: JSON.stringify(requestBody),
    });
  
    await handleResponseError(response); // Обработка ошибок
    return response.json() as Promise<AnalysisResponse>;
}

// Получение результатов анализа по session_id
export async function fetchAnalysis(sessionId: string): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/analysis/${sessionId}`, {
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
  
    const response = await fetch(`${API_BASE_URL}/update-paragraph`, {
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
    const response = await fetch(`${API_BASE_URL}/export/${sessionId}?format=${format}`);
  
    await handleResponseError(response); // Ошибки здесь также могут быть в JSON формате
    return response.blob();
}

// Обновление полной семантики для сессии
export async function refreshFullSemanticAnalysis(sessionId: string): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/analysis/${sessionId}/refresh-semantics`, {
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
    const response = await fetch(`${API_BASE_URL}/merge-paragraphs`, {
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
    const response = await fetch(`${API_BASE_URL}/split-paragraph`, {
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
    const response = await fetch(`${API_BASE_URL}/reorder-paragraphs`, {
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
    const response = await fetch(`${API_BASE_URL}/update-topic`, {
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

// --- Logger (простой, для использования в handleResponseError) ---
// В реальном приложении лучше использовать более продвинутый логгер или систему мониторинга
const logger = {
    warn: (...args: any[]) => console.warn("[APIClient]", ...args),
    error: (...args: any[]) => console.error("[APIClient]", ...args),
};

// Загрузка демо-данных (оставляем как в вашем документе, если файлы существуют в public/)
// Эта функция не использует API_BASE_URL, а загружает локальные JSON.
export async function loadDemoData(): Promise<AnalysisResponse> { // Тип возврата изменен на AnalysisResponse
    try {
        // Загружаем локальные демо-данные
        // Предполагается, что card_view_data.json содержит массив ParagraphData (или объектов, совместимых с ним)
        // и config.json содержит { "topicName": "..." }
        const [paragraphsResponse, configResponse] = await Promise.all([
            fetch('/card_view_data.json'), // Путь относительно public/
            fetch('/config.json')         // Путь относительно public/
        ]);

        if (!paragraphsResponse.ok) {
            throw new Error(`HTTP error fetching demo paragraphs! status: ${paragraphsResponse.status}`);
        }
        if (!configResponse.ok) {
            throw new Error(`HTTP error fetching demo config! status: ${configResponse.status}`);
        }

        const rawParagraphs: any[] = await paragraphsResponse.json();
        const config = await configResponse.json();
        
        // Адаптируем структуру rawParagraphs к ParagraphData[] с вложенными метриками
        const paragraphs: ParagraphData[] = rawParagraphs.map((p, index) => ({
            id: p.paragraph_id !== undefined ? p.paragraph_id : index, // Используем paragraph_id если есть, иначе индекс
            text: p.text || "",
            metrics: {
                lix: p.lix,
                smog: p.smog,
                complexity: p.complexity,
                signal_strength: p.signal_strength,
                semantic_function: p.semantic_function,
                semantic_method: p.semantic_method,
                semantic_error: p.semantic_error,
            }
        }));        

        const demoSession: AnalysisResponse = {
            metadata: {
                session_id: "demo-session-" + Date.now(), // Уникальный демо ID
                topic: config.topicName || "Демонстрационные данные",
                analysis_timestamp: new Date().toISOString(),
                paragraph_count: paragraphs.length,
                // avg_complexity и avg_signal_strength можно рассчитать, если нужно для демо
                semantic_analysis_available: true, // Предполагаем, что для демо все доступно
                semantic_analysis_status: "complete",
                source: "demo_data" // Дополнительное поле для идентификации источника
            },
            paragraphs,
        };
        
        return demoSession;
    } catch (error) {
        logger.error("Error loading demo data:", error);
        throw new Error("Не удалось загрузить демонстрационные данные: " + (error instanceof Error ? error.message : String(error)));
    }
} 
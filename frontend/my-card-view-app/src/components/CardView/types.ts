// frontend/my-card-view-app/src/components/CardView/types.ts

// Описывает метрики для одного абзаца, как они приходят от API
export interface ParagraphMetrics {
    lix?: number | null;
    smog?: number | null;
    complexity?: number | null;
    signal_strength?: number | null;
    semantic_function?: string | null;
    semantic_method?: string | null;
    semantic_error?: string | null;
}

// Описывает данные одного абзаца, включая его ID, текст и метрики
export interface ParagraphData {
  id: number; // Используем id для соответствия с бэкендом (Pydantic модель ParagraphData)
  text: string;
  metrics: ParagraphMetrics;
}

// Описывает метаданные сессии анализа, как они приходят от API
export interface AnalysisMetadata {
    session_id: string;
    topic: string;
    analysis_timestamp: string;
    paragraph_count: number;
    avg_complexity?: number | null;
    avg_signal_strength?: number | null;
    semantic_analysis_available: boolean;
    semantic_analysis_status: string; // e.g., "complete", "unavailable_api", "error"
    source?: string; // Добавлено для демо-данных
    // [key: string]: any; // Можно раскомментировать, если ожидаются доп. поля
}

// Описывает полную структуру сессии анализа, получаемую от API (/api/analyze и /api/analysis/{session_id})
export interface AnalysisResponse { // Переименовано из AnalysisSession для соответствия Pydantic модели
  metadata: AnalysisMetadata;
  paragraphs: ParagraphData[];
}

// Для запроса на обновление абзаца (/api/update-paragraph)
export interface UpdateParagraphRequest {
  session_id: string;
  paragraph_id: number; // API ожидает 'paragraph_id' в теле запроса
  text: string;
}

// Ответ от /api/update-paragraph - это обновленный ParagraphData
export type UpdateParagraphResponse = ParagraphData;

// Новый тип для запроса на обновление текста абзаца с возможным разделением
export interface ParagraphTextUpdateRequest {
    session_id: string;
    paragraph_id: number; // ID абзаца, который редактируется
    text: string;         // Полный новый текст из поля редактирования (может быть пустым)
}

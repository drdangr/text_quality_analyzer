// Новая архитектура чанков - типы данных

export interface DocumentState {
  text: string;  // Единственный источник текста
  chunks: Chunk[];
  version: number;  // Для отслеживания изменений
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  session_id: string;
  topic: string;
  created_at: string;
  last_modified: string;
}

export interface Chunk {
  id: string;        // UUID - постоянный идентификатор
  start: number;     // Начальная позиция в тексте (включительно)
  end: number;       // Конечная позиция в тексте (исключительно)
  metrics: ChunkMetrics;
}

export interface ChunkMetrics {
  // Локальные метрики (быстрые)
  signal_strength?: number;
  complexity?: number;
  semantic_function?: string;
  
  // Контекстуальные метрики (медленные)
  context_relevance?: number;
  global_coherence?: number;
  
  // Метаданные
  isStale?: boolean;        // Нужно обновить
  isUpdating?: boolean;     // Обновляется в данный момент
  lastUpdated?: number;     // Timestamp
  version?: number;         // Версия при последнем обновлении
}

export interface ChangeInfo {
  start: number;
  end: number;
  newText: string;
  oldText: string;
}

export interface MetricsUpdateQueue {
  localUpdates: Set<string>;      // Chunk IDs для локальных метрик
  contextualUpdates: Set<string>; // Chunk IDs для контекстуальных метрик
  debounceTimer?: number;
}

// Типы для Monaco Editor событий
export interface MonacoChangeEvent {
  changes: Array<{
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    rangeOffset: number;
    rangeLength: number;
    text: string;
  }>;
}

// Утилитарные типы
export type AnalysisType = 'local' | 'contextual' | 'full';

export interface ChunkAnalysisRequest {
  chunks: Array<{
    id: string;
    text: string;
    context?: string;
  }>;
  analysis_type: AnalysisType;
}

export interface ChunkAnalysisResponse {
  results: Array<{
    chunk_id: string;
    metrics: Partial<ChunkMetrics>;
  }>;
  version: number;
}

// Константы
export const CHUNK_SEPARATOR_REGEX = /(?:\r\n\r\n|\r\r|\n\n)/;
export const DEFAULT_CHUNK_METRICS: ChunkMetrics = {
  signal_strength: 0,
  complexity: 0,
  semantic_function: 'Не определено',
  isStale: true,
  isUpdating: false,
  lastUpdated: Date.now(),
  version: 0
}; 
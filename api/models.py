from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any

# Задаем текст и тему по умолчанию для удобства тестирования
DEFAULT_TEST_TEXT = ("Эмбеддинги это числовые представления слов. Они очень важны для машинного обучения. Модели лучше понимают смысл.\n\n" 
                     "Токенизация это процесс разбиения текста на мелкие части, называемые токенами. Это помогает в анализе.\n\n" 
                     "Чанкинг делит большие тексты на части поменьше. Это нужно для моделей с лимитом токенов.")
DEFAULT_TEST_TOPIC = "Основные концепции обработки естественного языка"

class TextAnalysisRequest(BaseModel):
    """Модель запроса для полного анализа текста."""
    text: str = Field(default=DEFAULT_TEST_TEXT, description="Текст для анализа")
    topic: str = Field(default=DEFAULT_TEST_TOPIC, description="Тема для анализа")
    session_id: Optional[str] = Field(None, description="Опциональный ID сессии для продолжения существующего анализа или его перезаписи")

class ParagraphUpdateRequest(BaseModel):
    """Модель запроса для обновления одного абзаца."""
    session_id: str = Field(..., description="ID сессии, в рамках которой обновляется абзац")
    paragraph_id: int = Field(..., ge=0, description="ID абзаца (индекс в списке) для обновления")
    text: str = Field(..., description="Новый текст абзаца")

# Новая модель запроса для обновления текста с возможным разделением
class ParagraphTextUpdateRequest(BaseModel):
    """Модель запроса для обновления текста абзаца с возможностью разделения."""
    session_id: str = Field(..., description="ID сессии")
    paragraph_id: int = Field(..., ge=0, description="ID абзаца, который редактируется")
    text: str = Field(description="Полный новый текст из поля редактирования") # Может быть пустым

class ParagraphMetrics(BaseModel):
    """Модель метрик абзаца."""
    # Метрики из readability.py
    lix: Optional[float] = None
    smog: Optional[float] = None
    complexity: Optional[float] = None
    
    # Метрики из signal_strength.py
    signal_strength: Optional[float] = None
    
    # Метрики из semantic_function.py
    semantic_function: Optional[str] = None
    semantic_method: Optional[str] = None
    semantic_error: Optional[str] = Field(None, description="Сообщение об ошибке, если семантический анализ не удался для этого абзаца")

class ParagraphData(BaseModel):
    """Модель данных одного абзаца с его метриками."""
    id: int = Field(..., description="Порядковый номер (индекс) абзаца в тексте")
    text: str
    metrics: ParagraphMetrics

class AnalysisMetadata(BaseModel):
    """Модель метаданных всего анализа."""
    session_id: str
    topic: str
    analysis_timestamp: str = Field(..., description="ISO timestamp времени завершения анализа на сервере")
    paragraph_count: int
    
    # Агрегированные метрики (опционально, могут быть None, если нет данных)
    avg_complexity: Optional[float] = None
    avg_signal_strength: Optional[float] = None
    
    # Статус семантического анализа
    semantic_analysis_available: bool = Field(..., description="Доступен ли семантический анализ в принципе (например, есть ли API ключ)")
    semantic_analysis_status: str = Field(..., description="Общий статус семантического анализа для этого текста: complete, pending, unavailable, error")

class AnalysisResponse(BaseModel):
    """Модель полного ответа с результатами анализа."""
    metadata: AnalysisMetadata
    paragraphs: List[ParagraphData]

class ExportRequest(BaseModel):
    """Модель запроса на экспорт (если понадобится POST для экспорта)."""
    session_id: str
    format: str = Field("csv", pattern="^(csv|json)$")

class ParagraphsMergeRequest(BaseModel):
    """Модель запроса для слияния двух абзацев."""
    session_id: str = Field(..., description="ID сессии, в рамках которой происходит слияние")
    paragraph_id_1: int = Field(..., ge=0, description="ID первого абзаца для слияния")
    paragraph_id_2: int = Field(..., ge=0, description="ID второго абзаца для слияния")

class ParagraphSplitRequest(BaseModel):
    """Модель запроса для разделения абзаца на два."""
    session_id: str = Field(..., description="ID сессии, в рамках которой происходит разделение")
    paragraph_id: int = Field(..., ge=0, description="ID абзаца для разделения")
    split_position: int = Field(..., ge=0, description="Позиция символа, с которой начинается новый абзац")

class ParagraphsReorderRequest(BaseModel):
    """Модель запроса для изменения порядка абзацев."""
    session_id: str = Field(..., description="ID сессии, в рамках которой меняется порядок")
    new_order: List[int] = Field(..., description="Новый порядок абзацев (список ID абзацев в новом порядке)")

class UpdateTopicRequest(BaseModel):
    """Модель запроса для обновления темы анализа."""
    session_id: str = Field(..., description="ID сессии, для которой обновляется тема")
    topic: str = Field(..., description="Новая тема анализа")

# Модель для ответа при ошибках (пример)
# class ErrorResponse(BaseModel):
#     detail: str

# ===== НОВЫЕ МОДЕЛИ ДЛЯ АРХИТЕКТУРЫ ЧАНКОВ =====

class ChunkSemanticRequest(BaseModel):
    """Модель запроса для семантического анализа одного чанка."""
    chunk_id: str = Field(..., description="ID чанка (UUID)")
    chunk_text: str = Field(..., description="Текст анализируемого чанка")
    full_text: str = Field(..., description="Полный текст документа для контекста")
    topic: str = Field(..., description="Тема документа")
    session_id: Optional[str] = Field(None, description="ID сессии для логирования")

class BatchChunkSemanticRequest(BaseModel):
    """Модель запроса для пакетного семантического анализа чанков."""
    chunks: List[Dict[str, str]] = Field(..., description="Список чанков: [{'id': str, 'text': str}, ...]")
    full_text: str = Field(..., description="Полный текст документа для контекста")
    topic: str = Field(..., description="Тема документа")
    session_id: Optional[str] = Field(None, description="ID сессии для логирования")
    max_parallel: Optional[int] = Field(1, description="Максимальное количество параллельных запросов к OpenAI")

class ChunkLocalMetricsRequest(BaseModel):
    """Модель запроса для анализа локальных метрик одного чанка."""
    chunk_text: str = Field(..., description="Текст анализируемого чанка")
    topic: str = Field(..., description="Тема документа")

class BatchChunkLocalMetricsRequest(BaseModel):
    """Модель запроса для пакетного анализа локальных метрик чанков."""
    chunks: List[Dict[str, str]] = Field(..., description="Список чанков: [{'id': str, 'text': str}, ...]")
    topic: str = Field(..., description="Тема документа")

class ChunkSemanticMetrics(BaseModel):
    """Модель семантических метрик чанка."""
    semantic_function: Optional[str] = None
    semantic_method: str = "api_single"
    semantic_error: Optional[str] = None

class ChunkLocalMetrics(BaseModel):
    """Модель локальных метрик чанка."""
    complexity: Optional[float] = None
    signal_strength: Optional[float] = None
    lix: Optional[float] = None
    smog: Optional[float] = None

class ChunkSemanticResponse(BaseModel):
    """Модель ответа для семантического анализа одного чанка."""
    chunk_id: str
    metrics: ChunkSemanticMetrics

class ChunkLocalMetricsResponse(BaseModel):
    """Модель ответа для локальных метрик одного чанка."""
    chunk_id: str
    metrics: ChunkLocalMetrics

class BatchChunkSemanticResponse(BaseModel):
    """Модель ответа для пакетного семантического анализа."""
    results: List[ChunkSemanticResponse]
    failed: List[str] = Field(default_factory=list, description="IDs чанков, для которых анализ не удался")

class BatchChunkLocalMetricsResponse(BaseModel):
    """Модель ответа для пакетного анализа локальных метрик."""
    results: List[ChunkLocalMetricsResponse]
    failed: List[str] = Field(default_factory=list, description="IDs чанков, для которых анализ не удался")

# === Новые модели для оптимизированного семантического анализа ===

class ChunkBoundary(BaseModel):
    """Границы чанка в тексте"""
    chunk_id: str = Field(..., description="Уникальный идентификатор чанка")
    start: int = Field(..., ge=0, description="Начальная позиция чанка в тексте (включительно)")
    end: int = Field(..., gt=0, description="Конечная позиция чанка в тексте (исключительно)")

class OptimizedBatchSemanticRequest(BaseModel):
    """Запрос на оптимизированный пакетный семантический анализ"""
    full_text: str = Field(..., description="Полный текст документа")
    chunk_boundaries: List[ChunkBoundary] = Field(..., description="Границы чанков для анализа")
    topic: str = Field(..., description="Основная тема текста для контекста")

class OptimizedSemanticResponse(BaseModel):
    """Ответ оптимизированного семантического анализа"""
    results: List[ChunkSemanticResponse] = Field(..., description="Результаты для каждого чанка")
    method: str = Field(default="optimized", description="Использованный метод анализа")
    requests_count: int = Field(default=1, description="Количество запросов к модели")
    tokens_saved: Optional[int] = Field(None, description="Примерная экономия токенов")

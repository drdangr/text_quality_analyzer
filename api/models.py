from pydantic import BaseModel, Field
from typing import Dict, List, Optional

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

# Модель для ответа при ошибках (пример)
# class ErrorResponse(BaseModel):
#     detail: str

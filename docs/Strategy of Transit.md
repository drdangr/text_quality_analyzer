# Стратегия перехода на клиент-серверную архитектуру для анализатора текста

## Обзор архитектуры

Проект переходит от монолитного приложения с генерацией статических HTML-отчетов к полноценной клиент-серверной архитектуре с разделением на React-фронтенд и FastAPI-бэкенд. Это обеспечит:

1. **Интерактивность** — мгновенный отклик пользовательского интерфейса
2. **Масштабируемость** — возможность горизонтального масштабирования бэкенда
3. **Инкрементальное обновление** — быстрый перерасчет метрик только для измененных абзацев
4. **Персистентность** — сохранение состояния между сессиями пользователя

![Архитектура](https://mermaid.ink/img/pako:eNp1UsGO2jAQ_RVrT6vEjwTCpQKpKmq3glapQHvpxTgTYsn2RLZDgMV8e50AlbaHXTvz3syb5xk_C6cJhRQGrXXUZ75Cd-kCJXO2I-vQtA0Fcg_WEYXuSVVg6LizXJvuI3WnYfjQBdv1FLhjcm-kKiM2ZpTJ_HzMDR6pgUg5Vn-mKfKkPzdm3qmQojdaOcOJw9OHvn8_Ni8vzRPVXy8vOz7ZjTPnYyTSPZQnKmwF_sO2-z4jYcj-_W98CfQvSTkDKQOMCYUfWHYhkCPvwALznSPvPNAVg0tUvXvEkdkXWPJ6IaVa8fH9XQw5Z3WtIj8NkTlJUAoPHZm6JF3hdyF5pjGorFQl_UeJrm56xhJLEV2wnpzVgVb8L_a_wPNZPZZ4B9twp2vSOXRfAMhCzuJlmlwh3TfI69xUKEvL-47eFD8QP7oB5aLljvxPSLm0Y4xQmBe9Xki54nnO5sFR61RIiHVGjdQ9PbaCXVV_Zus1dTFdHB-FdHG8SB88d0amhQ1XMh5FsSiYLZuiFiLeVnXVVls43K1v8qpa1GURFev5Jqzm2_pD_QVMtbyq)

## API-интерфейс для взаимодействия фронтенда с бэкендом

### 1. Структура API-ответов

Для передачи данных между фронтендом и бэкендом используется следующая JSON-структура:

```json
{
  "metadata": {
    "session_id": "4f3d2c1b-a987-6e5d-4c3b-2a1b0c9d8e7f",
    "topic": "Эмбеддинги и токенизация",
    "analysis_timestamp": "2025-05-12T14:30:45Z", 
    "paragraph_count": 15,
    "avg_complexity": 0.68,
    "avg_signal_strength": 0.72
  },
  "paragraphs": [
    {
      "id": 0,
      "text": "Текст первого абзаца...",
      "metrics": {
        "complexity": 0.75,
        "lix": 43.2,
        "smog": 12.5,
        "signal_strength": 0.91,
        "semantic_function": "ключевой тезис",
        "semantic_method": "api"
      }
    },
    {
      "id": 1,
      "text": "Текст второго абзаца...",
      "metrics": {
        "complexity": 0.62,
        "lix": 38.6,
        "smog": 10.2,
        "signal_strength": 0.85,
        "semantic_function": "раскрытие темы",
        "semantic_method": "api"
      }
    }
    // ... другие абзацы
  ]
}
```

### 2. Основные API-эндпоинты

|Эндпоинт|Метод|Описание|Параметры запроса|Ответ|
|---|---|---|---|---|
|`/api/analyze`|POST|Полный анализ текста|`{"text": "...", "topic": "..."}`|Полная структура анализа с `session_id`|
|`/api/update-paragraph`|POST|Обновление одного абзаца|`{"session_id": "...", "paragraph_id": 0, "text": "..."}`|Обновленные данные абзаца|
|`/api/analysis/{session_id}`|GET|Получение сохраненного анализа|Path parameter: `session_id`|Полная структура анализа|
|`/api/export/{session_id}`|GET|Экспорт результатов в CSV/JSON|Path parameter: `session_id`, Query: `format`|Файл результатов|

## Организация кода бэкенда

### Структура проекта

```
text-analyzer/
├── api/
│   ├── __init__.py
│   ├── models.py        # Pydantic модели для валидации запросов/ответов
│   ├── routes.py        # Определения API маршрутов
│   └── orchestrator.py  # Оркестратор для вызова модулей анализа
├── analysis/
│   ├── __init__.py
│   ├── readability.py
│   ├── signal_strength.py   # Оптимизированный модуль
│   └── semantic_function.py
├── services/
│   ├── __init__.py
│   ├── session_store.py     # Сервис управления сессиями
│   ├── embedding_service.py # Класс для работы с эмбеддингами
│   └── export_service.py    # Сервис для экспорта результатов
├── utils/
│   ├── __init__.py
│   ├── text_processing.py
│   └── async_helpers.py
├── config.py               # Конфигурация приложения
├── logging_config.py       # Настройка логирования
├── main.py                 # Точка входа FastAPI приложения
└── requirements.txt        # Зависимости проекта
```

### Ключевые компоненты

#### 1. API-оркестратор

Этот модуль отвечает за координацию всех анализов и подготовку данных для API-ответов:

```python
# api/orchestrator.py
import asyncio
import pandas as pd
from typing import Dict, List, Optional
import datetime
import uuid

from analysis import readability, signal_strength, semantic_function
from services.session_store import SessionStore
from services.embedding_service import EmbeddingService

class AnalysisOrchestrator:
    def __init__(self, session_store: SessionStore, embedding_service: EmbeddingService):
        self.session_store = session_store
        self.embedding_service = embedding_service
        
    async def analyze_full_text(self, text: str, topic: str, session_id: Optional[str] = None) -> Dict:
        """
        Главная функция для полного анализа текста.
        Разбивает текст на абзацы и запускает все анализы.
        
        Args:
            text: Полный текст для анализа
            topic: Тема для анализа
            session_id: Опциональный идентификатор сессии
            
        Returns:
            Dict: Структурированный результат для API-ответа
        """
        # Генерируем новый session_id, если не предоставлен
        if not session_id:
            session_id = str(uuid.uuid4())
            
        # Разбиваем текст на абзацы
        from utils.text_processing import split_into_paragraphs
        paragraphs = split_into_paragraphs(text)
        
        # Выполняем полный анализ
        df = await self._run_analysis_pipeline(paragraphs, topic)
        
        # Сохраняем результаты в хранилище сессий
        self.session_store.save_analysis(session_id, df, topic)
        
        # Форматируем результат для API-ответа
        return self._format_analysis_result(df, topic, session_id)
    
    async def analyze_incremental(self, session_id: str, paragraph_id: int, 
                                 new_text: str) -> Dict:
        """
        Обновляет анализ для одного измененного абзаца.
        
        Args:
            session_id: Идентификатор сессии
            paragraph_id: ID абзаца для обновления
            new_text: Новый текст абзаца
            
        Returns:
            Dict: Обновленные данные абзаца
        """
        # Получаем сохраненный анализ
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            return None
            
        df, topic = analysis_data["df"], analysis_data["topic"]
        
        # Проверяем валидность paragraph_id
        if paragraph_id < 0 or paragraph_id >= len(df):
            return None
            
        # Обновляем текст абзаца
        df.at[paragraph_id, 'text'] = new_text
        
        # Инкрементально обновляем каждую метрику
        # Readability
        updated_df = readability.analyze_readability_batch(
            df.iloc[[paragraph_id]], 
            update_only=True
        )
        for col in ['lix', 'smog', 'complexity']:
            if col in updated_df.columns:
                df.at[paragraph_id, col] = updated_df.iloc[0][col]
        
        # Signal Strength (используем оптимизированный модуль)
        updated_df = self.embedding_service.analyze_signal_strength_incremental(
            df, topic, [paragraph_id]
        )
        df.at[paragraph_id, 'signal_strength'] = updated_df.at[paragraph_id, 'signal_strength']
        
        # Semantic Function (асинхронно)
        updated_df = await semantic_function.analyze_semantic_function_batch(
            df.iloc[[paragraph_id]], 
            topic
        )
        df.at[paragraph_id, 'semantic_function'] = updated_df.iloc[0]['semantic_function']
        df.at[paragraph_id, 'semantic_method'] = updated_df.iloc[0]['semantic_method']
        
        # Сохраняем обновленный DataFrame
        self.session_store.save_analysis(session_id, df, topic)
        
        # Возвращаем данные только для обновленного абзаца
        return self._format_paragraph_data(df.iloc[paragraph_id])
    
    async def get_cached_analysis(self, session_id: str) -> Dict:
        """
        Получает сохраненные результаты анализа.
        
        Args:
            session_id: Идентификатор сессии
            
        Returns:
            Dict: Сохраненные результаты или None
        """
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            return None
            
        df, topic = analysis_data["df"], analysis_data["topic"]
        return self._format_analysis_result(df, topic, session_id)
    
    async def _run_analysis_pipeline(self, paragraphs: List[str], topic: str) -> pd.DataFrame:
        """
        Запускает полный конвейер анализа для абзацев.
        Использует параллельное выполнение.
        
        Returns:
            pd.DataFrame с результатами всех анализов
        """
        # Создаем DataFrame
        df = pd.DataFrame({
            'paragraph_id': range(len(paragraphs)),
            'text': paragraphs
        })
        
        # Запускаем модули анализа в параллельных тасках
        tasks = [
            asyncio.create_task(self._run_readability(df.copy())),
            asyncio.create_task(self._run_signal_strength(df.copy(), topic)),
            asyncio.create_task(self._run_semantic_function(df.copy(), topic))
        ]
        
        # Ждем завершения всех задач
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Объединяем результаты в один DataFrame
        final_df = df.copy()
        
        for i, result_df in enumerate(results):
            if isinstance(result_df, Exception):
                # Логируем ошибку, но продолжаем с другими результатами
                import logging
                module_name = ["readability", "signal_strength", "semantic_function"][i]
                logging.error(f"Ошибка в модуле {module_name}: {result_df}")
                continue
                
            if isinstance(result_df, pd.DataFrame):
                # Копируем только колонки с метриками (не paragraph_id/text)
                metrics_columns = [col for col in result_df.columns 
                                 if col not in ['paragraph_id', 'text']]
                for col in metrics_columns:
                    final_df[col] = result_df[col]
        
        return final_df
    
    async def _run_readability(self, df: pd.DataFrame) -> pd.DataFrame:
        """Запускает анализ читаемости."""
        return readability.analyze_readability_batch(df)
    
    async def _run_signal_strength(self, df: pd.DataFrame, topic: str) -> pd.DataFrame:
        """Запускает анализ signal_strength с оптимизированным модулем."""
        return await self.embedding_service.analyze_signal_strength_async(df, topic)
    
    async def _run_semantic_function(self, df: pd.DataFrame, topic: str) -> pd.DataFrame:
        """Запускает анализ семантической функции."""
        return await semantic_function.analyze_semantic_function_batch(df, topic)
    
    def _format_analysis_result(self, df: pd.DataFrame, topic: str, session_id: str) -> Dict:
        """Форматирует результаты анализа для API-ответа."""
        # Вычисляем средние значения метрик
        avg_metrics = {
            'avg_complexity': df['complexity'].mean() if 'complexity' in df.columns else None,
            'avg_signal_strength': df['signal_strength'].mean() if 'signal_strength' in df.columns else None
        }
        
        # Форматируем метаданные
        metadata = {
            'session_id': session_id,
            'topic': topic,
            'analysis_timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'paragraph_count': len(df),
            **{k: round(v, 3) if v is not None else None for k, v in avg_metrics.items()}
        }
        
        # Форматируем данные абзацев
        paragraphs = [self._format_paragraph_data(row) for _, row in df.iterrows()]
        
        return {
            'metadata': metadata,
            'paragraphs': paragraphs
        }
    
    def _format_paragraph_data(self, row: pd.Series) -> Dict:
        """Форматирует данные одного абзаца для API-ответа."""
        # Выделяем метрики
        metrics = {}
        for col in row.index:
            if col not in ['paragraph_id', 'text']:
                value = row[col]
                # Преобразуем numpy/pandas типы в нативные Python типы
                if hasattr(value, 'item'):
                    value = value.item()
                metrics[col] = value
        
        return {
            'id': row['paragraph_id'],
            'text': row['text'],
            'metrics': metrics
        }
```

#### 2. Сервис хранения сессий

```python
# services/session_store.py
import redis
import json
import pandas as pd
import datetime
from typing import Dict, Optional, Tuple
import logging

class SessionStore:
    """
    Сервис для хранения состояния анализа между запросами.
    Использует Redis для распределенного кэширования.
    """
    
    def __init__(self, redis_url: str, ttl_seconds: int = 3600):
        """
        Инициализирует хранилище сессий.
        
        Args:
            redis_url: URL для подключения к Redis (redis://host:port/db)
            ttl_seconds: Время жизни сессии в секундах (по умолчанию 1 час)
        """
        self.ttl_seconds = ttl_seconds
        try:
            self.redis = redis.from_url(redis_url)
            # Проверка подключения
            self.redis.ping()
            logging.info(f"Подключение к Redis успешно: {redis_url}")
        except redis.ConnectionError as e:
            logging.error(f"Ошибка подключения к Redis ({redis_url}): {e}")
            # Переключаемся на локальный режим
            self.redis = None
            self.local_sessions = {}
            logging.warning("Переключение на локальное хранилище в памяти (не для продакшена).")
    
    def save_analysis(self, session_id: str, df: pd.DataFrame, topic: str) -> None:
        """
        Сохраняет результаты анализа.
        
        Args:
            session_id: Идентификатор сессии
            df: DataFrame с результатами анализа
            topic: Тема анализа
        """
        session_data = {
            "df_json": df.to_json(orient="records"),
            "topic": topic,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
        if self.redis:
            # Сохранение в Redis
            self.redis.set(
                f"analysis:{session_id}", 
                json.dumps(session_data),
                ex=self.ttl_seconds
            )
        else:
            # Локальное хранение
            self.local_sessions[session_id] = session_data
            # Очистка устаревших сессий
            self._cleanup_local_sessions()
    
    def get_analysis(self, session_id: str) -> Optional[Dict]:
        """
        Получает сохраненные результаты анализа.
        
        Args:
            session_id: Идентификатор сессии
            
        Returns:
            Dict с ключами 'df', 'topic' или None, если сессия не найдена
        """
        if self.redis:
            # Получение из Redis
            data = self.redis.get(f"analysis:{session_id}")
            if not data:
                return None
                
            session_data = json.loads(data)
        else:
            # Получение из локального хранилища
            if session_id not in self.local_sessions:
                return None
                
            session_data = self.local_sessions[session_id]
        
        # Преобразование JSON обратно в DataFrame
        df = pd.read_json(session_data["df_json"], orient="records")
        
        return {
            "df": df,
            "topic": session_data["topic"],
            "timestamp": session_data.get("timestamp")
        }
    
    def delete_analysis(self, session_id: str) -> bool:
        """
        Удаляет сохраненные результаты анализа.
        
        Args:
            session_id: Идентификатор сессии
            
        Returns:
            bool: True, если удаление успешно, иначе False
        """
        if self.redis:
            # Удаление из Redis
            return bool(self.redis.delete(f"analysis:{session_id}"))
        else:
            # Удаление из локального хранилища
            if session_id in self.local_sessions:
                del self.local_sessions[session_id]
                return True
            return False
    
    def _cleanup_local_sessions(self) -> None:
        """
        Очищает устаревшие сессии из локального хранилища.
        Используется только в режиме без Redis.
        """
        if not hasattr(self, 'local_sessions'):
            return
            
        now = datetime.datetime.now(datetime.timezone.utc)
        expired_sessions = []
        
        for session_id, data in self.local_sessions.items():
            timestamp_str = data.get("timestamp")
            if not timestamp_str:
                # Если нет временной метки, считаем сессию устаревшей
                expired_sessions.append(session_id)
                continue
                
            try:
                timestamp = datetime.datetime.fromisoformat(timestamp_str)
                age_seconds = (now - timestamp).total_seconds()
                if age_seconds > self.ttl_seconds:
                    expired_sessions.append(session_id)
            except ValueError:
                # Если неверный формат временной метки, удаляем сессию
                expired_sessions.append(session_id)
        
        # Удаляем устаревшие сессии
        for session_id in expired_sessions:
            del self.local_sessions[session_id]
            
        if expired_sessions:
            logging.info(f"Очищено {len(expired_sessions)} устаревших сессий.")
```

#### 3. API-модели и маршруты

```python
# api/models.py
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class TextAnalysisRequest(BaseModel):
    """Модель запроса для полного анализа текста."""
    text: str = Field(..., description="Текст для анализа")
    topic: str = Field(..., description="Тема для анализа")
    session_id: Optional[str] = Field(None, description="Опциональный ID сессии")

class ParagraphUpdateRequest(BaseModel):
    """Модель запроса для обновления одного абзаца."""
    session_id: str = Field(..., description="ID сессии")
    paragraph_id: int = Field(..., ge=0, description="ID абзаца")
    text: str = Field(..., description="Новый текст абзаца")

class ParagraphMetrics(BaseModel):
    """Модель метрик абзаца."""
    complexity: Optional[float] = None
    lix: Optional[float] = None
    smog: Optional[float] = None
    signal_strength: Optional[float] = None
    semantic_function: Optional[str] = None
    semantic_method: Optional[str] = None

class ParagraphData(BaseModel):
    """Модель данных абзаца."""
    id: int
    text: str
    metrics: ParagraphMetrics

class AnalysisMetadata(BaseModel):
    """Модель метаданных анализа."""
    session_id: str
    topic: str
    analysis_timestamp: str
    paragraph_count: int
    avg_complexity: Optional[float] = None
    avg_signal_strength: Optional[float] = None

class AnalysisResponse(BaseModel):
    """Модель полного ответа анализа."""
    metadata: AnalysisMetadata
    paragraphs: List[ParagraphData]
```

```python
# api/routes.py
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from typing import Optional
import uuid

from api.models import (
    TextAnalysisRequest, ParagraphUpdateRequest, 
    ParagraphData, AnalysisResponse
)
from api.orchestrator import AnalysisOrchestrator
from services.session_store import SessionStore
from services.embedding_service import EmbeddingService
from services.export_service import ExportService

# Создаем API роутер
router = APIRouter(prefix="/api", tags=["Analysis"])

# Зависимости
def get_orchestrator(
    session_store: SessionStore = Depends(get_session_store),
    embedding_service: EmbeddingService = Depends(get_embedding_service)
):
    return AnalysisOrchestrator(session_store, embedding_service)

def get_export_service(
    session_store: SessionStore = Depends(get_session_store)
):
    return ExportService(session_store)

@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_text(
    request: TextAnalysisRequest,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator)
):
    """
    Выполняет полный анализ текста.
    Разбивает текст на абзацы и запускает все виды анализа.
    """
    result = await orchestrator.analyze_full_text(
        request.text, request.topic, request.session_id
    )
    
    return result

@router.post("/update-paragraph", response_model=ParagraphData)
async def update_paragraph(
    request: ParagraphUpdateRequest,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator)
):
    """
    Обновляет один абзац и инкрементально пересчитывает метрики.
    Гораздо быстрее, чем полный анализ текста.
    """
    result = await orchestrator.analyze_incremental(
        request.session_id, request.paragraph_id, request.text
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Сессия не найдена или истекла")
    
    return result

@router.get("/analysis/{session_id}", response_model=AnalysisResponse)
async def get_analysis(
    session_id: str,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator)
):
    """
    Получает сохраненные результаты анализа по session_id.
    """
    result = await orchestrator.get_cached_analysis(session_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    
    return result

@router.get("/export/{session_id}")
async def export_analysis(
    session_id: str,
    format: str = Query("csv", regex="^(csv|json)$"),
    export_service: ExportService = Depends(get_export_service)
):
    """
    Экспортирует результаты анализа в CSV или JSON.
    """
    file_path = await export_service.export_analysis(session_id, format)
    
    if not file_path:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    
    return FileResponse(
        file_path, 
        media_type="text/csv" if format == "csv" else "application/json",
        filename=f"analysis-{session_id}.{format}"
    )
```

## Основная логика FastAPI-приложения

```python
# main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from api.routes import router as api_router
from services.embedding_service import EmbeddingService, get_embedding_service
from services.session_store import SessionStore
from config import settings
from logging_config import setup_logging

# Настройка логирования
setup_logging()

# Инициализация приложения
app = FastAPI(
    title="Text Analysis API",
    description="API для анализа текста по показателям читаемости, сигнальности и семантической функции",
    version="1.0.0"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(api_router)

# Инициализация необходимых сервисов при старте
@app.on_event("startup")
async def startup_event():
    logging.info("Инициализация приложения...")
    
    # Убедимся, что Redis доступен
    redis_url = settings.REDIS_URL
    session_store = SessionStore(redis_url)
    
    # Предварительная загрузка модели эмбеддингов
    embedding_service = get_embedding_service()
    
    logging.info("Инициализация завершена. Приложение готово к работе.")

# Проверка здоровья системы
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Запуск в режиме разработки
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host=settings.HOST, 
        port=settings.PORT,
        reload=settings.DEBUG
    )
```

## Конфигурация приложения

```python
# config.py
from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    """Конфигурация приложения на основе переменных окружения."""
    
    # Базовые настройки приложения
    APP_NAME: str = "text-analyzer"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_TTL: int = 3600  # 1 час
    
    # OpenAI (для semantic_function)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    
    # Настройки для embedding_service
    MODEL_NAME: str = "intfloat/multilingual-e5-large"
    EMBEDDING_CACHE_SIZE: int = 1000
    
    # Пути для сохранения файлов
    EXPORT_DIR: str = "exports"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Создаем экземпляр настроек
settings = Settings()

# Создаем директории, если они не существуют
os.makedirs(settings.EXPORT_DIR, exist_ok=True)
```

## Инфраструктура и деплой

### Docker-компоуз для локального развертывания

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8000:8000"
    volumes:
      - ./:/app
    env_file:
      - .env
    depends_on:
      - redis
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    env_file:
      - ./frontend/.env
    depends_on:
      - backend
    command: npm run dev
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

### Dockerfile для бэкенда

```dockerfile
# Dockerfile.backend
FROM python:3.10-slim

WORKDIR /app

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Устанавливаем GPU-драйверы и зависимости, если нужно
# В зависимости от вашего целевого окружения эти шаги могут отличаться
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Копируем код
COPY . .

# Создаем необходимые директории
RUN mkdir -p exports

# Порт для FastAPI
EXPOSE 8000

# Запуск приложения при старте контейнера
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## План внедрения

### Этап 1: Базовый API и инфраструктура (2 недели)

1. Настройка окружения разработки и CI/CD
2. Реализация основной структуры FastAPI приложения
3. Интеграция Redis для хранения состояния
4. Внедрение оптимизированного модуля signal_strength
5. Написание тестов для базовых API-эндпоинтов

### Этап 2: Адаптация модулей анализа (2 недели)

1. Переработка readability.py для асинхронной и инкрементальной работы
2. Переработка semantic_function.py для асинхронной и инкрементальной работы
3. Внедрение API-оркестратора
4. Реализация экспорта результатов в различные форматы
5. Тестирование производительности

### Этап 3: Разработка React-фронтенда (3 недели)

1. Создание интерактивных компонентов для работы с текстом
2. Реализация карточек абзацев с динамическим обновлением метрик
3. Добавление визуализации для разных типов метрик
4. Интеграция с API-эндпоинтами
5. Тестирование UX и отзывчивости интерфейса

### Этап 4: Финальное тестирование и релиз (1 неделя)

1. Комплексное тестирование всего стека
2. Оптимизация производительности
3. Документирование API и компонентов
4. Подготовка руководства пользователя
5. Релиз первой версии

## Ожидаемые результаты

Результатом внедрения новой архитектуры будет полнофункциональное интерактивное приложение для анализа текста, которое обеспечит:

1. **Моментальный отклик** для пользователя при редактировании текста
2. **Сохранение состояния** между сессиями
3. **Масштабируемость** для параллельной обработки текстов
4. **Интеграцию** с внешними системами через API
5. **Визуализацию** результатов в удобном формате

Оптимизированный модуль signal_strength станет основой высокой производительности системы, обеспечивая быстрый анализ даже для больших текстов.
### Дополнительные технические уточнения

На основе дополнительного анализа кода и технических требований, необходимо учесть следующие аспекты реализации:

#### 1. Корректная асинхронность в оркестраторе

Синхронные функции анализа необходимо запускать в отдельных потоках, чтобы избежать блокировки event loop:

```python
import concurrent.futures

async def _run_readability(self, df: pd.DataFrame) -> pd.DataFrame:
    """
    Запускает анализ читаемости в отдельном потоке для предотвращения блокировки event loop.
    """
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor() as executor:
        # Запускаем синхронную функцию в потоке
        return await loop.run_in_executor(
            executor,
            readability.analyze_readability_batch,
            df
        )
```

Аналогично для других синхронных функций, если они выполняют CPU-bound операции или блокирующие I/O.

#### 2. Оптимизация инкрементального обновления семантического анализа

При инкрементальном обновлении семантического анализа важно явно указывать, что обрабатывается один параграф:

```python
# В методе analyze_incremental
updated_df = await semantic_function.analyze_semantic_function_batch(
    df.iloc[[paragraph_id]], 
    topic,
    openai_service,
    single_paragraph=True  # Явно указываем, что обрабатываем один параграф
)
```

Это позволит модулю выбрать оптимизированный путь для одиночного абзаца, что снизит нагрузку на API и улучшит время отклика.

#### 3. Практики структурирования кода

Следует придерживаться стандартных практик структурирования кода:

- Импорты модулей следует размещать в начале файла, а не внутри функций
- Логгер следует получать один раз на уровне модуля, а не в каждой функции
- Документировать параметры и возвращаемые значения в docstrings

```python
# Хороший пример структуры модуля
import logging
import pandas as pd
import asyncio
from typing import Dict, List, Optional

# Получаем логгер один раз
logger = logging.getLogger(__name__)

class AnalysisOrchestrator:
    """Оркестратор анализа текста."""
    
    def __init__(self, ...):
        """Документированный конструктор."""
        # ...
        
    async def analyze_full_text(self, ...):
        """
        Документированный метод.
        
        Args:
            ...
            
        Returns:
            ...
        """
        # ...
```

#### 4. Docker-контейнеры с поддержкой GPU

Для эффективного использования GPU в продакшн-среде следует использовать специализированные Docker-образы:

```dockerfile
# Dockerfile.backend.gpu
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Установка базовых зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Копирование и установка Python-зависимостей
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Установка PyTorch с поддержкой CUDA
RUN pip3 install torch --index-url https://download.pytorch.org/whl/cu121

# Копирование кода приложения
COPY . .

# Запуск приложения
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Для запуска контейнера с GPU в docker-compose:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend.gpu
    # ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

#### 5. Более точная реализация Rate Limiting

Для более точного rate limiting с поддержкой микросекунд:

```python
class RateLimiter:
    def __init__(self, redis_client, limit=100, window=60):
        self.redis = redis_client
        self.limit = limit  # Макс. запросов
        self.window = window  # Окно в секундах
        
    async def __call__(self, request: Request):
        if not settings.ENABLE_RATE_LIMITING:
            return True
            
        ip = request.client.host
        key = f"rate_limit:{ip}"
        
        # Используем time.time() с микросекундами для большей точности
        current = time.time()
        window_start = current - self.window
        
        # Добавляем текущий запрос с уникальным score для избежания конфликтов
        pipeline = self.redis.pipeline()
        pipeline.zadd(key, {str(current): current})  # Используем строковый ключ
        pipeline.zremrangebyscore(key, 0, window_start)
        pipeline.zcard(key)
        pipeline.expire(key, self.window)
        results = pipeline.execute()
        
        # Проверяем лимит
        count = results[2]
        if count > self.limit:
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Allowed {self.limit} requests per {self.window}s."
            )
        return True
```

#### 6. Обработка объемных текстов в семантическом анализе

При анализе больших документов через OpenAI API необходимо учитывать ограничения на размер запроса:

```python
async def analyze_semantic_function_batch(df: pd.DataFrame, topic: str, openai_service, single_paragraph: bool = False) -> pd.DataFrame:
    """
    Анализирует семантическую функцию параграфов с учетом ограничений API.
    """
    # Проверка доступности API
    if not openai_service or not openai_service.is_available:
        # ... (код обработки недоступности API)
        
    # Если один абзац, обрабатываем оптимизированно
    if single_paragraph and len(df) == 1:
        # ... (код обработки одного абзаца)
        
    # Для нескольких абзацев проверяем на превышение лимитов токенов
    paragraphs = df['text'].tolist()
    total_text_length = sum(len(p) for p in paragraphs)
    
    # Примерная оценка количества токенов
    estimated_tokens = total_text_length / 4  # ~4 символа на токен
    
    # Если ожидаемое количество токенов превышает лимит, разбиваем на части
    if estimated_tokens > 4000:  # Примерный лимит для большинства запросов
        logging.warning(f"Текст слишком большой ({estimated_tokens} est. tokens). Разбиваем на части.")
        
        # Разбиваем DataFrame на части не более ~4000 токенов каждая
        chunk_size = max(1, int(4000 * 4 / (total_text_length / len(paragraphs))))
        chunks = [df.iloc[i:i+chunk_size] for i in range(0, len(df), chunk_size)]
        
        # Обрабатываем каждую часть отдельно
        results = []
        for i, chunk_df in enumerate(chunks):
            logging.info(f"Обработка части {i+1}/{len(chunks)} ({len(chunk_df)} абзацев)")
            try:
                # Рекурсивный вызов для части (без разбиения)
                result_df = await analyze_semantic_function_batch(
                    chunk_df, topic, openai_service, single_paragraph=False
                )
                results.append(result_df)
            except Exception as e:
                logging.error(f"Ошибка при обработке части {i+1}: {e}")
                # Создаем DataFrame с ошибками
                error_df = chunk_df.copy()
                error_df['semantic_function'] = "error"
                error_df['semantic_method'] = "error"
                error_df['semantic_error'] = str(e)
                results.append(error_df)
        
        # Объединяем результаты
        return pd.concat(results, ignore_index=True)
        
    # Основной код обработки всех абзацев...
```

Эти дополнительные уточнения обеспечат более эффективную, надежную и масштабируемую работу системы, особенно при обработке больших текстов и высокой нагрузке.### Технические уточнения по реализации

Для обеспечения корректной и эффективной работы системы необходимо учесть следующие технические детали:

#### 1. Инкрементальное обновление readability

Функция `readability.analyze_readability_batch` должна поддерживать инкрементальное обновление для эффективной работы с измененными абзацами:

```python
def analyze_readability_batch(df: pd.DataFrame, update_only: bool = False) -> pd.DataFrame:
    """
    Рассчитывает метрики читаемости для списка параграфов во входном DataFrame.

    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'.
        update_only: Если True, функция вернет только обработанные строки без 
                    модификации всего DataFrame. Полезно для инкрементальных обновлений.

    Returns:
        pandas.DataFrame с добавленными колонками 'lix', 'smog', 'complexity'.
    """
    if 'text' not in df.columns:
        logging.error("Входной DataFrame для readability не содержит колонку 'text'.")
        if update_only:
            # Возвращаем только обработанные строки
            return pd.DataFrame(columns=df.columns)
        else:
            # Добавляем пустые колонки к исходному DataFrame
            df['lix'] = pd.NA
            df['smog'] = pd.NA
            df['complexity'] = pd.NA
            return df
    
    # Создаем копию входного DataFrame для результатов, не модифицируя оригинал
    result_df = df.copy()
    
    # Обрабатываем параграфы
    # [основной код расчета метрик]
    
    # Возвращаем результат в соответствии с параметром update_only
    if update_only:
        # При update_only=True важно вернуть только копию обработанных строк,
        # чтобы оркестратор мог безопасно использовать df.at для обновления
        return result_df
    else:
        return result_df  # Возвращаем полную копию DataFrame с метриками
```

#### 2. Безопасность параллельного выполнения

Все функции анализа должны гарантировать потокобезопасность и не модифицировать входные данные:

```python
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
    # ВАЖНО: каждый модуль должен работать с копией DataFrame
    # и не должен модифицировать оригинал in-place
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
```

#### 3. Обработка ошибок в API-ответе

При возникновении ошибок в одном из модулей соответствующие метрики будут отсутствовать в ответе:

```python
class ParagraphMetrics(BaseModel):
    """
    Модель метрик абзаца.
    Если какой-то модуль анализа завершается с ошибкой,
    соответствующие поля будут иметь значение null.
    """
    complexity: Optional[float] = None
    lix: Optional[float] = None
    smog: Optional[float] = None
    signal_strength: Optional[float] = None
    semantic_function: Optional[str] = None
    semantic_method: Optional[str] = None
    semantic_error: Optional[str] = None  # Для хранения ошибок семантического анализа
```

#### 4. Реализация ExportService

Сервис экспорта результатов с автоматической очисткой временных файлов:

```python
# services/export_service.py
import os
import json
import tempfile
import pandas as pd
import logging
from typing import Optional
import time
import asyncio
from services.session_store import SessionStore

class ExportService:
    """
    Сервис для экспорта результатов анализа в различные форматы.
    """
    
    def __init__(self, session_store: SessionStore, export_dir: str = "exports", ttl_seconds: int = 3600):
        """
        Инициализирует сервис экспорта.
        
        Args:
            session_store: Хранилище сессий
            export_dir: Директория для временных файлов экспорта
            ttl_seconds: Время жизни экспортированных файлов в секундах
        """
        self.session_store = session_store
        self.export_dir = export_dir
        self.ttl_seconds = ttl_seconds
        
        # Создаем директорию для экспорта, если она не существует
        os.makedirs(self.export_dir, exist_ok=True)
        
        # Запускаем фоновую задачу очистки старых файлов
        asyncio.create_task(self._cleanup_old_files_periodically())
        
    async def export_analysis(self, session_id: str, format: str = "csv") -> Optional[str]:
        """
        Экспортирует результаты анализа в файл.
        
        Args:
            session_id: Идентификатор сессии
            format: Формат экспорта ("csv" или "json")
            
        Returns:
            Путь к файлу экспорта или None, если сессия не найдена
        """
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            return None
            
        df, topic = analysis_data["df"], analysis_data["topic"]
        
        # Создаем filename с timestamp и session_id для уникальности
        timestamp = int(time.time())
        filename = f"{self.export_dir}/analysis_{session_id}_{timestamp}.{format}"
        
        try:
            if format.lower() == "csv":
                df.to_csv(filename, index=False, encoding="utf-8")
            elif format.lower() == "json":
                # Форматируем данные в структуру, подобную API-ответу
                metadata = {
                    "session_id": session_id,
                    "topic": topic,
                    "export_timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
                    "paragraph_count": len(df)
                }
                
                # Преобразуем DataFrame в список словарей
                paragraphs = df.to_dict(orient="records")
                
                # Создаем структуру JSON
                export_data = {
                    "metadata": metadata,
                    "paragraphs": paragraphs
                }
                
                # Записываем в файл
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(export_data, f, ensure_ascii=False, indent=2)
            else:
                logging.error(f"Неподдерживаемый формат экспорта: {format}")
                return None
                
            logging.info(f"Экспорт в {format} сохранен: {filename}")
            return filename
        except Exception as e:
            logging.error(f"Ошибка при экспорте в {format}: {e}", exc_info=True)
            return None
            
    async def _cleanup_old_files_periodically(self, check_interval: int = 3600):
        """
        Периодически очищает старые файлы экспорта.
        
        Args:
            check_interval: Интервал проверки в секундах
        """
        while True:
            try:
                await asyncio.sleep(check_interval)
                await self._cleanup_old_files()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logging.error(f"Ошибка при очистке файлов: {e}", exc_info=True)
                
    async def _cleanup_old_files(self):
        """Удаляет файлы экспорта, старше ttl_seconds."""
        current_time = time.time()
        count_removed = 0
        
        try:
            for filename in os.listdir(self.export_dir):
                file_path = os.path.join(self.export_dir, filename)
                # Проверяем только файлы (не директории)
                if os.path.isfile(file_path):
                    # Проверяем время создания файла
                    file_mtime = os.path.getmtime(file_path)
                    if current_time - file_mtime > self.ttl_seconds:
                        # Удаляем старый файл
                        os.remove(file_path)
                        count_removed += 1
                        
            if count_removed > 0:
                logging.info(f"Удалено {count_removed} устаревших файлов экспорта")
        except Exception as e:
            logging.error(f"Ошибка при очистке файлов экспорта: {e}", exc_info=True)
```

#### 5. Использование session_id в /api/analyze

Уточнение поведения при предоставлении существующего session_id:

```python
@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_text(
    request: TextAnalysisRequest,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator)
):
    """
    Выполняет полный анализ текста.
    Разбивает текст на абзацы и запускает все виды анализа.
    
    Если в запросе указан session_id, результаты будут сохранены под этим ID,
    перезаписывая предыдущие данные. Это НЕ приводит к частичному обновлению 
    или дозагрузке существующих данных.
    """
    result = await orchestrator.analyze_full_text(
        request.text, request.topic, request.session_id
    )
    
    return result
```

Такое поведение обеспечивает предсказуемость: передача session_id нужна только для фронтенда, чтобы продолжать работать с той же сессией, но не предполагает частичное обновление данных.## Дополнительные аспекты реализации

### Безопасность и валидация

В клиент-серверной архитектуре безопасность является критическим аспектом. Для обеспечения безопасности API предусмотрены следующие меры:

1. **Валидация входных данных**: Использование Pydantic моделей для автоматической валидации и санитации входных данных.
    
2. **Ограничения доступа**: Для публичных API следует рассмотреть внедрение системы аутентификации и авторизации (например, OAuth2 или API-ключи).
    
3. **Защита от атак**:
    
    - Ограничение размера входных данных
    - Защита от SQL-инъекций (предоставляется ORM)
    - Защита от XSS-атак
    - Ограничение частоты запросов (Rate Limiting)
4. **Обработка ошибок**: Структурированная обработка ошибок с безопасными сообщениями, не раскрывающими внутреннюю информацию о системе.
    
5. **Защита сессий**: Безопасное хранение сессий с использованием Redis, с автоматическим истечением срока действия.
    

Пример реализации Rate Limiting:

```python
# middleware/rate_limiter.py
from fastapi import Request, HTTPException
import time
import redis
from config import settings

class RateLimiter:
    def __init__(self, redis_client, limit=100, window=60):
        self.redis = redis_client
        self.limit = limit  # Макс. запросов
        self.window = window  # Окно в секундах
        
    async def __call__(self, request: Request):
        if not settings.ENABLE_RATE_LIMITING:
            return True
            
        ip = request.client.host
        key = f"rate_limit:{ip}"
        
        current = int(time.time())
        window_start = current - self.window
        
        # Добавляем текущий запрос и удаляем устаревшие
        pipeline = self.redis.pipeline()
        pipeline.zadd(key, {current: current})
        pipeline.zremrangebyscore(key, 0, window_start)
        pipeline.zcard(key)
        pipeline.expire(key, self.window)
        results = pipeline.execute()
        
        # Проверяем лимит
        count = results[2]
        if count > self.limit:
            raise HTTPException(
                status_code=429, 
                detail="Too many requests. Please try again later."
            )
        return True
```

### Документация API

Для упрощения интеграции и использования API, FastAPI предоставляет автоматическую документацию через Swagger/OpenAPI:

```python
# main.py (дополнение)

# Настройка OpenAPI документации
app = FastAPI(
    title="Text Analysis API",
    description="API для анализа текста по показателям читаемости, сигнальности и семантической функции",
    version="1.0.0",
    docs_url="/docs",  # URL для Swagger UI
    redoc_url="/redoc", # URL для ReDoc
    openapi_url="/openapi.json" # URL для OpenAPI JSON
)

# Настройка тегов с описаниями
app.openapi_tags = [
    {
        "name": "Analysis",
        "description": "Операции для анализа текста и управления результатами анализа"
    },
    {
        "name": "System",
        "description": "Системные операции (проверка здоровья, статус и т.д.)"
    }
]
```

### Мониторинг и логирование

Для отслеживания работы системы в продакшен-среде реализован комплексный мониторинг и система логирования:

```python
# logging_config.py
import logging
import sys
from pathlib import Path
import time
from logging.handlers import RotatingFileHandler

def setup_logging(log_dir="logs", log_level=logging.INFO):
    """Настраивает систему логирования приложения."""
    log_formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Создаем директорию для логов, если не существует
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    
    # Настройка корневого логгера
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Консольный обработчик
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    root_logger.addHandler(console_handler)
    
    # Файловый обработчик с ротацией по размеру
    filename = f"{log_dir}/app_{time.strftime('%Y-%m-%d')}.log"
    file_handler = RotatingFileHandler(
        filename=filename,
        maxBytes=10_485_760,  # 10 MB
        backupCount=10,
        encoding="utf-8"
    )
    file_handler.setFormatter(log_formatter)
    root_logger.addHandler(file_handler)
    
    # Отдельный логгер для метрик производительности
    perf_logger = logging.getLogger("performance")
    perf_file_handler = RotatingFileHandler(
        filename=f"{log_dir}/performance.log",
        maxBytes=10_485_760,
        backupCount=5,
        encoding="utf-8"
    )
    perf_file_handler.setFormatter(log_formatter)
    perf_logger.addHandler(perf_file_handler)
    perf_logger.propagate = False  # Не дублируем записи в корневой логгер
    
    # Логирование для API запросов
    api_logger = logging.getLogger("api")
    api_file_handler = RotatingFileHandler(
        filename=f"{log_dir}/api.log",
        maxBytes=10_485_760,
        backupCount=5,
        encoding="utf-8"
    )
    api_file_handler.setFormatter(log_formatter)
    api_logger.addHandler(api_file_handler)
    api_logger.propagate = False
    
    logging.info("Система логирования инициализирована")
```

#### Middleware для логирования API-запросов:

```python
# middleware/logging.py
import time
import logging
from fastapi import Request

logger = logging.getLogger("api")

async def logging_middleware(request: Request, call_next):
    """Middleware для логирования API запросов и времени выполнения."""
    start_time = time.time()
    
    # Формируем информацию о запросе
    request_id = request.headers.get("X-Request-ID", "-")
    client_ip = request.client.host
    method = request.method
    url = str(request.url)
    
    # Логируем начало запроса
    logger.info(f"Request [ID: {request_id}] {method} {url} from {client_ip}")
    
    # Вызов следующего обработчика
    response = await call_next(request)
    
    # Измеряем и логируем время выполнения
    process_time = time.time() - start_time
    logger.info(
        f"Response [ID: {request_id}] {method} {url} status={response.status_code} "
        f"time={process_time:.4f}s"
    )
    
    # Записываем метрики производительности
    perf_logger = logging.getLogger("performance")
    perf_logger.info(
        f"PERF,{request_id},{method},{url},{response.status_code},{process_time:.4f}"
    )
    
    # Добавляем заголовок с временем обработки
    response.headers["X-Process-Time"] = str(process_time)
    
    return response
```

### Стратегия развертывания

Разработанное приложение может быть развернуто в различных средах с использованием Docker и Docker Compose для обеспечения согласованности между средами.

#### Структура Docker-файлов:

1. **Dockerfile для FastAPI бэкенда**:

```dockerfile
# Dockerfile.backend
FROM python:3.10-slim

WORKDIR /app

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Устанавливаем GPU-драйверы и зависимости для pytorch (опционально)
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Копируем код
COPY . .

# Создаем необходимые директории
RUN mkdir -p logs exports

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Порт для FastAPI
EXPOSE 8000

# Запуск приложения
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

2. **Dockerfile для React фронтенда**:

```dockerfile
# Dockerfile.frontend
FROM node:18-alpine as build

WORKDIR /app

# Копируем зависимости и устанавливаем их
COPY package.json package-lock.json ./
RUN npm ci

# Копируем остальные файлы и строим приложение
COPY . .
RUN npm run build

# Этап 2: рабочий контейнер
FROM nginx:alpine

# Копируем собранное приложение из первого этапа
COPY --from=build /app/build /usr/share/nginx/html

# Копируем настройки nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

3. **Docker Compose для локальной разработки**:

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

4. **Конфигурация Nginx для продакшена**:

```
# nginx.conf
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Статические файлы React
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Проксирование API запросов на бэкенд
    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Документация API
    location /docs {
        proxy_pass http://backend:8000/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Проверка здоровья
    location /health {
        proxy_pass http://backend:8000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## План внедрения

### Этап 1: Базовый API и инфраструктура (2 недели)

1. **Настройка окружения разработки и CI/CD**
    
    - Создание репозитория с базовой структурой проекта
    - Настройка Docker-контейнеров для разработки
    - Настройка GitHub Actions для CI/CD
2. **Реализация основной структуры FastAPI приложения**
    
    - Базовые маршруты API
    - Система логирования
    - Конфигурационные модели
3. **Интеграция Redis для хранения состояния**
    
    - Реализация SessionStore
    - Настройка TTL для сессий
    - Тестирование хранения и восстановления данных
4. **Внедрение оптимизированного модуля signal_strength**
    
    - Перенос кода из существующего модуля
    - Настройка кэширования и асинхронных операций
    - Профилирование производительности
5. **Написание тестов для базовых API-эндпоинтов**
    
    - Юнит-тесты для сервисов
    - Интеграционные тесты для API
    - Тесты производительности для критических операций

**Критерии завершения этапа:**

- Успешное выполнение базовых API-запросов
- Хранение и восстановление сессий из Redis
- Прохождение автоматизированных тестов
- Документация API

### Этап 2: Адаптация модулей анализа (2 недели)

1. **Переработка readability.py для асинхронной и инкрементальной работы**
    
    - Рефакторинг для поддержки батчинга
    - Оптимизация алгоритмов
    - Тестирование производительности
2. **Обновление semantic_function.py для работы только через API**
    
    - Интеграция с OpenAIService
    - Обработка случаев недоступности API
    - Тестирование разных сценариев
3. **Внедрение API-оркестратора**
    
    - Координация параллельного выполнения модулей
    - Агрегация результатов
    - Обработка ошибок в отдельных модулях
4. **Реализация экспорта результатов в различные форматы**
    
    - Экспорт в CSV
    - Экспорт в JSON
    - Экспорт в формат, совместимый с существующими отчетами
5. **Тестирование производительности**
    
    - Нагрузочное тестирование
    - Профилирование узких мест
    - Оптимизация критических операций

**Критерии завершения этапа:**

- Все модули анализа работают асинхронно
- Инкрементальное обновление работает быстрее полного анализа
- Экспорт результатов функционирует корректно
- Производительность удовлетворяет требованиям

### Этап 3: Разработка React-фронтенда (3 недели)

1. **Создание интерактивных компонентов для работы с текстом**
    
    - Компоненты для загрузки текста
    - Компоненты для указания темы
    - Интеграция с CardView
2. **Реализация карточек абзацев с динамическим обновлением метрик**
    
    - Компонент Card с редактируемым содержимым
    - Индикаторы метрик на карточках
    - Автоматическое обновление при изменении
3. **Добавление визуализации для разных типов метрик**
    
    - Цветовые шкалы для signal_strength и complexity
    - Индикаторы для semantic_function
    - Общая статистика по документу
4. **Интеграция с API-эндпоинтами**
    
    - Реализация сервисов для вызова API
    - Обработка ошибок и повторные попытки
    - Кэширование результатов на клиенте
5. **Тестирование UX и отзывчивости интерфейса**
    
    - Юзабилити-тестирование
    - Оптимизация отзывчивости
    - Кроссбраузерное тестирование

**Критерии завершения этапа:**

- Полностью функционирующий пользовательский интерфейс
- Корректная интеграция с API
- Быстрый отклик интерфейса при изменениях
- Поддержка основных браузеров

### Этап 4: Финальное тестирование и релиз (1 неделя)

1. **Комплексное тестирование всего стека**
    
    - End-to-end тестирование
    - Тестирование с реальными пользователями
    - Проверка всех кейсов использования
2. **Оптимизация производительности**
    
    - Профилирование и устранение узких мест
    - Оптимизация запросов к базе данных
    - Оптимизация рендеринга на клиенте
3. **Документирование API и компонентов**
    
    - Детальная документация API (OpenAPI)
    - Документация компонентов React
    - Руководство для разработчиков
4. **Подготовка руководства пользователя**
    
    - Скриншоты и примеры использования
    - Описание основных функций
    - Часто задаваемые вопросы
5. **Релиз первой версии**
    
    - Настройка продакшн-окружения
    - Миграция данных из старой системы
    - Мониторинг после релиза

**Критерии завершения этапа:**

- Все тесты успешно пройдены
- Документация полная и актуальная
- Система развернута в продакшн-окружении
- Отсутствие критических ошибок

## Ожидаемые результаты

Результатом внедрения новой архитектуры будет полнофункциональное интерактивное приложение для анализа текста, которое обеспечит:

1. **Моментальный отклик** для пользователя при редактировании текста
2. **Сохранение состояния** между сессиями
3. **Масштабируемость** для параллельной обработки текстов
4. **Интеграцию** с внешними системами через API
5. **Визуализацию** результатов в удобном формате

Оптимизированный модуль signal_strength станет основой высокой производительности системы, обеспечивая быстрый анализ даже для больших текстов.

## Обратная совместимость и миграция

Для обеспечения плавного перехода с существующей системы на новую архитектуру предусмотрены следующие меры:

1. **Экспорт существующих данных** в формат, совместимый с новой системой
2. **Временное параллельное функционирование** обеих систем с синхронизацией данных
3. **Адаптеры для API**, обеспечивающие работу с существующими клиентами
4. **Документирование изменений** для пользователей и разработчиков

## Потенциальные риски и их минимизация

|Риск|Вероятность|Влияние|Стратегия минимизации|
|---|---|---|---|
|Недоступность OpenAI API|Средняя|Высокое|Четкое уведомление пользователей о недоступности функции семантического анализа|
|Проблемы с производительностью при больших текстах|Средняя|Высокое|Оптимизация батчинга, асинхронные операции, мониторинг ресурсов|
|Сложности миграции данных|Низкая|Среднее|Подробное тестирование миграции, откат в случае проблем|
|Затруднения в интеграции с существующими системами|Средняя|Среднее|Адаптеры API, документация интеграции|
|Повышенная нагрузка на Redis|Низкая|Среднее|Мониторинг, кластеризация при необходимости|

## Заключение

Переход от монолитного приложения к клиент-серверной архитектуре представляет собой значительный шаг вперед в развитии системы анализа текста. Новая архитектура не только решит существующие проблемы с производительностью и интерактивностью, но и создаст основу для будущего масштабирования и расширения функциональности.

Четко структурированный план внедрения с конкретными этапами, критериями успеха и стратегиями минимизации рисков обеспечит плавный переход, минимизируя возможные негативные последствия для пользователей.# Стратегия перехода на клиент-серверную архитектуру для анализатора текста

## Обзор архитектуры

Проект переходит от монолитного приложения с генерацией статических HTML-отчетов к полноценной клиент-серверной архитектуре с разделением на React-фронтенд и FastAPI-бэкенд. Это обеспечит:

1. **Интерактивность** — мгновенный отклик пользовательского интерфейса
2. **Масштабируемость** — возможность горизонтального масштабирования бэкенда
3. **Инкрементальное обновление** — быстрый перерасчет метрик только для измененных абзацев
4. **Персистентность** — сохранение состояния между сессиями пользователя

![Архитектура](https://mermaid.ink/img/pako:eNp1UsGO2jAQ_RVrT6vEjwTCpQKpKmq3glapQHvpxTgTYsn2RLZDgMV8e50AlbaHXTvz3syb5xk_C6cJhRQGrXXUZ75Cd-kCJXO2I-vQtA0Fcg_WEYXuSVVg6LizXJvuI3WnYfjQBdv1FLhjcm-kKiM2ZpTJ_HzMDR6pgUg5Vn-mKfKkPzdm3qmQojdaOcOJw9OHvn8_Ni8vzzRTNS_bZZq99iCL9CcmPqEw0tmeyYXrcXoVA-cxEmGHSrYgPiXvyF8B-_e98SXQvyTlDKQMMCYUfmDZhUCOvAMLznZGsTNvZpyrTH_rGUJ2_MRIXi-kVCs-vr-LIeesrlXkpyEyJwlK4aEjU5ek3A8pJM80BpWVqqT_KNHVTc9YYimiy8R7Lp3VgVb8L_a_wPNZPZZ4B9twp2vSOXRfAMhCzuJlmlwh3TfI69xUKEvL-47eHFMQP7oB5aLljvxPSLm0Y4xQmBe9Xki54nnO5sFR61RIiHVGjdQ9PbaCXVV_Zus1dTFdHB-FdHG8SB88d0amhQ1XMh5FsSiYLZuiFiLeVnXVVls43K1v8qpa1GURFev5Jqzm2_pD_QVMtbyq)

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
    semantic_error: Optional[str] = None  # Для хранения ошибок семантического анализа

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
    semantic_analysis_available: bool = False  # Флаг доступности семантического анализа
    semantic_analysis_status: str = "unavailable"  # "complete", "pending", "unavailable", "error"

class AnalysisResponse(BaseModel):
    """Модель полного ответа анализа."""
    metadata: AnalysisMetadata
    paragraphs: List[ParagraphData]
```

#### 7. Основная логика FastAPI-приложения

```python
# main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from api.routes import router as api_router
from services.embedding_service import EmbeddingService, get_embedding_service
from services.openai_service import OpenAIService, get_openai_service
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
    
    # Проверка OpenAI API и уведомление
    if settings.ENABLE_SEMANTIC_ANALYSIS:
        openai_service = get_openai_service()
        if openai_service.is_available:
            logging.info("Семантический анализ через OpenAI API доступен")
        else:
            logging.warning("OpenAI API недоступен - семантический анализ будет отключен")
    else:
        logging.info("Семантический анализ отключен в настройках")
    
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

#### 5. API-маршруты

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
from services.openai_service import OpenAIService
from services.export_service import ExportService

# Создаем API роутер
router = APIRouter(prefix="/api", tags=["Analysis"])

# Зависимости
def get_orchestrator(
    session_store: SessionStore = Depends(get_session_store),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    openai_service: OpenAIService = Depends(get_openai_service)
):
    return AnalysisOrchestrator(session_store, embedding_service, openai_service)

def get_export_service(
    session_store: SessionStore = Depends(get_session_store)
):
    return ExportService(session_store)

def get_openai_service():
    return OpenAIService.get_instance()

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
    
    # Флаг, указывающий, требуется ли пытаться использовать семантический анализ
    ENABLE_SEMANTIC_ANALYSIS: bool = True
    
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
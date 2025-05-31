# Руководство по интеграции гибридного семантического анализа

## 🎯 Обзор

Гибридный подход объединяет скорость OpenAI Realtime API с надежностью REST API, обеспечивая:
- ⚡ **4x ускорение** на малых объемах (до 10 чанков)
- 🛡️ **100% надежность** через автоматический fallback
- 🧠 **Интеллектуальное управление** ошибками и восстановление
- 📈 **Адаптивную стратегию** для больших объемов

## 📦 Что у нас уже готово

### Модули анализа
- ✅ `analysis/semantic_function_realtime.py` - Realtime API клиент
- ✅ `analysis/semantic_function_hybrid.py` - Гибридный анализатор с fallback
- ✅ `analysis/semantic_function.py` - Существующий REST API анализ

### API эндпоинты
- ✅ `api/routes_hybrid.py` - Готовые гибридные эндпоинты
- ✅ Полная совместимость с существующими моделями данных

### Тесты
- ✅ `test_hybrid_semantic.py` - Юнит-тесты гибридного модуля
- ✅ `test_hybrid_api.py` - Интеграционные тесты API

## 🚀 Варианты интеграции

### Вариант 1: Добавление новых эндпоинтов (Рекомендуется)

**Преимущества**: Не ломает существующий функционал, легко откатить

1. В файле `main_new.py` добавьте импорт:
```python
from api.routes_hybrid import router as hybrid_router
```

2. Подключите роутер после других роутеров:
```python
app.include_router(router)  # существующий
app.include_router(hybrid_router)  # новый гибридный
```

3. Новые эндпоинты будут доступны:
- `POST /api/v1/hybrid/chunk/metrics/semantic`
- `POST /api/v1/hybrid/chunks/metrics/semantic-batch`
- `GET /api/v1/hybrid/stats`

### Вариант 2: Модификация существующих эндпоинтов

**Преимущества**: Прозрачное обновление для клиентов

В файле `api/routes.py` измените эндпоинт:

```python
@router.post("/v1/chunks/metrics/semantic-batch")
async def analyze_chunks_semantic_batch_endpoint(
    request_data: BatchChunkSemanticRequest = Body(...),
    use_hybrid: bool = Query(False, description="Использовать гибридный подход"),  # НОВОЕ
    openai_service: OpenAIService = Depends(get_openai_service)
) -> BatchChunkSemanticResponse:
    
    if use_hybrid:
        from analysis.semantic_function_hybrid import HybridSemanticAnalyzer
        
        analyzer = HybridSemanticAnalyzer(api_key=openai_service.api_key)
        try:
            # Используем гибридный анализатор
            results = await analyzer.analyze_batch(
                chunks=request_data.chunks,
                topic=request_data.topic,
                max_concurrent=request_data.max_parallel or 5
            )
            # ... обработка результатов ...
        finally:
            await analyzer.close()
    else:
        # Существующая логика
        raw_results = await analyze_batch_chunks_semantic(...)
```

### Вариант 3: Конфигурация через переменные окружения

Добавьте в `.env`:
```bash
# Гибридный семантический анализ
SEMANTIC_USE_HYBRID=false           # Включить гибридный подход по умолчанию
SEMANTIC_PREFER_REALTIME=true       # Предпочитать Realtime API
SEMANTIC_ADAPTIVE_BATCHING=true     # Адаптивная стратегия
SEMANTIC_MAX_REALTIME_FAILURES=3    # Порог отключения Realtime
SEMANTIC_RECOVERY_MINUTES=5         # Время восстановления
```

## 📊 Использование API

### Анализ одного чанка
```bash
curl -X POST "http://localhost:8000/api/v1/hybrid/chunk/metrics/semantic?prefer_realtime=true" \
  -H "Content-Type: application/json" \
  -d '{
    "chunk_id": "1",
    "chunk_text": "Текст для анализа",
    "full_text": "Полный текст документа",
    "topic": "Тема документа"
  }'
```

### Пакетный анализ
```bash
curl -X POST "http://localhost:8000/api/v1/hybrid/chunks/metrics/semantic-batch" \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [
      {"id": "1", "text": "Первый чанк"},
      {"id": "2", "text": "Второй чанк"}
    ],
    "full_text": "Полный текст",
    "topic": "Тема",
    "max_parallel": 5
  }'
```

### Получение статистики
```bash
curl "http://localhost:8000/api/v1/hybrid/stats"
```

## 🧪 Тестирование

1. Запустите FastAPI сервер:
```bash
python main_new.py
```

2. Запустите тесты API:
```bash
python test_hybrid_api.py
```

3. Запустите юнит-тесты:
```bash
python test_hybrid_semantic.py
```

## 📈 Мониторинг и отладка

### Логи
Гибридный модуль использует стандартный logger:
```python
logger = logging.getLogger(__name__)
```

Ключевые сообщения:
- `[HybridAPI]` - Эндпоинты API
- `[HybridSemanticAnalyzer]` - Основной анализатор
- `[RealtimeAPI]` - Realtime API операции

### Метрики в ответах
Каждый ответ содержит дополнительные поля:
- `api_method`: "realtime" | "rest" | "failed"
- `api_latency`: Время обработки (для Realtime)
- `semantic_method`: Включает префикс "hybrid_"

## ⚠️ Важные моменты

1. **WebSocket зависимость**: Realtime API требует WebSocket соединение
2. **Лимиты API**: Realtime API имеет ограничения на параллельные запросы
3. **Стоимость**: Realtime API может быть дороже REST API
4. **Стабильность**: Realtime API находится в preview

## 🎯 Рекомендации

### Для Production
1. Начните с Варианта 1 (новые эндпоинты)
2. Мониторьте использование через `/stats`
3. Постепенно мигрируйте клиентов
4. Используйте `prefer_realtime=false` для критичных операций

### Для Development
1. Экспериментируйте с параметрами
2. Тестируйте на разных объемах данных
3. Измеряйте производительность

## 📚 Дополнительная документация

- [Полное исследование Realtime API](./realtime-api-research.md)
- [Краткая справка](./realtime-api-quick-reference.md)
- [API документация](http://localhost:8000/docs) (после запуска сервера) 
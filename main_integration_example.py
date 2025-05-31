"""
Пример интеграции гибридного семантического анализа в FastAPI приложение.
Показывает, как добавить новые эндпоинты к существующему приложению.
"""

# В вашем main_new.py добавьте эти строки:

# 1. Импорт нового роутера (в начале файла с другими импортами)
from api.routes_hybrid import router as hybrid_router

# 2. Подключение роутера к приложению (после других app.include_router)
app.include_router(hybrid_router)

# Готово! Теперь доступны новые эндпоинты:
# - POST /api/v1/hybrid/chunk/metrics/semantic
# - POST /api/v1/hybrid/chunks/metrics/semantic-batch  
# - GET  /api/v1/hybrid/stats

# ============================================
# Альтернативный вариант: Модификация существующих эндпоинтов
# ============================================

"""
Вместо создания новых эндпоинтов, можно модифицировать существующие
в файле api/routes.py, добавив опциональный параметр use_hybrid:
"""

# В api/routes.py измените эндпоинт semantic-batch:
"""
@router.post("/v1/chunks/metrics/semantic-batch", response_model=BatchChunkSemanticResponse)
async def analyze_chunks_semantic_batch_endpoint(
    request_data: BatchChunkSemanticRequest = Body(...),
    use_hybrid: bool = Query(False, description="Использовать гибридный подход с Realtime API"),  # НОВЫЙ ПАРАМЕТР
    openai_service: OpenAIService = Depends(get_openai_service)
) -> BatchChunkSemanticResponse:
    
    if use_hybrid:
        # Используем гибридный анализатор
        from analysis.semantic_function_hybrid import HybridSemanticAnalyzer
        
        analyzer = HybridSemanticAnalyzer(api_key=openai_service.api_key)
        try:
            results = await analyzer.analyze_batch(
                chunks=request_data.chunks,
                topic=request_data.topic,
                max_concurrent=request_data.max_parallel or 5
            )
            # ... преобразование результатов ...
        finally:
            await analyzer.close()
    else:
        # Существующая логика с analyze_batch_chunks_semantic
        raw_results = await analyze_batch_chunks_semantic(...)
    
    return BatchChunkSemanticResponse(results=results, failed=failed)
"""

# ============================================
# Конфигурация через переменные окружения
# ============================================

"""
В .env файле можно добавить настройки:
"""
# SEMANTIC_USE_HYBRID=true                # Использовать гибридный подход по умолчанию
# SEMANTIC_PREFER_REALTIME=true           # Предпочитать Realtime API
# SEMANTIC_ADAPTIVE_BATCHING=true         # Адаптивная стратегия батчинга
# SEMANTIC_REALTIME_RECOVERY_MINUTES=5    # Время восстановления после ошибок 
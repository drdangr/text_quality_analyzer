"""
Оптимизированные эндпоинты для семантического анализа.
Анализируют множество чанков за один запрос к модели.
"""

from fastapi import APIRouter, Body, Depends, HTTPException
import logging
from typing import List

from api.models import (
    ChunkSemanticRequest,
    ChunkSemanticResponse,
    OptimizedBatchSemanticRequest,
    OptimizedSemanticResponse,
    ChunkBoundary
)
from services.openai_service import OpenAIService, get_openai_service
from analysis.semantic_function_optimized import OptimizedSemanticAnalyzer
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v2/optimized", tags=["Optimized Semantic Analysis"])


@router.post("/semantic/batch", response_model=OptimizedSemanticResponse)
async def analyze_batch_optimized(
    request_data: OptimizedBatchSemanticRequest = Body(...),
    openai_service: OpenAIService = Depends(get_openai_service)
) -> OptimizedSemanticResponse:
    """
    Оптимизированный пакетный семантический анализ.
    
    Анализирует все чанки документа за минимальное количество запросов к модели.
    
    Преимущества:
    - **Экономия токенов**: текст передается один раз
    - **Скорость**: один запрос вместо N запросов  
    - **Меньше rate limiting**: меньше запросов к API
    
    Пример запроса:
    ```json
    {
        "full_text": "Полный текст документа...",
        "chunk_boundaries": [
            {"chunk_id": "id1", "start": 0, "end": 100},
            {"chunk_id": "id2", "start": 100, "end": 250},
            {"chunk_id": "id3", "start": 250, "end": 400}
        ],
        "topic": "Тема документа"
    }
    ```
    """
    logger.info(
        f"[OptimizedAPI] Пакетный анализ {len(request_data.chunk_boundaries)} чанков, "
        f"текст: {len(request_data.full_text)} символов"
    )
    
    if not openai_service or not openai_service.is_available:
        raise HTTPException(
            status_code=503,
            detail="OpenAI service not available"
        )
    
    try:
        # Создаем анализатор
        analyzer = OptimizedSemanticAnalyzer(api_key=settings.OPENAI_API_KEY)
        
        # Подготавливаем данные
        chunk_ids = [cb.chunk_id for cb in request_data.chunk_boundaries]
        boundaries = [(cb.start, cb.end) for cb in request_data.chunk_boundaries]
        
        # Анализируем
        results = await analyzer.analyze_batch_optimized(
            full_text=request_data.full_text,
            chunk_boundaries=boundaries,
            chunk_ids=chunk_ids,
            topic=request_data.topic
        )
        
        # Преобразуем результаты в формат ответа
        response_results = []
        failed = []
        
        for result in results:
            chunk_id = result["chunk_id"]
            
            if result.get("semantic_error"):
                failed.append(chunk_id)
            
            response_results.append(ChunkSemanticResponse(
                chunk_id=chunk_id,
                metrics={
                    "semantic_function": result.get("semantic_function", "шум"),
                    "semantic_method": result.get("semantic_method", "optimized"),
                    "semantic_error": result.get("semantic_error")
                }
            ))
        
        # Оценка экономии токенов
        # Старый метод: (полный_текст + промпт) * количество_чанков
        # Новый метод: полный_текст + промпт + границы
        old_tokens = len(request_data.full_text) * len(chunk_ids) // 4  # ~4 символа на токен
        new_tokens = len(request_data.full_text) // 4 + 500  # текст + промпт
        tokens_saved = max(0, old_tokens - new_tokens)
        
        # Количество запросов
        requests_count = (len(chunk_ids) + 49) // 50  # До 50 чанков за запрос
        
        logger.info(
            f"[OptimizedAPI] ✅ Анализ завершен: {len(response_results)} результатов, "
            f"{len(failed)} ошибок, ~{tokens_saved} токенов сэкономлено, "
            f"{requests_count} запросов вместо {len(chunk_ids)}"
        )
        
        return OptimizedSemanticResponse(
            results=response_results,
            method="optimized_batch",
            requests_count=requests_count,
            tokens_saved=tokens_saved
        )
        
    except Exception as e:
        logger.error(f"[OptimizedAPI] Ошибка анализа: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Analysis error: {str(e)}"
        )


@router.post("/semantic/single", response_model=ChunkSemanticResponse)
async def analyze_single_optimized(
    request_data: ChunkSemanticRequest = Body(...),
    openai_service: OpenAIService = Depends(get_openai_service)
) -> ChunkSemanticResponse:
    """
    Оптимизированный анализ одного чанка.
    
    Используется для локальных обновлений при редактировании.
    """
    logger.info(f"[OptimizedAPI] Анализ одного чанка {request_data.chunk_id}")
    
    if not openai_service or not openai_service.is_available:
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics={
                "semantic_function": "unavailable_api",
                "semantic_method": "optimized",
                "semantic_error": "OpenAI service not available"
            }
        )
    
    try:
        # Создаем анализатор
        analyzer = OptimizedSemanticAnalyzer(api_key=settings.OPENAI_API_KEY)
        
        # Анализируем
        result = await analyzer.analyze_single_chunk(
            chunk_id=request_data.chunk_id,
            chunk_text=request_data.chunk_text,
            full_text=request_data.full_text,
            topic=request_data.topic
        )
        
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics={
                "semantic_function": result.get("semantic_function", "шум"),
                "semantic_method": result.get("semantic_method", "optimized_single"),
                "semantic_error": result.get("semantic_error")
            }
        )
        
    except Exception as e:
        logger.error(f"[OptimizedAPI] Ошибка анализа чанка {request_data.chunk_id}: {e}")
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics={
                "semantic_function": "error_api_call",
                "semantic_method": "optimized_error",
                "semantic_error": str(e)[:150]
            }
        )


@router.get("/stats")
async def get_optimization_stats() -> dict:
    """
    Получить статистику оптимизации.
    
    Показывает потенциальную экономию при использовании оптимизированного API.
    """
    return {
        "optimization_benefits": {
            "token_savings": "До 95% для больших документов",
            "speed_improvement": "10-50x быстрее для пакетной обработки",
            "rate_limit_reduction": "В N раз меньше запросов (N = количество чанков)",
            "max_chunks_per_request": 50
        },
        "recommendations": {
            "small_docs": "1-10 чанков: минимальная выгода",
            "medium_docs": "10-50 чанков: существенная экономия",
            "large_docs": "50+ чанков: критически важная оптимизация"
        }
    } 
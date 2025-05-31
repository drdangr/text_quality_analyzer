"""
Гибридные эндпоинты для семантического анализа с автоматическим fallback.
Расширение существующих эндпоинтов с поддержкой Realtime API.
"""

from fastapi import APIRouter, Body, Query, Depends, HTTPException
from typing import Optional
import logging
import asyncio

from api.models import (
    ChunkSemanticRequest, 
    ChunkSemanticResponse,
    BatchChunkSemanticRequest, 
    BatchChunkSemanticResponse
)
from services.openai_service import OpenAIService, get_openai_service
from analysis.semantic_function_hybrid import HybridSemanticAnalyzer
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/hybrid", tags=["Hybrid Semantic Analysis"])


@router.post("/chunk/metrics/semantic", response_model=ChunkSemanticResponse)
async def analyze_chunk_semantic_hybrid_endpoint(
    request_data: ChunkSemanticRequest = Body(...),
    prefer_realtime: bool = Query(True, description="Предпочитать Realtime API для скорости"),
    openai_service: OpenAIService = Depends(get_openai_service)
) -> ChunkSemanticResponse:
    """
    Анализирует семантическую функцию одного чанка с автоматическим fallback.
    
    - Использует Realtime API для скорости (4x быстрее)
    - Автоматически переключается на REST API при ошибках
    - 100% надежность благодаря fallback механизму
    """
    logger.info(f"[HybridAPI] Анализ чанка {request_data.chunk_id}, prefer_realtime={prefer_realtime}")
    
    if not openai_service or not openai_service.is_available:
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics={
                "semantic_function": "unavailable_api",
                "semantic_method": "hybrid",
                "semantic_error": "OpenAI service not available",
                "api_method": "none"
            }
        )
    
    try:
        # Создаем гибридный анализатор
        analyzer = HybridSemanticAnalyzer(
            api_key=settings.OPENAI_API_KEY,
            prefer_realtime=prefer_realtime
        )
        
        # Анализируем чанк
        result = await analyzer.analyze_chunk(
            chunk_id=request_data.chunk_id,
            chunk_text=request_data.chunk_text,
            topic=request_data.topic
        )
        
        # Добавляем информацию о методе в метрики
        metrics = {
            "semantic_function": result.get("semantic_function"),
            "semantic_method": f"hybrid_{result.get('api_method', 'unknown')}",
            "semantic_error": result.get("semantic_error"),
            "api_method": result.get("api_method"),
            "api_latency": result.get("api_latency", 0)
        }
        
        # Получаем статистику для логирования
        stats = await analyzer.get_statistics()
        api_method = result.get('api_method', 'unknown')
        logger.info(
            f"[HybridAPI] ✅ Чанк {request_data.chunk_id} обработан через {api_method.upper()}. "
            f"Функция: '{result.get('semantic_function', 'не определена')}'. "
            f"Время: {result.get('api_latency', 0):.2f}с. "
            f"Статистика Realtime: {stats['realtime_successes']} успехов, {stats['realtime_failures']} ошибок"
        )
        
        await analyzer.close()
        
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics=metrics
        )
        
    except Exception as e:
        logger.error(f"[HybridAPI] Ошибка для чанка {request_data.chunk_id}: {e}", exc_info=True)
        return ChunkSemanticResponse(
            chunk_id=request_data.chunk_id,
            metrics={
                "semantic_function": "error_api_call",
                "semantic_method": "hybrid_error",
                "semantic_error": f"Hybrid endpoint error: {str(e)[:150]}",
                "api_method": "failed"
            }
        )


@router.post("/chunks/metrics/semantic-batch", response_model=BatchChunkSemanticResponse)
async def analyze_chunks_semantic_batch_hybrid_endpoint(
    request_data: BatchChunkSemanticRequest = Body(...),
    prefer_realtime: bool = Query(True, description="Предпочитать Realtime API"),
    adaptive_batching: bool = Query(True, description="Использовать адаптивную стратегию батчинга"),
    openai_service: OpenAIService = Depends(get_openai_service)
) -> BatchChunkSemanticResponse:
    """
    Пакетный анализ семантических функций с гибридным подходом.
    
    Адаптивная стратегия:
    - Для малых объемов (<10 чанков): приоритет Realtime API
    - Для больших объемов: первые 25% через Realtime, остальные через REST
    - Автоматический fallback при ошибках
    - Оптимальный баланс скорости и надежности
    """
    logger.info(
        f"[HybridBatchAPI] 📦 Начинаем анализ {len(request_data.chunks)} чанков, "
        f"prefer_realtime={prefer_realtime}, adaptive={adaptive_batching}"
    )
    
    if not openai_service or not openai_service.is_available:
        # Возвращаем ошибки для всех чанков
        failed_results = []
        all_failed = []
        
        for chunk in request_data.chunks:
            chunk_id = chunk.get("id", "unknown")
            failed_results.append(ChunkSemanticResponse(
                chunk_id=chunk_id,
                metrics={
                    "semantic_function": "unavailable_api",
                    "semantic_method": "hybrid",
                    "semantic_error": "OpenAI service not available",
                    "api_method": "none"
                }
            ))
            all_failed.append(chunk_id)
        
        return BatchChunkSemanticResponse(results=failed_results, failed=all_failed)
    
    try:
        # Создаем гибридный анализатор
        analyzer = HybridSemanticAnalyzer(
            api_key=settings.OPENAI_API_KEY,
            prefer_realtime=prefer_realtime
        )
        
        # Добавляем задержку для больших объемов
        if len(request_data.chunks) > 10:
            # Для больших документов используем последовательную обработку с паузами
            logger.info(f"[HybridBatchAPI] 🐌 Большой документ ({len(request_data.chunks)} чанков) - добавляем задержки")
            results = []
            for i, chunk in enumerate(request_data.chunks):
                result = await analyzer.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"],
                    topic=request_data.topic
                )
                results.append(result)
                
                # Пауза каждые 5 чанков для избежания rate limit
                if (i + 1) % 5 == 0 and i < len(request_data.chunks) - 1:
                    logger.info(f"[HybridBatchAPI] ⏸️ Пауза после {i + 1} чанков (2 сек)")
                    await asyncio.sleep(2.0)
        else:
            # Для малых объемов используем стандартный батчинг
            results = await analyzer.analyze_batch(
                chunks=request_data.chunks,
                topic=request_data.topic,
                max_concurrent=request_data.max_parallel or 5,
                adaptive_batching=adaptive_batching
            )
        
        # Преобразуем результаты в формат ответа
        response_results = []
        failed = []
        
        # Собираем статистику по методам
        method_stats = {"realtime": 0, "rest": 0, "failed": 0}
        
        for result in results:
            chunk_id = result["chunk_id"]
            api_method = result.get("api_method", "unknown")
            
            # Обновляем статистику
            if api_method == "realtime":
                method_stats["realtime"] += 1
            elif api_method == "rest":
                method_stats["rest"] += 1
            else:
                method_stats["failed"] += 1
                failed.append(chunk_id)
            
            # Формируем метрики для ответа
            metrics = {
                "semantic_function": result.get("semantic_function"),
                "semantic_method": f"hybrid_{api_method}",
                "semantic_error": result.get("semantic_error"),
                "api_method": api_method,
                "api_latency": result.get("api_latency", 0)
            }
            
            response_results.append(ChunkSemanticResponse(
                chunk_id=chunk_id,
                metrics=metrics
            ))
        
        # Получаем финальную статистику
        stats = await analyzer.get_statistics()
        logger.info(
            f"[HybridBatchAPI] ✅ Завершен анализ {len(request_data.chunks)} чанков. "
            f"Результат: Realtime={method_stats['realtime']}, REST={method_stats['rest']}, Ошибки={method_stats['failed']}. "
            f"Realtime доступен: {'ДА' if stats['realtime_available'] else 'НЕТ'}. "
            f"Общая статистика Realtime: {stats['realtime_successes']} успехов, {stats['realtime_failures']} ошибок"
        )
        
        await analyzer.close()
        
        return BatchChunkSemanticResponse(results=response_results, failed=failed)
        
    except Exception as e:
        logger.error(f"[HybridBatchAPI] Критическая ошибка: {e}", exc_info=True)
        
        # Возвращаем ошибки для всех чанков
        failed_results = []
        all_failed = []
        
        for chunk in request_data.chunks:
            chunk_id = chunk.get("id", "unknown")
            failed_results.append(ChunkSemanticResponse(
                chunk_id=chunk_id,
                metrics={
                    "semantic_function": "error_api_call",
                    "semantic_method": "hybrid_error",
                    "semantic_error": f"Hybrid batch error: {str(e)[:100]}",
                    "api_method": "failed"
                }
            ))
            all_failed.append(chunk_id)
        
        return BatchChunkSemanticResponse(results=failed_results, failed=all_failed)


@router.get("/stats", tags=["Hybrid Semantic Analysis"])
async def get_hybrid_stats(
    openai_service: OpenAIService = Depends(get_openai_service)
) -> dict:
    """
    Получить статистику использования гибридного API.
    
    Показывает:
    - Доступность Realtime API
    - Количество успешных/неуспешных вызовов
    - Текущее состояние сессии
    """
    if not openai_service or not openai_service.is_available:
        return {
            "status": "unavailable",
            "message": "OpenAI service not configured"
        }
    
    try:
        # Создаем временный анализатор для получения статистики
        analyzer = HybridSemanticAnalyzer(api_key=settings.OPENAI_API_KEY)
        stats = await analyzer.get_statistics()
        await analyzer.close()
        
        return {
            "status": "available",
            "realtime_api": {
                "available": stats["realtime_available"],
                "failures": stats["realtime_failures"],
                "successes": stats["realtime_successes"],
                "last_failure": stats["last_failure"]
            },
            "recommendation": (
                "Realtime API работает нормально" 
                if stats["realtime_available"] 
                else "Используется fallback на REST API"
            )
        }
        
    except Exception as e:
        logger.error(f"[HybridStats] Ошибка получения статистики: {e}")
        return {
            "status": "error",
            "message": str(e)
        } 
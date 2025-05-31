"""
Гибридный модуль семантического анализа с автоматическим fallback.
Использует Realtime API для скорости, переключается на REST API при ошибках.
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

from .semantic_function import analyze_batch_chunks_semantic
from .semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig
from services.openai_service import OpenAIService

logger = logging.getLogger(__name__)


class APIMethod(Enum):
    """Методы API для анализа"""
    REALTIME = "realtime"
    REST = "rest"


@dataclass
class FailureTracker:
    """Отслеживание ошибок для адаптивного переключения"""
    realtime_failures: int = 0
    realtime_successes: int = 0
    last_failure_time: Optional[datetime] = None
    failure_threshold: int = 3
    recovery_timeout: timedelta = field(default_factory=lambda: timedelta(minutes=5))
    
    def record_failure(self):
        """Записать ошибку Realtime API"""
        self.realtime_failures += 1
        self.last_failure_time = datetime.now()
        
    def record_success(self):
        """Записать успешный вызов Realtime API"""
        self.realtime_successes += 1
        # Сбрасываем счетчик ошибок после серии успехов
        if self.realtime_successes > 5:
            self.realtime_failures = max(0, self.realtime_failures - 1)
            
    def should_use_realtime(self) -> bool:
        """Определить, стоит ли использовать Realtime API"""
        # Если слишком много ошибок
        if self.realtime_failures >= self.failure_threshold:
            # Проверяем, прошло ли время восстановления
            if self.last_failure_time:
                if datetime.now() - self.last_failure_time > self.recovery_timeout:
                    # Даем еще один шанс
                    self.realtime_failures = 0
                    self.realtime_successes = 0
                    return True
            return False
        return True


class HybridSemanticAnalyzer:
    """Гибридный анализатор с автоматическим переключением между API"""
    
    # Ошибки, при которых нужно переключиться на REST API
    FALLBACK_ERRORS = {
        "Conversation already has an active response",
        "WebSocket connection closed",
        "Session not initialized",
        "Response timeout",
        "Invalid session state"
    }
    
    def __init__(self, api_key: str, prefer_realtime: bool = True):
        self.api_key = api_key
        self.prefer_realtime = prefer_realtime
        self.openai_service = OpenAIService(api_key=api_key)
        self.realtime_analyzer: Optional[SemanticRealtimeAnalyzer] = None
        self.failure_tracker = FailureTracker()
        self._realtime_session_active = False
        self._current_topic: Optional[str] = None
        
    async def _ensure_realtime_session(self, topic: str) -> bool:
        """Убедиться, что сессия Realtime API активна"""
        try:
            # Если тема изменилась, пересоздаем сессию
            if self._current_topic != topic:
                if self.realtime_analyzer:
                    await self.realtime_analyzer.close()
                    self._realtime_session_active = False
                    
            if not self._realtime_session_active:
                self.realtime_analyzer = SemanticRealtimeAnalyzer(api_key=self.api_key)
                await self.realtime_analyzer.connect()
                
                config = RealtimeSessionConfig(
                    topic=topic,
                    temperature=0.6
                )
                await self.realtime_analyzer.initialize_session(config)
                
                self._realtime_session_active = True
                self._current_topic = topic
                logger.info("Realtime API сессия инициализирована успешно")
                
            return True
            
        except Exception as e:
            logger.warning(f"Не удалось инициализировать Realtime API: {e}")
            self._realtime_session_active = False
            return False
    
    def _should_fallback(self, error: Exception) -> bool:
        """Определить, нужно ли переключиться на REST API"""
        error_str = str(error)
        return any(err in error_str for err in self.FALLBACK_ERRORS)
    
    async def analyze_chunk(
        self,
        chunk_id: str,
        chunk_text: str,
        topic: str,
        force_method: Optional[APIMethod] = None
    ) -> Dict[str, Any]:
        """
        Анализировать один чанк с автоматическим fallback.
        
        Args:
            chunk_id: ID чанка
            chunk_text: Текст чанка
            topic: Тема для анализа
            force_method: Принудительно использовать указанный метод
            
        Returns:
            Результат анализа с информацией об использованном методе
        """
        # Определяем метод
        if force_method:
            use_realtime = force_method == APIMethod.REALTIME
        else:
            use_realtime = self.prefer_realtime and self.failure_tracker.should_use_realtime()
        
        # Попытка через Realtime API
        if use_realtime:
            try:
                # Убеждаемся, что сессия активна
                if await self._ensure_realtime_session(topic):
                    result = await self.realtime_analyzer.analyze_chunk(chunk_id, chunk_text)
                    
                    # Проверяем результат
                    if result.get("semantic_function") and "error" not in result.get("semantic_function", ""):
                        self.failure_tracker.record_success()
                        result["api_method"] = APIMethod.REALTIME.value
                        result["api_latency"] = result.get("processing_time", 0)
                        logger.debug(f"Чанк {chunk_id} успешно обработан через Realtime API")
                        return result
                    else:
                        raise Exception(f"Realtime API вернул ошибку: {result.get('semantic_error', 'Unknown')}")
                        
            except Exception as e:
                logger.warning(f"Ошибка Realtime API для чанка {chunk_id}: {e}")
                self.failure_tracker.record_failure()
                
                # Если это критическая ошибка, делаем fallback
                if self._should_fallback(e):
                    logger.info(f"Переключаемся на REST API для чанка {chunk_id}")
                else:
                    # Если ошибка не критическая, пробрасываем её
                    raise
        
        # Fallback на REST API
        try:
            logger.debug(f"Используем REST API для чанка {chunk_id}")
            
            # Подготавливаем данные для REST API
            chunks = [{"id": chunk_id, "text": chunk_text}]
            
            # Вызываем REST API
            results = await analyze_batch_chunks_semantic(
                chunks=chunks,
                full_text=chunk_text,  # Для одного чанка используем его же как контекст
                topic=topic,
                openai_service=self.openai_service,
                max_parallel=1
            )
            
            if results and len(results) > 0:
                result = results[0]
                metrics = result.get("metrics", {})
                
                return {
                    "chunk_id": chunk_id,
                    "semantic_function": metrics.get("semantic_function"),
                    "semantic_method": metrics.get("semantic_method"),
                    "semantic_error": metrics.get("semantic_error"),
                    "api_method": APIMethod.REST.value,
                    "api_latency": 0  # REST API не возвращает latency
                }
            else:
                raise Exception("REST API не вернул результат")
                
        except Exception as e:
            logger.error(f"Ошибка REST API для чанка {chunk_id}: {e}")
            return {
                "chunk_id": chunk_id,
                "semantic_function": None,
                "semantic_error": f"Оба API недоступны: {str(e)}",
                "api_method": "failed",
                "api_latency": 0
            }
    
    async def analyze_batch(
        self,
        chunks: List[Dict[str, str]],
        topic: str,
        max_concurrent: int = 5,
        adaptive_batching: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Анализировать пакет чанков с адаптивной стратегией.
        
        Args:
            chunks: Список чанков для анализа
            topic: Тема для анализа  
            max_concurrent: Максимальное количество параллельных запросов
            adaptive_batching: Использовать адаптивную стратегию батчинга
            
        Returns:
            Список результатов анализа
        """
        results = []
        
        if adaptive_batching and len(chunks) > 10 and self.failure_tracker.should_use_realtime():
            # Для больших объемов используем гибридный подход:
            # Первые несколько чанков через Realtime для быстрого старта
            # Остальные через REST API для надежности
            
            realtime_batch_size = min(5, len(chunks) // 4)
            
            logger.info(f"Гибридная стратегия: {realtime_batch_size} через Realtime, остальные через REST")
            
            # Обрабатываем первую часть через Realtime
            realtime_chunks = chunks[:realtime_batch_size]
            rest_chunks = chunks[realtime_batch_size:]
            
            # Realtime обработка (последовательно, с паузами)
            for chunk in realtime_chunks:
                result = await self.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"],
                    topic=topic,
                    force_method=APIMethod.REALTIME
                )
                results.append(result)
                
                # Пауза между запросами Realtime API
                if len(realtime_chunks) > 1:
                    await asyncio.sleep(0.5)
            
            # REST обработка (параллельно)
            if rest_chunks:
                rest_results = await analyze_batch_chunks_semantic(
                    chunks=rest_chunks,
                    full_text="\n\n".join([c["text"] for c in chunks]),
                    topic=topic,
                    openai_service=self.openai_service,
                    max_parallel=max_concurrent
                )
                
                # Преобразуем результаты в единый формат
                for chunk, result in zip(rest_chunks, rest_results):
                    metrics = result.get("metrics", {})
                    results.append({
                        "chunk_id": chunk["id"],
                        "semantic_function": metrics.get("semantic_function"),
                        "semantic_method": metrics.get("semantic_method"),
                        "semantic_error": metrics.get("semantic_error"),
                        "api_method": APIMethod.REST.value,
                        "api_latency": 0
                    })
        else:
            # Для малых объемов или при отключенном Realtime используем выбранный метод
            for chunk in chunks:
                result = await self.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"],
                    topic=topic
                )
                results.append(result)
                
                # Пауза только для Realtime API
                if result.get("api_method") == APIMethod.REALTIME.value and len(chunks) > 1:
                    await asyncio.sleep(0.5)
        
        # Статистика
        realtime_count = sum(1 for r in results if r.get("api_method") == APIMethod.REALTIME.value)
        rest_count = sum(1 for r in results if r.get("api_method") == APIMethod.REST.value)
        failed_count = sum(1 for r in results if r.get("api_method") == "failed")
        
        logger.info(
            f"Обработано {len(chunks)} чанков: "
            f"{realtime_count} через Realtime, {rest_count} через REST, {failed_count} ошибок"
        )
        
        return results
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику использования API"""
        return {
            "realtime_available": self.failure_tracker.should_use_realtime(),
            "realtime_failures": self.failure_tracker.realtime_failures,
            "realtime_successes": self.failure_tracker.realtime_successes,
            "last_failure": self.failure_tracker.last_failure_time.isoformat() if self.failure_tracker.last_failure_time else None,
            "session_active": self._realtime_session_active,
            "current_topic": self._current_topic
        }
    
    async def close(self):
        """Закрыть соединения"""
        if self.realtime_analyzer:
            await self.realtime_analyzer.close()
            self._realtime_session_active = False


# Функция для простой интеграции
async def analyze_semantic_hybrid(
    chunks: List[Dict[str, str]],
    topic: str,
    api_key: str,
    prefer_realtime: bool = True,
    **kwargs
) -> List[Dict[str, Any]]:
    """
    Простая функция для гибридного семантического анализа.
    
    Args:
        chunks: Список чанков для анализа
        topic: Тема текста
        api_key: Ключ OpenAI API
        prefer_realtime: Предпочитать Realtime API (если доступен)
        **kwargs: Дополнительные параметры для analyze_batch
        
    Returns:
        Список результатов анализа
    """
    analyzer = HybridSemanticAnalyzer(api_key=api_key, prefer_realtime=prefer_realtime)
    try:
        return await analyzer.analyze_batch(chunks, topic, **kwargs)
    finally:
        await analyzer.close() 
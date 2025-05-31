"""
Модуль семантического анализа через OpenAI Realtime API (WebSocket).
Альтернативная реализация для экономии квоты и улучшения производительности.
"""

import asyncio
import websockets
import json
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import inspect

logger = logging.getLogger(__name__)

@dataclass
class RealtimeChunkRequest:
    """Запрос анализа чанка через Realtime API"""
    chunk_id: str
    chunk_text: str
    
@dataclass
class RealtimeSessionConfig:
    """Конфигурация сессии Realtime API"""
    model: str = "gpt-4o-realtime-preview-2024-10-01"
    temperature: float = 0.3
    instructions: str = ""
    topic: str = ""

class SemanticRealtimeAnalyzer:
    """
    Анализатор семантических функций через WebSocket соединение.
    Преимущества:
    - Одно постоянное соединение для всех запросов
    - Меньшие задержки
    - Экономия квоты API
    - Сохранение контекста между запросами
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.session_active = False
        self.pending_requests: Dict[str, asyncio.Future] = {}
        self.uri = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
        
    async def connect(self):
        """Установить WebSocket соединение"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            # Создаем соединение с правильными параметрами
            self.websocket = await websockets.connect(
                self.uri,
                additional_headers=headers,  # Используем additional_headers - подтверждено тестом
                ping_interval=20,
                ping_timeout=10
            )
            
            self.session_active = True
            logger.info("[RealtimeAPI] WebSocket соединение установлено")
            
            # Запускаем обработчик входящих сообщений
            asyncio.create_task(self._message_handler())
            
        except Exception as e:
            logger.error(f"[RealtimeAPI] Ошибка подключения: {e}")
            raise
            
    async def initialize_session(self, config: RealtimeSessionConfig):
        """Инициализировать сессию с параметрами анализа"""
        if not self.websocket:
            await self.connect()
            
        # Подготавливаем инструкции с учетом темы
        full_instructions = f"""
        Ты — эксперт по анализу текста. Твоя задача - определять семантическую роль фрагментов текста.
        
        Тема документа: "{config.topic}"
        
        Возможные роли:
        1. раскрытие темы — развивает основную тему
        2. пояснение на примере — иллюстрирует тему конкретным случаем
        3. лирическое отступление — философское размышление
        4. ключевой тезис — центральная мысль
        5. шум — не относится к теме
        6. метафора или аналогия — образное выражение
        7. юмор или ирония или сарказм — комический эффект
        8. связующий переход — мостик между частями
        9. смена темы — переключение на другую тему
        10. противопоставление или контраст — различие идей
        
        ВАЖНЫЕ ПРАВИЛА:
        - Выбирай максимум ДВЕ РАЗНЫЕ роли
        - НЕ дублируй одну и ту же роль
        - Отвечай ТОЛЬКО названием роли через " / "
        """
        
        session_update = {
            "type": "session.update",
            "session": {
                "model": config.model,
                "instructions": full_instructions,
                "temperature": 0.6,  # Минимальное значение для Realtime API
                "turn_detection": {
                    "type": "server_vad",  # semantic_vad не поддерживается для этой модели
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 200,
                    "create_response": False  # Отключаем автоматическую генерацию
                },
                "modalities": ["text"],  # Используем только текст для экономии ресурсов
                "input_audio_format": "pcm16",  # Требуется даже для текстового режима
                "output_audio_format": "pcm16"  # Требуется даже для текстового режима
            }
        }
        
        await self.websocket.send(json.dumps(session_update))
        logger.info(f"[RealtimeAPI] Сессия инициализирована. Тема: '{config.topic[:30]}...'")
        
    async def analyze_chunk(self, chunk_id: str, chunk_text: str) -> Dict[str, Any]:
        """Анализировать один чанк"""
        if not self.websocket or not self.session_active:
            raise RuntimeError("WebSocket не подключен")
            
        # Создаем Future для ожидания ответа
        future = asyncio.Future()
        self.pending_requests[chunk_id] = future
        
        # Создаем сообщение в формате, который поддерживает API
        message = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{
                    "type": "input_text",
                    "text": f"Определи семантическую роль следующего фрагмента текста:\n\n\"{chunk_text}\"\n\nОтветь ТОЛЬКО названием роли из списка: раскрытие темы, пояснение на примере, лирическое отступление, ключевой тезис, шум, метафора или аналогия, юмор или ирония или сарказм, связующий переход, смена темы, противопоставление или контраст.\n\nID чанка для отслеживания: {chunk_id}"
                }]
            }
        }
        
        await self.websocket.send(json.dumps(message))
        
        # Запрашиваем генерацию ответа
        response_request = {
            "type": "response.create",
            "response": {
                "modalities": ["text"],
                "instructions": "Ответь только названием семантической роли из предложенного списка, без дополнительных пояснений."
            }
        }
        
        await self.websocket.send(json.dumps(response_request))
        
        logger.debug(f"[RealtimeAPI] Отправлен запрос для чанка {chunk_id}")
        
        try:
            # Ждем ответа (с таймаутом)
            result = await asyncio.wait_for(future, timeout=15.0)
            return result
        except asyncio.TimeoutError:
            logger.error(f"[RealtimeAPI] Таймаут ожидания ответа для чанка {chunk_id}")
            # Убираем из очереди
            self.pending_requests.pop(chunk_id, None)
            return {
                "chunk_id": chunk_id,
                "semantic_function": "error_timeout",
                "semantic_method": "realtime_api",
                "semantic_error": "Response timeout"
            }
            
    async def analyze_batch(self, chunks: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Анализировать пакет чанков"""
        results = []
        
        for chunk in chunks:
            try:
                result = await self.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"]
                )
                results.append(result)
                
                # Небольшая задержка между запросами
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"[RealtimeAPI] Ошибка анализа чанка {chunk['id']}: {e}")
                results.append({
                    "chunk_id": chunk["id"],
                    "semantic_function": "error_api_call",
                    "semantic_method": "realtime_api",
                    "semantic_error": str(e)
                })
                
        return results
        
    async def _message_handler(self):
        """Обработчик входящих сообщений от WebSocket"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                event_type = data.get("type", "")
                
                logger.debug(f"[RealtimeAPI] Получено событие: {event_type}")
                
                if event_type == "error":
                    # Обработка ошибок
                    error = data.get("error", {})
                    logger.error(f"[RealtimeAPI] Ошибка от сервера: {error.get('message', 'Unknown error')}")
                    
                    # Отменяем все ожидающие запросы
                    for chunk_id, future in self.pending_requests.items():
                        if not future.done():
                            future.set_exception(Exception(error.get('message', 'API Error')))
                
                elif event_type == "session.created":
                    logger.info("[RealtimeAPI] Сессия создана успешно")
                
                elif event_type == "session.updated":
                    logger.info("[RealtimeAPI] Сессия обновлена")
                    
                elif event_type == "response.created":
                    logger.debug("[RealtimeAPI] Начат ответ модели")
                    
                elif event_type == "response.text.delta":
                    # Накапливаем текст ответа
                    delta = data.get("delta", "")
                    # Здесь можно накапливать текст, если нужно
                    
                elif event_type == "response.text.done" or event_type == "response.done":
                    # Ответ завершен - извлекаем текст
                    # В Realtime API текст может быть в разных местах
                    text = ""
                    
                    # Пробуем разные варианты извлечения текста
                    if "text" in data:
                        text = data["text"]
                    elif "response" in data and isinstance(data["response"], dict):
                        # Возможно, текст в response.output
                        outputs = data["response"].get("output", [])
                        if outputs and isinstance(outputs, list):
                            for output in outputs:
                                if output.get("type") == "message":
                                    content = output.get("content", [])
                                    for item in content:
                                        if item.get("type") == "text":
                                            text = item.get("text", "")
                                            break
                    
                    # Если есть текст и ожидающие запросы
                    if text and self.pending_requests:
                        chunk_id = list(self.pending_requests.keys())[0]
                        future = self.pending_requests.pop(chunk_id, None)
                        
                        if future and not future.done():
                            # Парсим ответ
                            from analysis.semantic_function import _parse_single_chunk_response
                            semantic_function = _parse_single_chunk_response(text)
                            
                            result = {
                                "chunk_id": chunk_id,
                                "semantic_function": semantic_function,
                                "semantic_method": "realtime_api",
                                "semantic_error": None if semantic_function != "parsing_error" else "Failed to parse response"
                            }
                            
                            future.set_result(result)
                            logger.info(f"[RealtimeAPI] Получен ответ для чанка {chunk_id}: '{semantic_function}'")
                
        except websockets.exceptions.ConnectionClosed:
            logger.warning("[RealtimeAPI] WebSocket соединение закрыто")
            self.session_active = False
            
        except Exception as e:
            logger.error(f"[RealtimeAPI] Ошибка в обработчике сообщений: {e}", exc_info=True)
            self.session_active = False
            
    async def close(self):
        """Закрыть соединение"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            self.session_active = False
            logger.info("[RealtimeAPI] WebSocket соединение закрыто")
            
# Пример использования
async def example_usage():
    analyzer = SemanticRealtimeAnalyzer(api_key="your-api-key")
    
    try:
        # Подключаемся и инициализируем сессию
        config = RealtimeSessionConfig(
            topic="Искусственный интеллект",
            temperature=0.3
        )
        await analyzer.initialize_session(config)
        
        # Анализируем чанки
        chunks = [
            {"id": "1", "text": "ИИ революционизирует мир технологий"},
            {"id": "2", "text": "Как чайник на кухне - всегда готов помочь"},
            {"id": "3", "text": "Вчера я ел пиццу"}
        ]
        
        results = await analyzer.analyze_batch(chunks)
        
        for result in results:
            print(f"Чанк {result['chunk_id']}: {result['semantic_function']}")
            
    finally:
        await analyzer.close()

if __name__ == "__main__":
    asyncio.run(example_usage()) 
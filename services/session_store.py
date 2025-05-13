import redis # type: ignore
import json
import pandas as pd # type: ignore
import datetime
from typing import Dict, Optional, Any # Добавил Any для session_data в локальном хранилище
import logging

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

class SessionStore:
    """
    Сервис для хранения состояния анализа между запросами.
    Использует Redis для распределенного кэширования или локальный словарь в качестве fallback.
    """
    
    def __init__(self, redis_url: str, ttl_seconds: int = 3600):
        """
        Инициализирует хранилище сессий.
        
        Args:
            redis_url: URL для подключения к Redis (например, redis://localhost:6379/0)
            ttl_seconds: Время жизни сессии в Redis в секундах (по умолчанию 1 час)
        """
        self.ttl_seconds = ttl_seconds
        self.redis_client: Optional[redis.Redis] = None
        self.local_sessions: Dict[str, Dict[str, Any]] = {} # Для локального fallback

        if redis_url:
            try:
                self.redis_client = redis.from_url(redis_url)
                # Проверка подключения
                self.redis_client.ping()
                logger.info(f"Подключение к Redis ({redis_url}) успешно установлено.")
            except redis.exceptions.ConnectionError as e:
                logger.error(f"Ошибка подключения к Redis ({redis_url}): {e}. ")
                logger.warning("SessionStore переключается на локальное хранилище в памяти (НЕ для продакшена).")
                self.redis_client = None # Убедимся, что клиент None
            except Exception as e: # Ловим другие возможные ошибки от redis.from_url или ping
                logger.error(f"Непредвиденная ошибка при инициализации Redis ({redis_url}): {e}. ")
                logger.warning("SessionStore переключается на локальное хранилище в памяти (НЕ для продакшена).")
                self.redis_client = None
        else:
            logger.warning("URL для Redis не предоставлен. SessionStore будет использовать локальное хранилище в памяти (НЕ для продакшена).")
            self.redis_client = None

    def _generate_key(self, session_id: str) -> str:
        """Генерирует ключ для Redis."""
        return f"analysis_session:{session_id}"

    def save_analysis(self, session_id: str, df: pd.DataFrame, topic: str) -> None:
        """
        Сохраняет результаты анализа (DataFrame и тему).
        
        Args:
            session_id: Идентификатор сессии.
            df: pandas.DataFrame с результатами анализа.
            topic: Строка с темой анализа.
        """
        session_data = {
            "df_json": df.to_json(orient="records", date_format="iso"), # date_format для корректной сериализации дат
            "topic": topic,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
        serialized_data = json.dumps(session_data)

        if self.redis_client:
            try:
                key = self._generate_key(session_id)
                self.redis_client.set(key, serialized_data, ex=self.ttl_seconds)
                logger.debug(f"Сессия {session_id} сохранена в Redis (ключ: {key}).")
            except redis.exceptions.RedisError as e:
                logger.error(f"Ошибка сохранения сессии {session_id} в Redis: {e}. Попытка сохранения в локальный кэш.")
                # Fallback на локальное сохранение при ошибке Redis
                self._save_local(session_id, session_data)
            except Exception as e: # Неожиданные ошибки сериализации или другие
                 logger.error(f"Непредвиденная ошибка при сохранении сессии {session_id} в Redis: {e}. Попытка сохранения в локальный кэш.")
                 self._save_local(session_id, session_data)
        else:
            self._save_local(session_id, session_data)

    def _save_local(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """Внутренний метод для сохранения в локальный кэш."""
        self.local_sessions[session_id] = session_data
        logger.debug(f"Сессия {session_id} сохранена в локальном хранилище.")
        # Периодическая очистка не нужна здесь, т.к. это просто словарь в памяти
        # Если нужна очистка локального кэша, ее нужно вызывать извне или по таймеру в основном приложении

    def get_analysis(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Получает сохраненные результаты анализа.
        
        Returns:
            Словарь с ключами 'df' (pandas.DataFrame), 'topic' (str), 'timestamp' (str)
            или None, если сессия не найдена или произошла ошибка.
        """
        serialized_data: Optional[bytes] = None
        source: str = "local"

        if self.redis_client:
            try:
                key = self._generate_key(session_id)
                serialized_data = self.redis_client.get(key)
                source = "Redis"
                if serialized_data:
                    logger.debug(f"Сессия {session_id} получена из Redis (ключ: {key}).")
                else:
                    logger.debug(f"Сессия {session_id} не найдена в Redis (ключ: {key}).")
                    return None # Сессия не найдена
            except redis.exceptions.RedisError as e:
                logger.error(f"Ошибка получения сессии {session_id} из Redis: {e}. Попытка получения из локального кэша.")
                serialized_data = None # Сбрасываем, чтобы перейти к локальному
            except Exception as e:
                 logger.error(f"Непредвиденная ошибка при получении сессии {session_id} из Redis: {e}. Попытка получения из локального кэша.")
                 serialized_data = None
        
        if not serialized_data and not (self.redis_client and self.redis_client.exists(self._generate_key(session_id))):
             # Если Redis не использовался или там точно нет ключа, обращаемся к локальному хранилищу
            if session_id in self.local_sessions:
                session_data_dict = self.local_sessions[session_id]
                source = "local_sessions"
                logger.debug(f"Сессия {session_id} получена из локального хранилища.")
            else:
                logger.debug(f"Сессия {session_id} не найдена ни в Redis, ни в локальном хранилище.")
                return None
        elif not serialized_data:
            # Этот случай маловероятен, если Redis был доступен, но вернул None
            logger.debug(f"Сессия {session_id} не найдена (serialized_data is None после попытки Redis)." )
            return None
        else:
             # Десериализуем данные из Redis, если они были получены
            try:
                session_data_dict = json.loads(serialized_data.decode('utf-8')) # type: ignore
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                logger.error(f"Ошибка десериализации сессии {session_id} из {source}: {e}")
                return None

        try:
            df = pd.read_json(session_data_dict["df_json"], orient="records")
            return {
                "df": df,
                "topic": session_data_dict["topic"],
                "timestamp": session_data_dict.get("timestamp") # .get для обратной совместимости
            }
        except KeyError as e:
            logger.error(f"Ошибка: отсутствует ожидаемый ключ в данных сессии {session_id} из {source}: {e}")
            return None
        except Exception as e: # Другие ошибки при чтении pd.read_json
            logger.error(f"Ошибка при восстановлении DataFrame из сессии {session_id} ({source}): {e}")
            return None

    def delete_analysis(self, session_id: str) -> bool:
        """
        Удаляет сохраненные результаты анализа.
        Returns: True, если удаление было произведено (даже если ключ не существовал в Redis, del вернет 0, но это успех)
        """
        deleted_from_redis = False
        if self.redis_client:
            try:
                key = self._generate_key(session_id)
                # .delete() возвращает количество удаленных ключей (0 или 1)
                self.redis_client.delete(key)
                deleted_from_redis = True # Считаем успешным, если команда выполнена
                logger.debug(f"Попытка удаления сессии {session_id} из Redis (ключ: {key}).")
            except redis.exceptions.RedisError as e:
                logger.error(f"Ошибка удаления сессии {session_id} из Redis: {e}. Попытка удаления из локального кэша.")
            except Exception as e:
                 logger.error(f"Непредвиденная ошибка при удалении сессии {session_id} из Redis: {e}. Попытка удаления из локального кэша.")

        deleted_from_local = False
        if session_id in self.local_sessions:
            del self.local_sessions[session_id]
            deleted_from_local = True
            logger.debug(f"Сессия {session_id} удалена из локального хранилища.")
        
        # Возвращаем True, если удалено хотя бы из одного места или не было ошибок Redis
        return deleted_from_redis or deleted_from_local

    # Метод _cleanup_local_sessions не нужен, если мы не храним таймстемпы в self.local_sessions для TTL
    # и не реализуем активную очистку локального словаря. 
    # Локальный словарь будет очищаться только при перезапуске приложения.
    # Если нужна более сложная логика для локального TTL, ее можно добавить.

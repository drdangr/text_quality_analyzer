import os
import json
import pandas as pd # type: ignore
import logging
from typing import Optional, Dict, Any, TYPE_CHECKING
import time
import asyncio
import datetime

# Импортируем SessionStore для тайп-хинтинга, если он в том же пакете
# или настраиваем TYPE_CHECKING для избежания циклического импорта во время выполнения
if TYPE_CHECKING:
    from .session_store import SessionStore 

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

class ExportService:
    """
    Сервис для экспорта результатов анализа в различные форматы.
    Включает автоматическую очистку старых файлов экспорта.
    """
    
    def __init__(self, session_store: "SessionStore", export_dir: str = "exports", ttl_seconds: int = 3600):
        """
        Инициализирует сервис экспорта.
        
        Args:
            session_store: Экземпляр SessionStore для доступа к данным анализа.
            export_dir: Директория для сохранения временных файлов экспорта.
            ttl_seconds: Время жизни экспортированных файлов в секундах (по умолчанию 1 час).
        """
        self.session_store: "SessionStore" = session_store
        self.export_dir: str = export_dir
        self.ttl_seconds: int = ttl_seconds
        
        # Создаем директорию для экспорта, если она не существует
        try:
            os.makedirs(self.export_dir, exist_ok=True)
            logger.info(f"ExportService: Директория для экспорта '{os.path.abspath(self.export_dir)}' готова.")
        except Exception as e:
            logger.error(f"ExportService: Не удалось создать директорию для экспорта '{os.path.abspath(self.export_dir)}': {e}")
            # Можно пробросить исключение или работать без экспорта, если директория критична

        # Запускаем фоновую задачу очистки старых файлов, если это основной поток и есть event loop
        # Это более безопасно делать при старте FastAPI приложения.
        # Пока оставим запуск очистки как есть, но в реальном FastAPI приложении 
        # asyncio.create_task лучше вызывать в startup event.
        try:
            loop = asyncio.get_running_loop()
            if loop and loop.is_running(): # Проверяем, что цикл запущен
                 # Убедимся, что задача не создается многократно, если сервис инстанциируется несколько раз
                 # Это лучше делать через синглтон или флаг
                if not hasattr(ExportService, '_cleanup_task_started') or not ExportService._cleanup_task_started:
                    asyncio.create_task(self._cleanup_old_files_periodically())
                    ExportService._cleanup_task_started = True # type: ignore
                    logger.info("ExportService: Фоновая задача очистки старых файлов экспорта запущена.")
            else:
                logger.warning("ExportService: Event loop не запущен. Фоновая очистка файлов экспорта не будет активна.")
        except RuntimeError: # get_running_loop может вызвать RuntimeError, если нет текущего цикла
            logger.warning("ExportService: Не удалось получить текущий event loop. Фоновая очистка файлов экспорта не будет активна.")
            
    async def export_analysis(self, session_id: str, file_format: str = "csv") -> Optional[str]:
        """
        Экспортирует результаты анализа сессии в файл указанного формата.
        
        Args:
            session_id: Идентификатор сессии анализа.
            file_format: Формат экспорта ("csv" или "json").
            
        Returns:
            Абсолютный путь к созданному файлу экспорта или None, если сессия не найдена или произошла ошибка.
        """
        logger.debug(f"ExportService: Запрос на экспорт для сессии {session_id} в формат {file_format}.")
        analysis_data = self.session_store.get_analysis(session_id)
        
        if not analysis_data:
            logger.warning(f"ExportService: Анализ для сессии {session_id} не найден. Экспорт невозможен.")
            return None
            
        df = analysis_data.get("df")
        topic = analysis_data.get("topic", "unknown_topic") # Тема может отсутствовать в старых сессиях

        if not isinstance(df, pd.DataFrame):
            logger.error(f"ExportService: Данные для сессии {session_id} не содержат корректный DataFrame. Экспорт невозможен.")
            return None

        # Создаем уникальное имя файла
        timestamp = int(time.time())
        # Очищаем session_id от потенциально небезопасных символов для имени файла
        safe_session_id = "".join(c if c.isalnum() or c in ('-', '_') else '' for c in session_id)[:50]
        base_filename = f"analysis_{safe_session_id}_{timestamp}.{file_format.lower()}"
        absolute_file_path = os.path.join(os.path.abspath(self.export_dir), base_filename)
        
        try:
            if file_format.lower() == "csv":
                df.to_csv(absolute_file_path, index=False, encoding="utf-8-sig") # utf-8-sig для лучшей совместимости с Excel
            elif file_format.lower() == "json":
                # Форматируем данные, подобные API-ответу
                metadata = {
                    "session_id": session_id,
                    "topic": topic,
                    "export_timestamp_unix": timestamp,
                    "export_timestamp_iso": datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc).isoformat(),
                    "paragraph_count": len(df)
                }
                # Преобразуем DataFrame в список словарей, как в API Orchestrator
                paragraphs_list = []
                for _, row in df.iterrows():
                    metrics_dict = {}
                    for col in row.index:
                        if col not in ['paragraph_id', 'text']:
                            value = row[col]
                            if pd.isna(value):
                                metrics_dict[col] = None
                            elif hasattr(value, 'item'): # numpy bool_, int_, float_ etc.
                                metrics_dict[col] = value.item()
                            else:
                                metrics_dict[col] = value
                    paragraphs_list.append({
                        'id': row.get('paragraph_id'),
                        'text': row.get('text'),
                        'metrics': metrics_dict
                    })
                
                export_data = {
                    "metadata": metadata,
                    "paragraphs": paragraphs_list
                }
                with open(absolute_file_path, "w", encoding="utf-8") as f:
                    json.dump(export_data, f, ensure_ascii=False, indent=2)
            else:
                logger.error(f"ExportService: Неподдерживаемый формат экспорта: {file_format} для сессии {session_id}.")
                return None
                
            logger.info(f"ExportService: Результаты анализа для сессии {session_id} экспортированы в файл: {absolute_file_path}")
            return absolute_file_path
        except Exception as e:
            logger.error(f"ExportService: Ошибка при экспорте данных сессии {session_id} в файл {absolute_file_path}: {e}", exc_info=True)
            # Попытка удалить частично созданный файл в случае ошибки
            if os.path.exists(absolute_file_path):
                try:
                    os.remove(absolute_file_path)
                except Exception as remove_e:
                    logger.error(f"ExportService: Не удалось удалить частично созданный файл экспорта {absolute_file_path}: {remove_e}")
            return None
            
    async def _cleanup_old_files_periodically(self, check_interval_seconds: int = 3600) -> None:
        """
        Периодически запускает задачу очистки старых файлов экспорта.
        """
        logger.info(f"ExportService: Периодическая очистка файлов экспорта настроена с интервалом {check_interval_seconds} сек.")
        while True:
            await asyncio.sleep(check_interval_seconds)
            await self._cleanup_old_files_task()
            
    async def _cleanup_old_files_task(self) -> None:
        """Выполняет фактическую очистку старых файлов экспорта."""
        current_time = time.time()
        files_removed_count = 0
        logger.debug(f"ExportService: Запуск задачи очистки старых файлов экспорта в директории '{self.export_dir}' (TTL: {self.ttl_seconds} сек)...")
        
        try:
            for filename in os.listdir(self.export_dir):
                file_path = os.path.join(self.export_dir, filename)
                if os.path.isfile(file_path):
                    try:
                        file_modification_time = os.path.getmtime(file_path)
                        if (current_time - file_modification_time) > self.ttl_seconds:
                            os.remove(file_path)
                            files_removed_count += 1
                            logger.debug(f"ExportService: Удален устаревший файл экспорта: {file_path}")
                    except Exception as e_file:
                        logger.error(f"ExportService: Ошибка при обработке файла {file_path} для очистки: {e_file}")
                        
            if files_removed_count > 0:
                logger.info(f"ExportService: Удалено {files_removed_count} устаревших файлов экспорта.")
            else:
                logger.debug("ExportService: Устаревшие файлы экспорта для удаления не найдены.")
        except Exception as e:
            logger.error(f"ExportService: Ошибка во время задачи очистки файлов экспорта: {e}", exc_info=True)

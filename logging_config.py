import logging
import sys
from pathlib import Path
import time
from logging.handlers import RotatingFileHandler

# Импортируем settings из config.py
from config import settings 

def setup_logging(log_level_str: str = "INFO"):
    """Настраивает систему логирования приложения."""
    
    # Преобразуем строковый уровень лога в числовой
    log_level = getattr(logging, log_level_str.upper(), logging.INFO)

    log_formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Создаем директорию для логов, если не существует
    # Используем LOG_DIR из settings
    log_dir_path = Path(settings.LOG_DIR)
    log_dir_path.mkdir(parents=True, exist_ok=True)
    
    # Настройка корневого логгера
    root_logger = logging.getLogger() # Получаем корневой логгер
    # Очищаем существующие обработчики, если они есть, чтобы избежать дублирования
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
        
    root_logger.setLevel(log_level)
    
    # Консольный обработчик
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(log_formatter)
    root_logger.addHandler(console_handler)
    
    # Файловый обработчик с ротацией по размеру для основных логов приложения
    # Имя файла теперь включает дату
    app_log_filename = log_dir_path / f"app_{time.strftime('%Y-%m-%d')}.log"
    app_file_handler = RotatingFileHandler(
        filename=app_log_filename,
        maxBytes=10_485_760,  # 10 MB
        backupCount=10,
        encoding="utf-8"
    )
    app_file_handler.setFormatter(log_formatter)
    root_logger.addHandler(app_file_handler)
    
    # Отдельный логгер для метрик производительности
    perf_logger = logging.getLogger("performance")
    # Устанавливаем уровень и для этого логгера, и очищаем обработчики
    if perf_logger.hasHandlers():
        perf_logger.handlers.clear()
    perf_logger.setLevel(log_level)
    perf_log_filename = log_dir_path / "performance.log"
    perf_file_handler = RotatingFileHandler(
        filename=perf_log_filename,
        maxBytes=10_485_760,
        backupCount=5,
        encoding="utf-8"
    )
    perf_file_handler.setFormatter(log_formatter)
    perf_logger.addHandler(perf_file_handler)
    perf_logger.propagate = False  # Не дублируем записи в корневой логгер
    
    # Логирование для API запросов
    api_logger = logging.getLogger("api")
    if api_logger.hasHandlers():
        api_logger.handlers.clear()
    api_logger.setLevel(log_level)
    api_log_filename = log_dir_path / "api.log"
    api_file_handler = RotatingFileHandler(
        filename=api_log_filename,
        maxBytes=10_485_760,
        backupCount=5,
        encoding="utf-8"
    )
    api_file_handler.setFormatter(log_formatter)
    api_logger.addHandler(api_file_handler)
    api_logger.propagate = False
    
    logging.info(f"Система логирования инициализирована. Уровень: {log_level_str.upper()}. Директория логов: {log_dir_path.resolve()})")

# Можно добавить пример вызова для проверки, если запускать файл напрямую
# if __name__ == '__main__':
#     setup_logging(log_level_str="DEBUG")
#     logging.debug("Это тестовое DEBUG сообщение.")
#     logging.info("Это тестовое INFO сообщение.")
#     logging.getLogger("performance").info("Это тестовое сообщение производительности.")
#     logging.getLogger("api").info("Это тестовое API сообщение.")

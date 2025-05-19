from pydantic_settings import BaseSettings
from typing import List, Optional
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
    REDIS_URL: str = "redis://redis:6379/0"  # Изменено для работы с Docker
    SESSION_TTL: int = 3600  # 1 час
    
    # OpenAI (для semantic_function)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o" # gpt-4-turbo изменил на gpt-4o
    
    # Флаг, указывающий, требуется ли пытаться использовать семантический анализ
    ENABLE_SEMANTIC_ANALYSIS: bool = True
    
    # Настройки для embedding_service
    MODEL_NAME: str = "intfloat/multilingual-e5-large"
    EMBEDDING_CACHE_SIZE: int = 1000
    
    # Пути для сохранения файлов
    EXPORT_DIR: str = "exports"
    LOG_DIR: str = "logs" # Добавил LOG_DIR для logging_config
    
    # Добавлены недостающие поля
    vite_api_url: Optional[str] = None
    log_level: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "allow"  # Разрешаем дополнительные поля

# Создаем экземпляр настроек
settings = Settings()

# Создаем директории, если они не существуют
# (Перенесено в logging_config.py и main.py для корректной инициализации)
# os.makedirs(settings.EXPORT_DIR, exist_ok=True)
# os.makedirs(settings.LOG_DIR, exist_ok=True) # Добавил LOG_DIR

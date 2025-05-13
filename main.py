import logging
import os
from pathlib import Path # Убедимся, что Path импортирован здесь

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from logging_config import setup_logging

# --- Импорт сервисов и роутера --- 
from api.routes import router as api_router
from services.session_store import SessionStore
from services.embedding_service import EmbeddingService, get_embedding_service
from services.openai_service import OpenAIService, get_openai_service
from api.orchestrator import AnalysisOrchestrator
# ExportService не используется напрямую в main, но его DI может быть здесь для инициализации
from services.export_service import ExportService 

# --- Настройка логирования --- 
log_level_from_settings = "DEBUG" if settings.DEBUG else "INFO"
setup_logging(log_level_str=log_level_from_settings)

# Получаем логгер для текущего модуля (main_new)
logger = logging.getLogger(__name__) 

# --- Инициализация FastAPI приложения --- 
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.1", # Небольшое обновление версии для новой архитектуры
    description="API для анализа текста по показателям читаемости, сигнальности и семантической функции. Новая архитектура.",
    debug=settings.DEBUG,
    # Можно добавить openapi_tags из docs/Strategy of Transit.md, если нужно
    openapi_tags=[
        {
            "name": "Analysis",
            "description": "Операции для анализа текста, управления сессиями и экспорта результатов."
        },
        {
            "name": "System",
            "description": "Системные операции, такие как проверка работоспособности."
        }
    ]
)

# --- Настройка CORS --- 
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    logging.warning("CORS_ORIGINS не определены. CORS middleware не будет добавлен.")

# --- Инициализация и управление состоянием (сервисами) --- 
# Храним экземпляры сервисов в app.state для обеспечения синглтонов в рамках приложения.

@app.on_event("startup")
async def startup_event():
    logging.info(f"Запуск FastAPI приложения '{settings.APP_NAME}' v{app.version}...")
    
    # Создание директории для экспорта, если ее нет
    export_dir_path = Path(settings.EXPORT_DIR)
    try:
        export_dir_path.mkdir(parents=True, exist_ok=True)
        logging.info(f"Директория для экспорта '{export_dir_path.resolve()}' готова.")
    except Exception as e:
        logging.error(f"Не удалось создать директорию для экспорта '{export_dir_path.resolve()}': {e}")

    logging.info("Инициализация сервисов...")
    # SessionStore
    app.state.session_store = SessionStore(redis_url=settings.REDIS_URL, ttl_seconds=settings.SESSION_TTL)
    logger.info("SessionStore инициализирован.")

    # EmbeddingService (используем фабрику, которая создает синглтон)
    app.state.embedding_service = get_embedding_service() 
    if not app.state.embedding_service.is_ready():
        logger.error("КРИТИЧЕСКАЯ ОШИБКА: EmbeddingService не смог инициализировать модель!")
    else:
        logger.info("EmbeddingService инициализирован и готов.")

    # OpenAIService (используем фабрику, которая создает синглтон)
    app.state.openai_service = get_openai_service() 
    if settings.ENABLE_SEMANTIC_ANALYSIS:
        if app.state.openai_service.is_available:
            logger.info("OpenAIService инициализирован. Семантический анализ через OpenAI API доступен.")
        else:
            logger.warning("OpenAIService: OpenAI API НЕДОСТУПЕН. Семантический анализ будет ограничен.")
    else:
        logger.info("OpenAIService: Семантический анализ отключен в настройках (ENABLE_SEMANTIC_ANALYSIS=False).")
    
    # ExportService (требует session_store)
    app.state.export_service = ExportService(
        session_store=app.state.session_store, 
        export_dir=settings.EXPORT_DIR, 
        ttl_seconds=settings.SESSION_TTL 
    )
    logger.info("ExportService инициализирован.")

    # Оркестратор (требует другие сервисы)
    app.state.orchestrator = AnalysisOrchestrator(
        session_store=app.state.session_store,
        embedding_service=app.state.embedding_service,
        openai_service=app.state.openai_service
    )
    logger.info("AnalysisOrchestrator инициализирован.")
    
    logging.info(f"Приложение '{settings.APP_NAME}' успешно запущено. Debug mode: {settings.DEBUG}")
    logging.info(f"Доступно по адресу: http://{settings.HOST}:{settings.PORT}{app.docs_url}")
    logging.info(f"Документация ReDoc: http://{settings.HOST}:{settings.PORT}{app.redoc_url}")

@app.on_event("shutdown")
async def shutdown_event():
    logging.info(f"Остановка FastAPI приложения '{settings.APP_NAME}'...")
    if hasattr(app.state, 'session_store') and app.state.session_store.redis_client:
        try:
            app.state.session_store.redis_client.close()
            logger.info("Соединение с Redis закрыто.")
        except Exception as e:
            logger.error(f"Ошибка при закрытии соединения с Redis: {e}")
    logging.info("Приложение остановлено.")

# --- Переопределение зависимостей для использования экземпляров из app.state --- 

def get_session_store_override() -> SessionStore:
    return app.state.session_store

def get_embedding_service_override() -> EmbeddingService:
    return app.state.embedding_service

def get_openai_service_override() -> OpenAIService:
    return app.state.openai_service

def get_export_service_override() -> ExportService:
    return app.state.export_service

def get_orchestrator_override() -> AnalysisOrchestrator:
    return app.state.orchestrator

# Применяем переопределения к зависимостям в роутере
# Импортируем новые DI-функции из api.routes
from api.routes import (
    get_session_store_di, 
    get_orchestrator_di, 
    get_export_service_di,
    # get_embedding_service и get_openai_service используются напрямую в get_orchestrator_di,
    # и они уже являются фабриками синглтонов, которые мы переопределяем ниже, если нужно.
    # Однако, лучше переопределять именно те placeholder DI функции, которые мы создали в routes.py
)

app.dependency_overrides[get_session_store_di] = get_session_store_override
app.dependency_overrides[get_export_service_di] = get_export_service_override
app.dependency_overrides[get_orchestrator_di] = get_orchestrator_override

# Для get_embedding_service и get_openai_service, которые являются фабриками в своих модулях
# и используются напрямую в get_orchestrator_di, мы также можем их переопределить,
# чтобы они возвращали экземпляры из app.state, обеспечивая строгий контроль над синглтонами из main.
# Это делает логику DI более централизованной.
app.dependency_overrides[get_embedding_service] = get_embedding_service_override
app.dependency_overrides[get_openai_service] = get_openai_service_override


# --- Подключение роутеров API --- 
app.include_router(api_router, prefix="/api")

# --- Эндпоинт для проверки здоровья --- 
@app.get("/health", tags=["System"])
async def health_check():
    """Проверяет работоспособность сервиса и доступность основных компонентов."""
    # Проверка доступности ключевых сервисов
    services_status = {
        "session_store_redis_connected": app.state.session_store.redis_client is not None and app.state.session_store.redis_client.ping() if hasattr(app.state, 'session_store') and hasattr(app.state.session_store, 'redis_client') else False,
        "embedding_service_ready": app.state.embedding_service.is_ready() if hasattr(app.state, 'embedding_service') else False,
        "openai_service_available": app.state.openai_service.is_available if hasattr(app.state, 'openai_service') else False
    }
    overall_status = "ok" if all(services_status.values()) else "degraded"
    if not services_status["embedding_service_ready"]:
        overall_status = "error_embedding_model_not_loaded"

    return {
        "status": overall_status,
        "app_name": settings.APP_NAME,
        "version": app.version,
        "services": services_status
    }

# --- Запуск Uvicorn сервера --- 
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_new:app", 
        host=settings.HOST, 
        port=settings.PORT, 
        reload=settings.DEBUG, 
        log_level=log_level_from_settings.lower()
    )

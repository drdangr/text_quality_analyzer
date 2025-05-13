from fastapi import APIRouter, Depends, HTTPException, Query, Body # Добавил Body
from fastapi.responses import FileResponse # Для экспорта
from typing import Optional, Any # Добавил Any
import logging

# Модели Pydantic для запросов и ответов
from api.models import (
    TextAnalysisRequest,
    ParagraphUpdateRequest,
    ParagraphData,
    AnalysisResponse,
    # ExportRequest # Пока не используем, экспорт через GET
)

# Оркестратор и сервисы через DI
from api.orchestrator import AnalysisOrchestrator
from services.session_store import SessionStore
from services.embedding_service import EmbeddingService, get_embedding_service # get_... для DI
from services.openai_service import OpenAIService, get_openai_service # get_... для DI
from services.export_service import ExportService

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Analysis"], # Тег для группировки в Swagger/OpenAPI
    # prefix="/api" # Префикс /api будет добавлен при подключении роутера в main_new.py
)

# --- Зависимости для FastAPI --- 
# Теперь эти функции будут просто типизированными заглушками, 
# а реальные экземпляры будут предоставлены через app.dependency_overrides в main_new.py
# Это делает DI более явным и управляемым из main.

async def get_session_store_di() -> SessionStore:
    # Эта функция будет переопределена в main_new.py
    # чтобы возвращать app.state.session_store
    raise NotImplementedError("This dependency should be overridden in main_new.py")

async def get_export_service_di(
    session_store: SessionStore = Depends(get_session_store_di)
) -> ExportService:
    # Эта функция будет переопределена в main_new.py
    # чтобы возвращать app.state.export_service
    raise NotImplementedError("This dependency should be overridden in main_new.py")

async def get_orchestrator_di(
    session_store: SessionStore = Depends(get_session_store_di),
    embedding_service: EmbeddingService = Depends(get_embedding_service), # Используем существующую фабрику
    openai_service: OpenAIService = Depends(get_openai_service)       # Используем существующую фабрику
) -> AnalysisOrchestrator:
    # Эта функция будет переопределена в main_new.py
    # чтобы возвращать app.state.orchestrator
    raise NotImplementedError("This dependency should be overridden in main_new.py")

# --- API Эндпоинты --- 

@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_text_endpoint(
    request_data: TextAnalysisRequest = Body(...),
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator_di) # Используем новую DI функцию
) -> AnalysisResponse:
    """
    Выполняет полный анализ предоставленного текста.
    
    - **text**: Полный текст для анализа.
    - **topic**: Тема, относительно которой будет оцениваться сигнальность и релевантность.
    - **session_id** (опционально): Если предоставлен, анализ будет сохранен или перезаписан 
      под этим ID. Если не предоставлен, будет сгенерирован новый ID сессии.
    """
    logger.info(f"--- ENTERING /api/analyze endpoint ---")
    logger.info(f"API /analyze вызван. Session ID: {request_data.session_id or 'New'}, Topic: '{request_data.topic[:30]}...'")
    try:
        result = await orchestrator.analyze_full_text(
            text_content=request_data.text, 
            topic=request_data.topic, 
            session_id=request_data.session_id
        )
        return result
    except Exception as e:
        logger.error(f"Критическая ошибка в эндпоинте /analyze: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

@router.post("/update-paragraph", response_model=ParagraphData)
async def update_paragraph_endpoint(
    request_data: ParagraphUpdateRequest = Body(...),
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator_di) # Используем новую DI функцию
) -> ParagraphData:
    """
    Обновляет текст одного абзаца в существующей сессии анализа и инкрементально 
    пересчитывает его метрики.
    
    - **session_id**: ID активной сессии анализа.
    - **paragraph_id**: Индекс (ID) абзаца, который нужно обновить.
    - **text**: Новый текст для абзаца.
    """
    logger.info(f"API /update-paragraph вызван. Session ID: {request_data.session_id}, Paragraph ID: {request_data.paragraph_id}")
    try:
        updated_paragraph_data = await orchestrator.analyze_incremental(
            session_id=request_data.session_id, 
            paragraph_id=request_data.paragraph_id, 
            new_text=request_data.text
        )
        if updated_paragraph_data is None:
            logger.warning(f"Анализ для сессии {request_data.session_id} или параграф {request_data.paragraph_id} не найден.")
            raise HTTPException(status_code=404, detail="Analysis session or paragraph not found, or update failed.")
        return ParagraphData(**updated_paragraph_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Критическая ошибка в эндпоинте /update-paragraph: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error during paragraph update: {e}")

@router.get("/analysis/{session_id}", response_model=AnalysisResponse)
async def get_analysis_endpoint(
    session_id: str,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator_di) # Используем новую DI функцию
) -> AnalysisResponse:
    """
    Получает сохраненные результаты полного анализа по его `session_id`.
    """
    logger.info(f"API /analysis/{session_id} вызван.")
    try:
        analysis_result = await orchestrator.get_cached_analysis(session_id)
        if analysis_result is None:
            logger.warning(f"Анализ для сессии {session_id} не найден в кэше.")
            raise HTTPException(status_code=404, detail=f"Analysis for session_id '{session_id}' not found.")
        return analysis_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Критическая ошибка в эндпоинте /analysis/{session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error retrieving analysis: {e}")

@router.post("/analysis/{session_id}/refresh-semantics", response_model=AnalysisResponse, summary="Обновить семантический анализ для сессии")
async def refresh_semantic_analysis_endpoint(
    session_id: str,
    orchestrator: AnalysisOrchestrator = Depends(get_orchestrator_di)
) -> AnalysisResponse:
    """
    Пересчитывает семантический анализ для всех абзацев в указанной сессии, 
    используя текущий текст абзацев (включая все предыдущие редактирования).
    Другие метрики (читаемость, сигнальность) НЕ пересчитываются этим эндпоинтом.
    Возвращает полный обновленный результат анализа для сессии.
    """
    logger.info(f"API /analysis/{session_id}/refresh-semantics вызван.")
    try:
        updated_analysis_result = await orchestrator.refresh_full_semantic_analysis(session_id)
        if updated_analysis_result is None:
            logger.warning(f"Не удалось обновить семантику для сессии {session_id} (сессия не найдена или произошла ошибка в оркестраторе).")
            raise HTTPException(status_code=404, detail=f"Failed to refresh semantics for session_id '{session_id}'. Session not found or error during refresh.")
        return updated_analysis_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Критическая ошибка в эндпоинте /analysis/{session_id}/refresh-semantics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error during semantic refresh: {e}")

@router.get("/export/{session_id}") # response_model здесь не нужен, т.к. возвращаем FileResponse
async def export_analysis_endpoint(
    session_id: str,
    file_format: str = Query("csv", regex="^(csv|json)$"), # regex для валидации формата
    export_service: ExportService = Depends(get_export_service_di) # Используем новую DI функцию
) -> FileResponse:
    """
    Экспортирует результаты анализа для указанной `session_id` в заданном формате (csv или json).
    """
    logger.info(f"API /export/{session_id} вызван. Формат: {file_format}")
    try:
        file_path = await export_service.export_analysis(session_id, file_format)
        if file_path is None:
            logger.warning(f"Не удалось создать файл экспорта для сессии {session_id}, формат {file_format}. Возможно, сессия не найдена.")
            raise HTTPException(status_code=404, detail=f"Could not export analysis for session_id '{session_id}'. Session not found or export failed.")
        
        # Определяем media_type на основе формата
        media_type = "text/csv" if file_format == "csv" else "application/json"
        # Формируем имя файла для скачивания
        download_filename = f"analysis_results_{session_id}.{file_format}"
        
        return FileResponse(
            path=file_path, 
            media_type=media_type,
            filename=download_filename
        )
    except HTTPException: # Пробрасываем HTTPException дальше
        raise
    except Exception as e:
        logger.error(f"Критическая ошибка в эндпоинте /export/{session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error during export: {e}")

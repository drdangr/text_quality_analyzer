import asyncio
import pandas as pd # type: ignore
import numpy as np # Добавляем импорт numpy
from typing import Dict, List, Optional, Any # Добавил Any
import datetime
import uuid
import logging
import concurrent.futures # Для ThreadPoolExecutor
import re

# Импортируем адаптированные модули анализа
from analysis import readability
# EmbeddingService будет предоставлен через DI, его методы вызываются напрямую
# from services.embedding_service import EmbeddingService 
from analysis import semantic_function # Импортируем сам модуль

# Импортируем сервисы для DI
from services.session_store import SessionStore
from services.embedding_service import EmbeddingService # Для type hinting и DI
from services.openai_service import OpenAIService # Для type hinting и DI

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

class AnalysisOrchestrator:
    """Оркестратор для координации всех видов текстового анализа."""
    def __init__(self,
                 session_store: SessionStore,
                 embedding_service: EmbeddingService,
                 openai_service: OpenAIService):
        """
        Инициализирует оркестратор с необходимыми сервисами.
        """
        self.session_store = session_store
        self.embedding_service = embedding_service
        self.openai_service = openai_service
        logger.info("AnalysisOrchestrator инициализирован.")

    async def _run_readability_async(self, df: pd.DataFrame) -> pd.DataFrame:
        """Запускает анализ читаемости в отдельном потоке (т.к. readability синхронный)."""
        logger.debug("Запуск _run_readability_async...")
        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            result_df = await loop.run_in_executor(
                executor,
                readability.analyze_readability_batch, # Передаем функцию
                df # df будет скопирован перед вызовом этой функции
            )
        logger.debug("_run_readability_async завершен.")
        return result_df

    async def _run_signal_strength_async(self, df: pd.DataFrame, topic: str) -> pd.DataFrame:
        """Запускает анализ сигнальности (уже асинхронный в EmbeddingService)."""
        logger.debug("Запуск _run_signal_strength_async...")
        # df будет скопирован перед вызовом этой функции
        result_df = await self.embedding_service.analyze_signal_strength_async(df, topic)
        logger.debug("_run_signal_strength_async завершен.")
        return result_df

    async def _run_semantic_function_async(self, df: pd.DataFrame, topic: str) -> pd.DataFrame:
        """Запускает анализ семантической функции (адаптированный semantic_function.py должен быть асинхронным)."""
        logger.debug("Запуск _run_semantic_function_async...")
        # df будет скопирован перед вызовом этой функции
        result_df = await semantic_function.analyze_semantic_function_batch(
            df, topic, self.openai_service
        )
        logger.debug("_run_semantic_function_async завершен.")
        return result_df

    async def _run_analysis_pipeline(self, paragraphs: List[str], topic: str) -> pd.DataFrame:
        """
        Запускает полный конвейер анализа для списка абзацев.
        Создает DataFrame и параллельно выполняет все виды анализа.
        """
        logger.info(f"Запуск полного конвейера анализа для {len(paragraphs)} абзацев, тема: '{topic[:30]}...'")
        # 1. Создаем DataFrame из абзацев
        if not paragraphs:
            logger.warning("Конвейер анализа получил пустой список абзацев.")
            # Возвращаем пустой DataFrame с ожидаемыми колонками для консистентности
            return pd.DataFrame(columns=['paragraph_id', 'text', 'lix', 'smog', 'complexity', 'signal_strength', 'semantic_function', 'semantic_method', 'semantic_error'])

        base_df = pd.DataFrame({
            'paragraph_id': range(len(paragraphs)),
            'text': paragraphs
        })
        
        # 2. Запускаем модули анализа параллельно
        # Копируем DataFrame для каждого модуля, чтобы избежать модификации оригинала
        # и проблем с конкурентным доступом, если бы модули не были потокобезопасными.
        # (Хотя сейчас мы адаптировали их, чтобы они работали с копиями или возвращали новые DF)
        task_readability = self._run_readability_async(base_df.copy())
        task_signal = self._run_signal_strength_async(base_df.copy(), topic)
        task_semantic = self._run_semantic_function_async(base_df.copy(), topic)

        # 3. Ожидаем завершения всех задач
        logger.debug("Ожидание результатов от всех модулей анализа...")
        results = await asyncio.gather(task_readability, task_signal, task_semantic, return_exceptions=True)
        logger.debug("Все модули анализа завершили работу.")

        # 4. Объединяем результаты
        # Начинаем с исходного base_df, чтобы сохранить paragraph_id и text
        final_df = base_df.copy()
        module_names = ["Readability", "SignalStrength", "SemanticFunction"]

        for i, result_or_exc in enumerate(results):
            module_name = module_names[i]
            if isinstance(result_or_exc, Exception):
                logger.error(f"Ошибка в модуле '{module_name}' во время конвейера: {result_or_exc}", exc_info=result_or_exc)
                # Если модуль упал, соответствующие колонки не будут добавлены или останутся пустыми/NA,
                # что должно корректно обрабатываться в _format_analysis_result
            elif isinstance(result_or_exc, pd.DataFrame):
                logger.debug(f"Получены результаты от модуля {module_name}. Колонки: {result_or_exc.columns.tolist()}")
                # Объединяем, используя paragraph_id как ключ, если он есть и совпадает.
                # Более простой подход - просто скопировать колонки с метриками, предполагая, что порядок строк сохранен.
                # Убедимся, что result_or_exc имеет те же индексы, что и final_df (или base_df)
                # Наши адаптированные функции должны это гарантировать.
                metrics_cols = [col for col in result_or_exc.columns if col not in ['paragraph_id', 'text']]
                for col in metrics_cols:
                    if col in result_or_exc:
                        final_df[col] = result_or_exc[col]
            else:
                logger.error(f"Модуль '{module_name}' вернул неожиданный тип результата: {type(result_or_exc)}")
        
        logger.info("Полный конвейер анализа завершен.")
        return final_df

    async def analyze_full_text(self, text_content: str, topic: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Выполняет полный анализ текста: разбивает на абзацы, запускает все анализы, сохраняет и форматирует результат.
        """
        if not session_id:
            session_id = str(uuid.uuid4())
            logger.info(f"Новая сессия анализа создана: {session_id}")
        else:
            logger.info(f"Используется существующая сессия анализа: {session_id}")

        logger.info(f"--- ORCHESTRATOR ACTUAL SESSION ID: {session_id} ---")

        from utils.text_processing import split_into_paragraphs # Локальный импорт, чтобы избежать проблем при импорте модуля
        paragraphs = split_into_paragraphs(text_content)
        
        if not paragraphs:
            logger.warning(f"Для сессии {session_id} не найдено абзацев в тексте. Возвращается пустой результат.")
            # Создаем пустой DataFrame с нужными колонками, чтобы _format_analysis_result не упал
            empty_df = pd.DataFrame(columns=['paragraph_id', 'text', 'lix', 'smog', 'complexity', 'signal_strength', 'semantic_function', 'semantic_method', 'semantic_error'])
            return self._format_analysis_result(empty_df, topic, session_id)

        analyzed_df = await self._run_analysis_pipeline(paragraphs, topic)
        self.session_store.save_analysis(session_id, analyzed_df, topic)
        return self._format_analysis_result(analyzed_df, topic, session_id)

    async def analyze_incremental(self, session_id: str, paragraph_id: int, new_text: str) -> Optional[Dict[str, Any]]:
        """
        Обновляет анализ для одного измененного абзаца.
        """
        logger.info(f"Инкрементальное обновление для сессии {session_id}, параграф ID: {paragraph_id}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"Сессия {session_id} не найдена для инкрементального обновления.")
            return None
            
        df = analysis_data["df"]
        topic = analysis_data["topic"]

        if not (0 <= paragraph_id < len(df)):
            logger.error(f"Неверный ID параграфа {paragraph_id} для сессии {session_id} (всего {len(df)} параграфов).")
            return None # Или выбросить HTTPException в роутере
            
        df.loc[paragraph_id, 'text'] = new_text
        paragraph_df_slice = df.iloc[[paragraph_id]].copy() # DataFrame с одной строкой для анализа

        # 1. Readability (синхронная, запускаем в executor)
        logger.debug(f"Инкрементальный анализ читаемости для параграфа {paragraph_id}...")
        updated_readability_df = await self._run_readability_async(paragraph_df_slice) # Используем _run_readability_async
        if not updated_readability_df.empty:
            for col in ['lix', 'smog', 'complexity']:
                if col in updated_readability_df:
                    df.loc[paragraph_id, col] = updated_readability_df.iloc[0][col]
        
        # 2. Signal Strength (асинхронная)
        logger.debug(f"Инкрементальный анализ сигнальности для параграфа {paragraph_id}...")
        # analyze_signal_strength_incremental ожидает полный DataFrame и список измененных индексов
        # Это более эффективно, чем передавать слайс и потом объединять.
        df = self.embedding_service.analyze_signal_strength_incremental(df, topic, [paragraph_id])
        
        # 3. Semantic Function (асинхронная, с флагом single_paragraph)
        logger.debug(f"Инкрементальный семантический анализ для параграфа {paragraph_id}...")
        updated_semantic_df = await semantic_function.analyze_semantic_function_batch(
            paragraph_df_slice, topic, self.openai_service, single_paragraph=True
        )
        if not updated_semantic_df.empty:
            for col in ['semantic_function', 'semantic_method', 'semantic_error']:
                if col in updated_semantic_df:
                    df.loc[paragraph_id, col] = updated_semantic_df.iloc[0][col]

        self.session_store.save_analysis(session_id, df, topic)
        # Возвращаем данные только для обновленного абзаца
        return self._format_paragraph_data(df.loc[paragraph_id].copy()) # Передаем копию Series

    async def get_cached_analysis(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Получает сохраненные результаты анализа из хранилища сессий."""
        logger.info(f"Запрос на получение кэшированного анализа для сессии {session_id}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"Кэшированный анализ для сессии {session_id} не найден.")
            return None
        return self._format_analysis_result(analysis_data["df"], analysis_data["topic"], session_id)

    async def refresh_full_semantic_analysis(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Пересчитывает семантический анализ для всех абзацев существующей сессии.
        Метрики читаемости и сигнальности НЕ пересчитываются.
        """
        logger.info(f"[Orchestrator] Запрос на полное обновление семантики для сессии {session_id}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для обновления семантики.")
            return None
            
        current_df = analysis_data["df"]
        topic = analysis_data["topic"]

        if current_df.empty:
            logger.info(f"[Orchestrator] DataFrame для сессии {session_id} пуст. Обновление семантики не требуется.")
            # Возвращаем текущие данные, так как нечего анализировать
            return self._format_analysis_result(current_df, topic, session_id)

        # Запускаем только семантический анализ для всех абзацев
        # Функция analyze_semantic_function_batch должна вернуть DataFrame
        # с теми же индексами, что и current_df, но с обновленными семантическими колонками.
        logger.debug(f"[Orchestrator] Вызов _run_semantic_function_async для сессии {session_id} ({len(current_df)} абзацев)")
        
        # Важно: semantic_function.analyze_semantic_function_batch ожидает DataFrame с колонкой 'text'.
        # Мы передаем current_df.copy(), чтобы избежать неожиданных модификаций оригинала,
        # хотя наша текущая реализация semantic_function сама делает .copy().
        semantic_results_df = await self._run_semantic_function_async(current_df.copy(), topic)
        # _run_semantic_function_async уже содержит вызов semantic_function.analyze_semantic_function_batch
        # и он должен вернуть DataFrame с обновленными колонками `semantic_function`, `semantic_method`, `semantic_error`
        # и теми же индексами, что и current_df.

        if semantic_results_df is not None and not semantic_results_df.empty:
            # Обновляем только семантические колонки в основном DataFrame сессии
            cols_to_update = ['semantic_function', 'semantic_method', 'semantic_error']
            for col in cols_to_update:
                if col in semantic_results_df:
                    current_df[col] = semantic_results_df[col]
                else:
                    # Если колонка отсутствует в результатах (маловероятно для корректной работы semantic_function),
                    # можно ее инициализировать с NA или оставить как есть.
                    logger.warning(f"[Orchestrator] Колонка '{col}' отсутствует в результатах семантического анализа для сессии {session_id}.")
                    current_df[col] = None # или pd.NA, в зависимости от желаемого поведения
            
            self.session_store.save_analysis(session_id, current_df, topic)
            logger.info(f"[Orchestrator] Семантика для сессии {session_id} успешно обновлена и сохранена.")
            return self._format_analysis_result(current_df, topic, session_id)
        else:
            logger.error(f"[Orchestrator] Модуль семантического анализа не вернул результатов для сессии {session_id}. Сессия не обновлена.")
            # Возвращаем старые данные или None/ошибку?
            # Пока вернем старые данные, но с логом об ошибке обновления.
            return self._format_analysis_result(current_df, topic, session_id) # Возвращаем то, что было

    def _format_analysis_result(self, df: pd.DataFrame, topic: str, session_id: str) -> Dict[str, Any]:
        """Форматирует полный результат анализа для API-ответа."""
        avg_complexity_val = df['complexity'].mean() if 'complexity' in df.columns and not df['complexity'].empty else None
        avg_signal_strength_val = df['signal_strength'].mean() if 'signal_strength' in df.columns and not df['signal_strength'].empty else None
        
        # Определяем статус семантического анализа для метаданных
        semantic_available = self.openai_service.is_available
        semantic_status = "unavailable"
        if semantic_available and 'semantic_function' in df.columns:
            if "unavailable_api" in df['semantic_function'].unique(): # Проверяем, не было ли отказа из-за недоступности API
                semantic_status = "unavailable"
            elif df['semantic_function'].isnull().all() or (df['semantic_function'] == "error_api_call").all():
                 semantic_status = "error" # Если все ошибки или все null
            elif (df['semantic_function'] == "unavailable_api").any():
                 semantic_status = "partial_error" # Если часть недоступна, а часть, возможно, ОК
            elif df['semantic_error'].notna().any():
                 semantic_status = "partial_error" # Есть ошибки на уровне параграфов
            else:
                semantic_status = "complete"
        elif not semantic_available:
            semantic_status = "unavailable_service"

        metadata = {
            'session_id': session_id,
            'topic': topic,
            'analysis_timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'paragraph_count': len(df),
            'avg_complexity': round(avg_complexity_val, 3) if pd.notna(avg_complexity_val) else None,
            'avg_signal_strength': round(avg_signal_strength_val, 3) if pd.notna(avg_signal_strength_val) else None,
            'semantic_analysis_available': semantic_available,
            'semantic_analysis_status': semantic_status
        }
        paragraphs_data = [self._format_paragraph_data(row) for _, row in df.iterrows()]
        return {'metadata': metadata, 'paragraphs': paragraphs_data}

    def _format_paragraph_data(self, row: pd.Series) -> Dict[str, Any]:
        """Форматирует данные одного абзаца для API-ответа."""
        metrics_dict: Dict[str, Any] = {}
        # Определяем ожидаемые колонки метрик, чтобы корректно обработать их отсутствие
        expected_metric_cols = ['lix', 'smog', 'complexity', 'signal_strength', 'semantic_function', 'semantic_method', 'semantic_error']
        for col_name in expected_metric_cols:
            if col_name in row.index:
                value = row[col_name]
                if pd.isna(value):
                    metrics_dict[col_name] = None
                # Проверяем на специфические типы numpy перед item(), чтобы избежать AttributeError на стандартных типах
                elif isinstance(value, (np.generic, pd.Timestamp)):
                    metrics_dict[col_name] = value.item() if hasattr(value, 'item') else value
                else:
                    metrics_dict[col_name] = value
            else:
                metrics_dict[col_name] = None # Если колонки нет, ставим None
        
        return {
            'id': row['paragraph_id'].item() if hasattr(row['paragraph_id'], 'item') else row['paragraph_id'],
            'text': row['text'],
            'metrics': metrics_dict
        }

    async def merge_paragraphs(self, session_id: str, paragraph_id_1: int, paragraph_id_2: int) -> Optional[Dict[str, Any]]:
        """
        Объединяет два абзаца в один, пересчитывает метрики и возвращает обновлённую сессию.
        """
        logger.info(f"[Orchestrator] merge_paragraphs: session_id={session_id}, paragraph_id_1={paragraph_id_1}, paragraph_id_2={paragraph_id_2}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для слияния абзацев.")
            return None
        df = analysis_data["df"]
        topic = analysis_data["topic"]

        # Проверяем, что оба абзаца существуют
        if not (0 <= paragraph_id_1 < len(df)) or not (0 <= paragraph_id_2 < len(df)):
            logger.error(f"[Orchestrator] Один из абзацев не найден: {paragraph_id_1}, {paragraph_id_2}")
            return None

        # Определяем порядок (на всякий случай)
        idx1, idx2 = sorted([paragraph_id_1, paragraph_id_2])
        text1 = str(df.loc[idx1, 'text'])
        text2 = str(df.loc[idx2, 'text'])
        merged_text = (text1.rstrip() + '\n' + text2.lstrip()).replace('\n\n', '\n').strip()

        # Удаляем оба абзаца
        df = df.drop([idx1, idx2]).reset_index(drop=True)
        # Вставляем новый абзац на место первого
        new_row = pd.DataFrame({
            'paragraph_id': [idx1],
            'text': [merged_text]
        })
        df = pd.concat([df.iloc[:idx1], new_row, df.iloc[idx1:]], ignore_index=True)
        # Перенумеровываем paragraph_id
        df['paragraph_id'] = range(len(df))

        # Пересчитываем метрики только для нового абзаца
        new_df = await self._run_analysis_pipeline([merged_text], topic)
        for col in ['lix', 'smog', 'complexity', 'signal_strength', 'semantic_function', 'semantic_method', 'semantic_error']:
            if col in new_df.columns:
                df.loc[idx1, col] = new_df.iloc[0][col]

        self.session_store.save_analysis(session_id, df, topic)
        logger.info(f"[Orchestrator] Абзацы {paragraph_id_1} и {paragraph_id_2} объединены в сессии {session_id}.")
        return self._format_analysis_result(df, topic, session_id)

    async def split_paragraph(self, session_id: str, paragraph_id: int, split_position: int) -> Optional[Dict[str, Any]]:
        """
        Разделяет абзац на два по указанной позиции, пересчитывает метрики и возвращает обновленную сессию.
        """
        logger.info(f"[Orchestrator] split_paragraph: session_id={session_id}, paragraph_id={paragraph_id}, split_position={split_position}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для разделения абзаца.")
            return None
        df = analysis_data["df"]
        topic = analysis_data["topic"]

        # Проверяем, что абзац существует
        if not (0 <= paragraph_id < len(df)):
            logger.error(f"[Orchestrator] Абзац с ID {paragraph_id} не найден в сессии {session_id}")
            return None
        
        original_text = str(df.loc[paragraph_id, 'text'])
        
        # Проверяем, что позиция разделения валидна
        if not (0 < split_position < len(original_text)):
            logger.error(f"[Orchestrator] Невалидная позиция разделения: {split_position} для абзаца длиной {len(original_text)}")
            return None

        # Разделяем текст на два абзаца
        text_first = original_text[:split_position].rstrip()
        text_second = original_text[split_position:].lstrip()
        
        # Удаляем оригинальный абзац
        df = df.drop([paragraph_id]).reset_index(drop=True)
        
        # Вставляем два новых абзаца на место оригинального
        new_rows = pd.DataFrame({
            'paragraph_id': [paragraph_id, paragraph_id + 0.5],  # Временные ID, будут перенумерованы
            'text': [text_first, text_second]
        })
        df = pd.concat([df.iloc[:paragraph_id], new_rows, df.iloc[paragraph_id:]], ignore_index=True)
        
        # Перенумеровываем paragraph_id
        df['paragraph_id'] = range(len(df))
        
        # Пересчитываем метрики для новых абзацев
        new_df = await self._run_analysis_pipeline([text_first, text_second], topic)
        
        # Обновляем метрики для новых абзацев
        for idx, orig_idx in enumerate([paragraph_id, paragraph_id + 1]):
            for col in ['lix', 'smog', 'complexity', 'signal_strength', 'semantic_function', 'semantic_method', 'semantic_error']:
                if col in new_df.columns:
                    df.loc[orig_idx, col] = new_df.iloc[idx][col]

        self.session_store.save_analysis(session_id, df, topic)
        logger.info(f"[Orchestrator] Абзац {paragraph_id} разделен на два в сессии {session_id}.")
        return self._format_analysis_result(df, topic, session_id)

    async def reorder_paragraphs(self, session_id: str, new_order: List[int]) -> Optional[Dict[str, Any]]:
        """
        Изменяет порядок абзацев в соответствии с предоставленным списком.
        
        Args:
            session_id: Идентификатор сессии
            new_order: Новый порядок абзацев (список ID абзацев в новом порядке)
            
        Returns:
            Обновленный результат анализа или None, если произошла ошибка
        """
        logger.info(f"[Orchestrator] reorder_paragraphs: session_id={session_id}, new_order={new_order}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для изменения порядка абзацев.")
            return None
        
        df = analysis_data["df"]
        topic = analysis_data["topic"]
        
        # Проверяем, что новый порядок содержит все ID абзацев
        current_ids = df['paragraph_id'].tolist()
        if set(current_ids) != set(new_order):
            logger.warning(f"[Orchestrator] Некорректный новый порядок. Текущие ID: {current_ids}, Новый порядок: {new_order}")
            return None
        
        # Создаем новый DataFrame с переупорядоченными строками
        new_df = df.set_index('paragraph_id').loc[new_order].reset_index()
        
        # Обновляем paragraph_id в соответствии с новым порядком
        new_df['paragraph_id'] = range(len(new_df))
        
        # Сбрасываем семантический анализ, так как порядок абзацев может влиять на контекст
        if 'semantic_function' in new_df.columns:
            new_df['semantic_function'] = None
        if 'semantic_method' in new_df.columns:
            new_df['semantic_method'] = None
        if 'semantic_error' in new_df.columns:
            new_df['semantic_error'] = None
        
        # Сохраняем обновленные данные анализа
        self.session_store.save_analysis(session_id, new_df, topic)
        logger.info(f"[Orchestrator] Порядок абзацев изменен в сессии {session_id}.")
        
        # Возвращаем обновленный результат анализа
        return self._format_analysis_result(new_df, topic, session_id)

    async def update_topic(self, session_id: str, new_topic: str) -> Optional[Dict[str, Any]]:
        """
        Обновляет тему анализа для указанной сессии и пересчитывает зависящие от темы метрики.
        
        Args:
            session_id: Идентификатор сессии
            new_topic: Новая тема анализа
            
        Returns:
            Обновленный результат анализа или None, если произошла ошибка
        """
        logger.info(f"[Orchestrator] update_topic: session_id={session_id}, new_topic={new_topic}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для обновления темы.")
            return None
        
        df = analysis_data["df"]
        
        # Обновляем тему в анализе
        self.session_store.save_analysis(session_id, df, new_topic)
        
        # Пересчитываем метрики сигнала/шума
        df = await self._run_signal_strength_async(df.copy(), new_topic)
        
        # Пересчитываем семантический анализ
        semantic_results_df = await self._run_semantic_function_async(df.copy(), new_topic)
        if semantic_results_df is not None and not semantic_results_df.empty:
            cols_to_update = ['semantic_function', 'semantic_method', 'semantic_error']
            for col in cols_to_update:
                if col in semantic_results_df:
                    df[col] = semantic_results_df[col]
        
        # Сохраняем обновленные данные
        self.session_store.save_analysis(session_id, df, new_topic)
        logger.info(f"[Orchestrator] Тема и метрики успешно обновлены в сессии {session_id}.")
        
        # Возвращаем обновленный результат анализа
        return self._format_analysis_result(df, new_topic, session_id)

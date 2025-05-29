import asyncio
import pandas as pd # type: ignore
import numpy as np # Добавляем импорт numpy
from typing import Dict, List, Optional, Any # Добавил Any
import datetime
import uuid
import logging
import concurrent.futures # Для ThreadPoolExecutor
import re
from fastapi import HTTPException # <--- Добавляем импорт HTTPException

from utils.text_processing import split_into_paragraphs # <--- Перемещаем импорт сюда

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
        # split_into_paragraphs теперь импортируется в начале файла
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
        ВАЖНО: НЕ обновляет текст в сессии, только рассчитывает метрики для переданного текста.
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
            
        # НЕ обновляем текст в сессии! Создаем временный DataFrame для анализа
        temp_df = df.copy()
        temp_df.loc[paragraph_id, 'text'] = new_text
        paragraph_df_slice = temp_df.iloc[[paragraph_id]].copy() # DataFrame с одной строкой для анализа

        # 1. Readability (синхронная, запускаем в executor)
        logger.debug(f"Инкрементальный анализ читаемости для параграфа {paragraph_id}...")
        updated_readability_df = await self._run_readability_async(paragraph_df_slice) # Используем _run_readability_async
        
        # 2. Signal Strength (асинхронная)
        logger.debug(f"Инкрементальный анализ сигнальности для параграфа {paragraph_id}...")
        # analyze_signal_strength_incremental ожидает полный DataFrame и список измененных индексов
        # Это более эффективно, чем передавать слайс и потом объединять.
        temp_df = self.embedding_service.analyze_signal_strength_incremental(temp_df, topic, [paragraph_id])
        
        # 3. Semantic Function (асинхронная, с флагом single_paragraph)
        logger.debug(f"Инкрементальный семантический анализ для параграфа {paragraph_id}...")
        updated_semantic_df = await semantic_function.analyze_semantic_function_batch(
            paragraph_df_slice, topic, self.openai_service, single_paragraph=True
        )
        
        # Собираем метрики из результатов анализа (НЕ сохраняем в сессию!)
        metrics = {}
        
        # Readability метрики
        if not updated_readability_df.empty:
            for col in ['lix', 'smog', 'complexity']:
                if col in updated_readability_df:
                    value = updated_readability_df.iloc[0][col]
                    if pd.isna(value):
                        metrics[col] = None
                    elif isinstance(value, (np.generic, pd.Timestamp)):
                        metrics[col] = value.item() if hasattr(value, 'item') else value
                    else:
                        metrics[col] = value
        
        # Signal strength метрики
        if paragraph_id < len(temp_df):
            signal_value = temp_df.loc[paragraph_id, 'signal_strength'] if 'signal_strength' in temp_df.columns else None
            if pd.isna(signal_value):
                metrics['signal_strength'] = None
            elif isinstance(signal_value, (np.generic, pd.Timestamp)):
                metrics['signal_strength'] = signal_value.item() if hasattr(signal_value, 'item') else signal_value
            else:
                metrics['signal_strength'] = signal_value
        
        # Semantic метрики
        if not updated_semantic_df.empty:
            for col in ['semantic_function', 'semantic_method', 'semantic_error']:
                if col in updated_semantic_df:
                    value = updated_semantic_df.iloc[0][col]
                    if pd.isna(value):
                        metrics[col] = None
                    elif isinstance(value, (np.generic, pd.Timestamp)):
                        metrics[col] = value.item() if hasattr(value, 'item') else value
                    else:
                        metrics[col] = value
        
        # Возвращаем ТОЛЬКО метрики (без текста!)
        logger.info(f"Инкрементальный анализ завершен для параграфа {paragraph_id}")
        return metrics

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

    async def delete_paragraph_from_session(self, session_id: str, paragraph_id_to_delete: int) -> Optional[Dict[str, Any]]:
        """
        Удаляет указанный абзац из сессии анализа и возвращает обновленную сессию.
        """
        logger.info(f"[Orchestrator] delete_paragraph_from_session: session_id={session_id}, paragraph_id_to_delete={paragraph_id_to_delete}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для удаления абзаца.")
            raise HTTPException(status_code=404, detail=f"Сессия {session_id} не найдена.")

        df = analysis_data["df"]
        topic = analysis_data["topic"]

        if paragraph_id_to_delete not in df['paragraph_id'].values:
            logger.warning(f"[Orchestrator] Абзац с ID {paragraph_id_to_delete} не найден в сессии {session_id}.")
            raise HTTPException(status_code=404, detail=f"Абзац {paragraph_id_to_delete} не найден в сессии {session_id}.")

        df = df[df['paragraph_id'] != paragraph_id_to_delete].copy()

        if not df.empty:
            df['paragraph_id'] = range(len(df))
        else:
            logger.info(f"[Orchestrator] Все абзацы удалены из сессии {session_id}.")

        if 'semantic_function' in df.columns:
            df['semantic_function'] = None
        if 'semantic_method' in df.columns:
            df['semantic_method'] = None
        if 'semantic_error' in df.columns:
            df['semantic_error'] = None
        
        self.session_store.save_analysis(session_id, df, topic)
        logger.info(f"[Orchestrator] Абзац {paragraph_id_to_delete} удален. В сессии {session_id} осталось {len(df)} абзацев.")

        return self._format_analysis_result(df, topic, session_id)

    async def update_text_and_restructure_paragraph(
        self, session_id: str, paragraph_id_to_process: int, full_new_text: str
    ) -> Dict[str, Any]:
        logger.info(f"[Orchestrator] update_text_and_restructure_paragraph: session_id={session_id}, paragraph_id={paragraph_id_to_process}")
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.error(f"[Orchestrator] Сессия {session_id} не найдена.")
            raise HTTPException(status_code=404, detail=f"Сессия {session_id} не найдена.")

        original_df = analysis_data["df"].copy()
        topic = analysis_data["topic"]
        
        # Проверяем, существует ли исходный абзац для обработки
        # DataFrame может быть пустым, или paragraph_id_to_process может быть некорректным
        # paragraph_id_to_process - это ID изначального абзаца, который редактировали
        # Мы должны найти его по этому ID в original_df.
        if not original_df[original_df['paragraph_id'] == paragraph_id_to_process].empty:
            original_paragraph_index = original_df[original_df['paragraph_id'] == paragraph_id_to_process].index[0]
        else:
            # Если исходный абзац не найден (например, если df пустой или ID неверный)
            # Это может случиться, если, например, пользователь пытается отредактировать только что удаленный абзац
            # или если ID был некорректен изначально.
            logger.warning(f"[Orchestrator] Исходный абзац с ID {paragraph_id_to_process} не найден в сессии {session_id} для обновления/разделения.")
            # В этом случае, возможно, стоит просто вернуть текущее состояние сессии без изменений или специфическую ошибку.
            # Однако, если full_new_text не пустой, это может означать попытку создать новый абзац, если предыдущий был удален.
            # Для текущей логики, если исходный абзац не найден, мы не можем продолжить операцию как "обновление".
            # Фронтенд должен управлять созданием новых абзацев через другие механизмы, если это требуется.
            raise HTTPException(status_code=404, detail=f"Редактируемый абзац с ID {paragraph_id_to_process} не найден.")

        trimmed_full_new_text = full_new_text.strip()

        if not trimmed_full_new_text: # Текст полностью удален пользователем
            logger.info(f"[Orchestrator] Текст для абзаца {paragraph_id_to_process} пуст. Удаление абзаца.")
            df_after_deletion = original_df[original_df['paragraph_id'] != paragraph_id_to_process].copy()
            if not df_after_deletion.empty:
                df_after_deletion['paragraph_id'] = range(len(df_after_deletion))
            
            # Сбрасываем семантику для всех оставшихся, так как контекст изменился
            for col in ['semantic_function', 'semantic_method', 'semantic_error']:
                if col in df_after_deletion.columns: df_after_deletion[col] = None
            
            self.session_store.save_analysis(session_id, df_after_deletion, topic)
            return self._format_analysis_result(df_after_deletion, topic, session_id)

        # Текст не пустой, обрабатываем разделение
        new_paragraph_texts = split_into_paragraphs(trimmed_full_new_text)
        
        # Сохраняем части DataFrame: до редактируемого абзаца, сам абзац, после него
        df_before_edited = original_df.iloc[:original_paragraph_index]
        # df_edited_row = original_df.iloc[[original_paragraph_index]].copy() # Пока не используем, создадим новые строки
        df_after_edited = original_df.iloc[original_paragraph_index + 1:]

        # Создаем DataFrame для новых (разделенных) текстов
        # Они получат временные ID, которые потом будут пересчитаны
        new_texts_df_data = []
        for i, text_part in enumerate(new_paragraph_texts):
            new_texts_df_data.append({
                'paragraph_id': original_paragraph_index + i, # Временный ID для сохранения порядка
                'text': text_part
            })
        new_paragraphs_interim_df = pd.DataFrame(new_texts_df_data)

        # Пересчитываем все метрики для этих новых текстов
        logger.debug(f"[Orchestrator] Пересчет метрик для {len(new_paragraph_texts)} новых/измененных абзацев.")
        reanalyzed_metrics_df = await self._run_analysis_pipeline(new_paragraph_texts, topic)
        # reanalyzed_metrics_df будет иметь 'paragraph_id' от 0 до N-1
        
        # Соединяем тексты из new_paragraphs_interim_df с их новыми метриками
        # Убедимся, что 'text' есть в reanalyzed_metrics_df для правильного merge или join
        if 'text' not in reanalyzed_metrics_df.columns and not new_paragraphs_interim_df.empty:
             # Если _run_analysis_pipeline не вернул 'text', добавим его из new_paragraph_texts
             reanalyzed_metrics_df['text'] = new_paragraph_texts 

        # Обновляем new_paragraphs_interim_df метриками из reanalyzed_metrics_df
        # Сбросим paragraph_id из reanalyzed_metrics_df, чтобы не было конфликта при join/merge
        # и будем использовать индексы для сопоставления
        reanalyzed_metrics_df = reanalyzed_metrics_df.reset_index(drop=True)
        new_paragraphs_interim_df = new_paragraphs_interim_df.reset_index(drop=True)
        
        # Добавляем все колонки метрик из reanalyzed_metrics_df в new_paragraphs_interim_df
        for col in reanalyzed_metrics_df.columns:
            if col != 'paragraph_id' and col != 'text': # Текст уже есть, paragraph_id временный
                 new_paragraphs_interim_df[col] = reanalyzed_metrics_df[col]
        if 'text' not in new_paragraphs_interim_df.columns and 'text' in reanalyzed_metrics_df.columns: # Если вдруг текста нет
             new_paragraphs_interim_df['text'] = reanalyzed_metrics_df['text']
 
        # Собираем финальный DataFrame
        final_df = pd.concat([df_before_edited, new_paragraphs_interim_df, df_after_edited]).reset_index(drop=True)
        
        # Финальная перенумерация paragraph_id
        if not final_df.empty:
            final_df['paragraph_id'] = range(len(final_df))
        
        # Сбрасываем семантику для ВСЕХ абзацев, так как структура изменилась
        # (даже для тех, что были в df_after_edited, их контекст изменился)
        logger.info("[Orchestrator] Сброс семантических меток для всех абзацев после обновления/разделения.")
        for col in ['semantic_function', 'semantic_method', 'semantic_error']:
            if col in final_df.columns: final_df[col] = None

        self.session_store.save_analysis(session_id, final_df, topic)
        logger.info(f"[Orchestrator] Абзац {paragraph_id_to_process} обновлен/разделен. Сессия {session_id} теперь содержит {len(final_df)} абзацев.")
        return self._format_analysis_result(final_df, topic, session_id)

    async def _run_fast_analysis_pipeline(self, paragraphs: List[str], topic: str) -> pd.DataFrame:
        """
        Запускает быстрый анализ без семантической функции (только readability + signal strength).
        Используется для debounced обновлений при редактировании.
        """
        logger.info(f"Запуск быстрого анализа для {len(paragraphs)} абзацев, тема: '{topic[:30]}...'")
        
        if not paragraphs:
            logger.warning("Быстрый анализ получил пустой список абзацев.")
            return pd.DataFrame(columns=['paragraph_id', 'text', 'lix', 'smog', 'complexity', 'signal_strength'])

        base_df = pd.DataFrame({
            'paragraph_id': range(len(paragraphs)),
            'text': paragraphs
        })
        
        # Запускаем только readability и signal strength (без семантики)
        task_readability = self._run_readability_async(base_df.copy())
        task_signal = self._run_signal_strength_async(base_df.copy(), topic)

        # Ожидаем завершения задач
        logger.debug("Ожидание результатов от быстрого анализа...")
        results = await asyncio.gather(task_readability, task_signal, return_exceptions=True)
        logger.debug("Быстрый анализ завершен.")

        # Объединяем результаты
        final_df = base_df.copy()
        module_names = ["Readability", "SignalStrength"]

        for i, result_or_exc in enumerate(results):
            module_name = module_names[i]
            if isinstance(result_or_exc, Exception):
                logger.error(f"Ошибка в модуле '{module_name}' во время быстрого анализа: {result_or_exc}", exc_info=result_or_exc)
            elif isinstance(result_or_exc, pd.DataFrame):
                logger.debug(f"Получены результаты от модуля {module_name}. Колонки: {result_or_exc.columns.tolist()}")
                metrics_cols = [col for col in result_or_exc.columns if col not in ['paragraph_id', 'text']]
                for col in metrics_cols:
                    if col in result_or_exc:
                        final_df[col] = result_or_exc[col]
        
        logger.info("Быстрый анализ завершен.")
        return final_df

    async def calculate_paragraph_metrics(self, session_id: str, paragraph_id: int, text: str) -> Optional[Dict[str, Any]]:
        """
        Рассчитывает метрики для одного абзаца без сохранения изменений.
        Используется для предварительного просмотра метрик при редактировании.
        БЫСТРЫЙ анализ без семантики для debounced обновлений.
        """
        logger.info(f"[Orchestrator] calculate_paragraph_metrics (быстрый): session_id={session_id}, paragraph_id={paragraph_id}")
        
        # Проверяем, что сессия существует
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для расчета метрик абзаца.")
            return None
        
        topic = analysis_data["topic"]
        
        try:
            # Запускаем БЫСТРЫЙ анализ для одного абзаца (без семантики)
            analyzed_df = await self._run_fast_analysis_pipeline([text], topic)
            
            if analyzed_df.empty:
                logger.warning(f"[Orchestrator] Быстрый анализ не вернул результатов для абзаца {paragraph_id}")
                return None
            
            # Форматируем результат как метрики
            row = analyzed_df.iloc[0]
            metrics = {}
            
            # Извлекаем метрики из результата анализа (без семантики)
            metric_cols = ['lix', 'smog', 'complexity', 'signal_strength']
            for col in metric_cols:
                if col in row.index:
                    value = row[col]
                    if pd.isna(value):
                        metrics[col] = None
                    elif isinstance(value, (np.generic, pd.Timestamp)):
                        metrics[col] = value.item() if hasattr(value, 'item') else value
                    else:
                        metrics[col] = value
                else:
                    metrics[col] = None
            
            # Семантические метрики оставляем пустыми для быстрого анализа
            metrics['semantic_function'] = None
            
            logger.info(f"[Orchestrator] Быстрые метрики рассчитаны для абзаца {paragraph_id}")
            return metrics
            
        except Exception as e:
            logger.error(f"[Orchestrator] Ошибка при быстром расчете метрик абзаца {paragraph_id}: {e}", exc_info=True)
            return None

    async def calculate_text_metrics(self, session_id: str, text: str) -> Optional[Dict[str, Any]]:
        """
        Рассчитывает метрики для всего текста без сохранения изменений.
        Используется для предварительного просмотра метрик при редактировании.
        """
        logger.info(f"[Orchestrator] calculate_text_metrics: session_id={session_id}")
        
        # Проверяем, что сессия существует
        analysis_data = self.session_store.get_analysis(session_id)
        if not analysis_data:
            logger.warning(f"[Orchestrator] Сессия {session_id} не найдена для расчета метрик текста.")
            return None
        
        topic = analysis_data["topic"]
        
        try:
            # Разбиваем текст на абзацы
            paragraphs = split_into_paragraphs(text)
            
            if not paragraphs:
                logger.warning(f"[Orchestrator] Текст не содержит абзацев для анализа")
                return None
            
            # Запускаем полный анализ
            analyzed_df = await self._run_analysis_pipeline(paragraphs, topic)
            
            # Форматируем результат как полный анализ
            return self._format_analysis_result(analyzed_df, topic, session_id)
            
        except Exception as e:
            logger.error(f"[Orchestrator] Ошибка при расчете метрик текста: {e}", exc_info=True)
            return None

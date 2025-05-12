from sentence_transformers import SentenceTransformer, util
import torch
import numpy as np
import logging
import pandas as pd
import hashlib
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time
from collections import OrderedDict
from typing import List, Optional, Dict, Union

# Настройка логирования - будем использовать существующую конфигурацию из main.py
# logging.basicConfig(
#     level=logging.INFO,
#     format=\'%(asctime)s - %(levelname)s - %(message)s\'
# )

# Реализация класса EmbeddingService
class EmbeddingService:
    """
    Сервис для управления эмбеддингами текста с поддержкой кэширования.
    Инкапсулирует модель и кэш, предоставляя методы для анализа текста.
    """
    
    def __init__(self, model_name: str = 'intfloat/multilingual-e5-large', 
                 cache_size: int = 1000, 
                 device: Optional[str] = None):
        """
        Инициализирует сервис эмбеддингов.
        
        Args:
            model_name: Название модели SentenceTransformer для загрузки
            cache_size: Максимальный размер LRU-кэша для эмбеддингов
            device: Устройство для вычислений ('cuda', 'cpu' или None для автоопределения)
        """
        self.model_name = model_name
        self.cache_size = cache_size
        
        # Определяем устройство
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        logging.info(f"Device set to use {self.device}") # Логируем устройство при инициализации сервиса
        
        # Инициализируем кэши
        self.topic_cache = {}  # Простой кэш для эмбеддингов тем (обычно немного)
        self.paragraph_cache = self._create_lru_cache(cache_size)
        
        # Загружаем модель
        self.model = self._initialize_model()
        
    def _create_lru_cache(self, capacity: int):
        """Создает LRU-кэш с заданной емкостью."""
        class LRUCache:
            def __init__(self, capacity):
                self.cache = OrderedDict()
                self.capacity = capacity
                
            def get(self, key):
                if key not in self.cache:
                    return None
                self.cache.move_to_end(key)
                return self.cache[key]
                
            def put(self, key, value):
                if key in self.cache:
                    self.cache.move_to_end(key)
                self.cache[key] = value
                if len(self.cache) > self.capacity:
                    self.cache.popitem(last=False)
                    
            def clear(self):
                self.cache.clear()
                
            def __len__(self):
                return len(self.cache)
                
            def __contains__(self, key):
                return key in self.cache
                
        return LRUCache(capacity)
        
    def _initialize_model(self):
        """Инициализирует модель SentenceTransformer."""
        try:
            if self.device == 'cuda':
                self._optimize_cuda_settings()
                
            model = SentenceTransformer(self.model_name, device=self.device)
            logging.info(f"Модель Signal Strength \'{self.model_name}\' загружена на {self.device}.") # Сообщение соответствует старому
            return model
        except Exception as e:
            logging.error(f"Ошибка загрузки модели SentenceTransformer \'{self.model_name}\': {e}", exc_info=True) # Сообщение соответствует старому
            raise # Пробрасываем исключение, чтобы сервис не создался без модели
            
    def _optimize_cuda_settings(self):
        """Оптимизирует настройки CUDA для лучшей производительности."""
        if torch.cuda.is_available():
            logging.info("Оптимизация настроек CUDA...")
            torch.backends.cudnn.benchmark = True
            torch.cuda.empty_cache()
            
            if hasattr(torch.backends.cudnn, 'allow_tf32'):
                torch.backends.cudnn.allow_tf32 = True
            if hasattr(torch.backends, 'cuda'):
                if hasattr(torch.backends.cuda, 'matmul'):
                    torch.backends.cuda.matmul.allow_tf32 = True
            # Добавим логирование информации о GPU, если нужно
            try:
                device_name = torch.cuda.get_device_name(0)
                memory_allocated = torch.cuda.memory_allocated(0) / (1024 ** 2)  # MB
                memory_reserved = torch.cuda.memory_reserved(0) / (1024 ** 2)  # MB
                logging.info(f"GPU: {device_name}")
                logging.info(f"Память GPU: выделено {memory_allocated:.2f} MB, зарезервировано {memory_reserved:.2f} MB")
            except Exception as e:
                logging.warning(f"Не удалось получить информацию о GPU: {e}")
                    
    def get_topic_embedding(self, topic_text: str):
        """
        Возвращает эмбеддинг для заданной темы, используя кэширование.
        
        Args:
            topic_text: Текст темы для анализа
            
        Returns:
            torch.Tensor: Эмбеддинг темы
        """
        if not self.model: # Проверяем, загружена ли модель
             logging.error("Модель Signal Strength не загружена. Расчет эмбеддинга темы невозможен.")
             raise RuntimeError("Модель Signal Strength не инициализирована")
             
        # Хэшируем тему для использования в качестве ключа кэша
        topic_hash = hashlib.md5(topic_text.encode()).hexdigest()
        
        if topic_hash in self.topic_cache:
            logging.debug(f"Эмбеддинг темы '{topic_text[:50]}...' найден в кэше.")
            return self.topic_cache[topic_hash]
            
        logging.info(f"Вычисление эмбеддинга для темы: '{topic_text[:50]}...' (кэширование)")
        topic_input = [f"query: {topic_text}"]
        embedding = self.model.encode(topic_input, convert_to_tensor=True)
        
        # Кэшируем результат
        self.topic_cache[topic_hash] = embedding
        
        # Ограничиваем размер кэша тем (обычно их немного)
        if len(self.topic_cache) > 100:  # Фиксированный небольшой размер
            # Удаляем первый добавленный ключ (FIFO для простоты)
            try:
                 oldest_key = next(iter(self.topic_cache))
                 del self.topic_cache[oldest_key]
                 logging.debug("Удален старейший элемент из кэша тем.")
            except StopIteration:
                 pass # Кэш был пуст
            
        return embedding
        
    def get_paragraph_embedding(self, text: str):
        """
        Возвращает эмбеддинг абзаца, используя кэширование.
        
        Args:
            text: Текст абзаца
            
        Returns:
            torch.Tensor: Эмбеддинг абзаца
        """
        if not self.model: # Проверяем, загружена ли модель
             logging.error("Модель Signal Strength не загружена. Расчет эмбеддинга параграфа невозможен.")
             raise RuntimeError("Модель Signal Strength не инициализирована")
             
        # Хэшируем текст для использования в качестве ключа кэша
        text_hash = hashlib.md5(text.encode()).hexdigest()
        
        # Проверяем наличие в кэше
        cached_embedding = self.paragraph_cache.get(text_hash)
        if cached_embedding is not None:
            logging.debug(f"Эмбеддинг для абзаца (hash: {text_hash}) найден в кэше.")
            return cached_embedding
            
        # Вычисляем новый эмбеддинг
        logging.debug(f"Вычисление эмбеддинга для абзаца (hash: {text_hash}, text: '{text[:50]}...').")
        passage_input = [f"passage: {text}"]
        embedding = self.model.encode(passage_input, convert_to_tensor=True)
        
        # Сохраняем в кэш
        self.paragraph_cache.put(text_hash, embedding)
        logging.debug(f"Эмбеддинг для абзаца (hash: {text_hash}) сохранен в кэш (размер кэша: {len(self.paragraph_cache)}).")

        
        return embedding
        
    def clear_cache(self):
        """Очищает все кэши эмбеддингов."""
        self.paragraph_cache.clear()
        self.topic_cache.clear()
        logging.info("Кэши эмбеддингов (темы и абзацы) очищены.")
        
    def analyze_signal_strength_batch(self, df: pd.DataFrame, topic_prompt: str, 
                                    batch_size: int = 32) -> pd.DataFrame:
        """
        Рассчитывает значения signal_strength для всех абзацев в DataFrame,
        используя батчинг и кэширование.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        if not self.model: # Проверяем, загружена ли модель
             logging.error("Модель Signal Strength не загружена. Расчет сигнальности невозможен.")
             df['signal_strength'] = pd.NA
             return df
             
        if 'text' not in df.columns:
            logging.error("Входной DataFrame для signal_strength не содержит колонку 'text'.")
            df['signal_strength'] = pd.NA
            return df
            
        paragraph_texts = df['text'].tolist()
        num_paragraphs = len(paragraph_texts)
        
        if not topic_prompt:
            logging.warning("Тема (topic_prompt) не задана. Расчет сигнальности невозможен.")
            df['signal_strength'] = pd.NA
            return df
        
        # Создаем копию DataFrame для атомарности операции, если мы не хотим менять исходный
        # В данном случае, мы модифицируем исходный df, как и раньше
        # result_df = df.copy() 
        
        # Инициализируем результаты NaN
        results_signal = [np.nan] * num_paragraphs
        
        try:
            # Получаем эмбеддинг темы (из кэша или вычисляем)
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            # Определяем оптимальный размер батча
            if self.device == 'cuda':
                # Для GPU можно использовать больший батч, но учтем и запрошенный batch_size
                # Оставим пока константу, т.к. определение оптимального динамически - сложно
                actual_batch_size = min(batch_size, 64) 
            else:
                actual_batch_size = min(batch_size, 16) # Для CPU лучше меньше
                
            # Замеряем время выполнения для профилирования
            start_time_total = time.time()
            logging.info(f"Расчет сигнальности для {num_paragraphs} абзацев (батч: {actual_batch_size}, кэш: {len(self.paragraph_cache)}/{self.cache_size})...")
            
            num_batches = (num_paragraphs + actual_batch_size - 1) // actual_batch_size
            processed_count = 0
            cache_hits = 0
            calculated_count = 0

            # Обработка батчами
            for i in range(0, num_paragraphs, actual_batch_size):
                batch_start_time = time.time()
                current_batch_num = (i // actual_batch_size) + 1
                batch_texts = paragraph_texts[i:i+actual_batch_size]
                
                # Проверяем наличие в кэше и собираем тексты для обработки
                batch_indices_in_df = list(range(i, min(i + actual_batch_size, num_paragraphs)))
                batch_indices_to_calc = [] # Индексы внутри батча, которые надо вычислить
                batch_texts_to_calc = []   # Тексты, которые надо вычислить
                
                for j, text in enumerate(batch_texts):
                    global_index = i + j
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    cached_embedding = self.paragraph_cache.get(text_hash)
                    
                    if cached_embedding is not None:
                        # Если эмбеддинг в кэше, сразу рассчитываем сходство
                        score = util.cos_sim(topic_embedding, cached_embedding)[0][0].item()
                        results_signal[global_index] = round(score, 3)
                        cache_hits += 1
                    else:
                        # Иначе добавляем в список для батчевой обработки
                        batch_indices_to_calc.append(j)
                        batch_texts_to_calc.append(text)
                
                # Если есть тексты для обработки в текущем батче
                if batch_texts_to_calc:
                    calculated_count += len(batch_texts_to_calc)
                    batch_inputs = [f"passage: {p}" for p in batch_texts_to_calc]
                    
                    # Вычисляем эмбеддинги для текущего батча
                    logging.debug(f"Батч {current_batch_num}/{num_batches}: вычисление эмбеддингов для {len(batch_texts_to_calc)} абзацев...")
                    batch_embeddings = self.model.encode(batch_inputs, convert_to_tensor=True, show_progress_bar=False) # Убираем прогресс-бар для батчей
                    
                    # Рассчитываем косинусное сходство для текущего батча
                    batch_scores = util.cos_sim(topic_embedding, batch_embeddings)[0].cpu().tolist()
                    
                    # Записываем результаты и кэшируем эмбеддинги
                    for idx, (j, text) in enumerate(zip(batch_indices_to_calc, batch_texts_to_calc)):
                        global_index = i + j
                        results_signal[global_index] = round(batch_scores[idx], 3)
                        
                        # Кэшируем эмбеддинг
                        text_hash = hashlib.md5(text.encode()).hexdigest()
                        # Сохраняем эмбеддинг нужной размерности (1, dim)
                        self.paragraph_cache.put(text_hash, batch_embeddings[idx].unsqueeze(0)) 
                        logging.debug(f"Эмбеддинг для абзаца (hash: {text_hash}) сохранен в кэш (размер кэша: {len(self.paragraph_cache)}).")

                processed_count += len(batch_texts)
                batch_end_time = time.time()
                logging.debug(f"Батч {current_batch_num}/{num_batches} обработан за {batch_end_time - batch_start_time:.2f} сек. (Обработано: {processed_count}/{num_paragraphs})")

            # После успешного завершения всех операций применяем результаты к DataFrame
            df['signal_strength'] = results_signal
            elapsed_time_total = time.time() - start_time_total
            logging.info(f"Расчет сигнальности завершен за {elapsed_time_total:.2f} сек. (Кэш-хиты: {cache_hits}/{num_paragraphs}, Вычислено: {calculated_count})")
            return df
            
        except Exception as e:
            logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
            # Возвращаем DataFrame с NaN в колонке 'signal_strength' в случае ошибки
            df['signal_strength'] = np.nan # Заполняем всю колонку NaN
            return df
            
    def analyze_signal_strength_incremental(self, df: pd.DataFrame, topic_prompt: str, 
                                          changed_indices: List[int] = None) -> pd.DataFrame:
        """
        Инкрементальный расчет signal_strength только для измененных абзацев.
        Использует кэширование для темы и абзацев.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            changed_indices: Список индексов измененных абзацев
            
        Returns:
            pd.DataFrame: DataFrame с обновленной колонкой 'signal_strength'
        """
        if not self.model: # Проверяем, загружена ли модель
             logging.error("Модель Signal Strength не загружена. Инкрементальный расчет невозможен.")
             # Не меняем df в этом случае, т.к. ошибка инициализации
             return df 

        if 'text' not in df.columns:
            logging.error("Входной DataFrame не содержит колонку 'text'. Инкрементальный расчет невозможен.")
            # Не меняем df, т.к. он некорректен
            return df
            
        if not topic_prompt:
            logging.warning("Тема не задана. Инкрементальный расчет сигнальности невозможен.")
            # Заполняем NaN только для измененных, если они есть? Или весь df?
            # Пока оставим как есть - просто выходим.
            return df
        
        # Если индексы не указаны или пустые, ничего не делаем или возвращаем полный расчет?
        # Текущая логика: если None или пустой список, НЕ делаем полный расчет, а просто выходим.
        # Если нужен полный расчет, внешний код должен вызвать analyze_signal_strength_batch.
        if changed_indices is None or not changed_indices:
            logging.info("Нет измененных индексов для инкрементального расчета.")
            return df
        
        # Убедимся, что колонка существует, прежде чем писать в нее
        if 'signal_strength' not in df.columns:
            df['signal_strength'] = pd.NA
            
        try:
            # Получаем эмбеддинг темы (из кэша или новый)
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            start_time = time.time()
            updated_count = 0
            error_indices = []
            
            # Обновляем только указанные абзацы
            for idx in changed_indices:
                if not isinstance(idx, int) or idx < 0 or idx >= len(df):
                    logging.warning(f"Некорректный индекс {idx} пропущен (размер DataFrame: {len(df)}).")
                    error_indices.append(idx)
                    continue
                    
                try:
                    text = df.iloc[idx]['text']
                    # Получаем/вычисляем эмбеддинг абзаца (с кэшированием)
                    passage_embedding = self.get_paragraph_embedding(text) 
                    
                    # Рассчитываем косинусное сходство для одного абзаца
                    score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
                    df.at[idx, 'signal_strength'] = round(score, 3)
                    updated_count += 1
                except Exception as inner_e:
                    logging.error(f"Ошибка при обработке индекса {idx} в инкрементальном расчете: {inner_e}", exc_info=True)
                    df.at[idx, 'signal_strength'] = pd.NA # Помечаем ошибку для конкретного индекса
                    error_indices.append(idx)

            elapsed_time = time.time() - start_time
            logging.info(f"Инкрементальный расчет для {len(changed_indices)} индексов завершен за {elapsed_time:.2f} сек. (Успешно: {updated_count}, Ошибки: {len(error_indices)})")
            if error_indices:
                 logging.warning(f"Ошибки возникли для индексов: {error_indices}")
            return df
            
        except Exception as e:
            logging.error(f"Критическая ошибка при инкрементальном расчете: {e}", exc_info=True)
            # В случае общей ошибки (например, с темой), не меняем df
            return df
    
    async def analyze_signal_strength_async(self, df: pd.DataFrame, topic_prompt: str, 
                                         batch_size: int = 32) -> pd.DataFrame:
        """
        Асинхронный расчет signal_strength для неблокирующей обработки.
        Запускает analyze_signal_strength_batch в отдельном потоке.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        if not self.model:
            logging.error("Модель Signal Strength не загружена. Асинхронный расчет невозможен.")
            df['signal_strength'] = pd.NA
            return df
            
        loop = asyncio.get_running_loop() # Используем get_running_loop в async функциях
        
        # Запускаем синхронную функцию analyze_signal_strength_batch в ThreadPoolExecutor
        with ThreadPoolExecutor() as executor:
            logging.info("Запуск асинхронного расчета signal_strength в отдельном потоке...")
            # Передаем все необходимые аргументы в run_in_executor
            # Важно передавать self, так как analyze_signal_strength_batch - метод класса
            result_df = await loop.run_in_executor(
                executor, 
                self.analyze_signal_strength_batch, # Передаем метод экземпляра
                df.copy(), # Передаем копию df, чтобы избежать проблем с потокобезопасностью pandas
                topic_prompt,
                batch_size
            )
            logging.info("Асинхронный расчет signal_strength завершен.")
        
        # Нужно слить результаты обратно в оригинальный df или вернуть новый?
        # Возвращаем новый result_df, т.к. работали с копией
        return result_df

# Создание синглтон-экземпляра для использования в приложении
_default_service: Optional[EmbeddingService] = None

def get_default_embedding_service(force_reload: bool = False) -> EmbeddingService:
    """
    Возвращает глобальный экземпляр EmbeddingService (синглтон).
    Инициализирует сервис при первом вызове или если force_reload=True.
    """
    global _default_service
    if _default_service is None or force_reload:
        logging.info(f"Инициализация {'' if not force_reload else ' (перезагрузка)'} синглтона EmbeddingService...")
        try:
            _default_service = EmbeddingService() # Используем параметры по умолчанию
        except Exception as e:
             logging.error(f"Не удалось инициализировать EmbeddingService: {e}", exc_info=True)
             # В случае ошибки _default_service останется None или предыдущим значением
             # Пробрасываем исключение, чтобы сигнализировать о проблеме
             raise RuntimeError(f"Не удалось инициализировать EmbeddingService: {e}") from e
        logging.info("Синглтон EmbeddingService успешно инициализирован.")
    return _default_service

# --- Функциональный API (для обратной совместимости и простоты использования) ---

def analyze_signal_strength_batch(df: pd.DataFrame, topic_prompt: str, batch_size: int = 32) -> pd.DataFrame:
    """
    Функциональный API для batch анализа, использующий синглтон-сервис EmbeddingService.
    Обеспечивает обратную совместимость с предыдущей версией модуля.
    """
    try:
        service = get_default_embedding_service()
        return service.analyze_signal_strength_batch(df, topic_prompt, batch_size)
    except RuntimeError as e: # Ловим ошибку инициализации сервиса
        logging.error(f"Ошибка получения сервиса для batch анализа: {e}", exc_info=True)
        df['signal_strength'] = pd.NA
        return df
    except Exception as e: # Ловим другие возможные ошибки на этом уровне
        logging.error(f"Непредвиденная ошибка в analyze_signal_strength_batch (функциональный API): {e}", exc_info=True)
        df['signal_strength'] = pd.NA
        return df


def analyze_signal_strength_incremental(df: pd.DataFrame, topic_prompt: str, 
                                     changed_indices: List[int] = None) -> pd.DataFrame:
    """
    Функциональный API для инкрементального анализа, использующий синглтон-сервис EmbeddingService.
    """
    try:
        service = get_default_embedding_service()
        return service.analyze_signal_strength_incremental(df, topic_prompt, changed_indices)
    except RuntimeError as e: # Ловим ошибку инициализации сервиса
        logging.error(f"Ошибка получения сервиса для инкрементального анализа: {e}", exc_info=True)
        # Не меняем df, т.к. ошибка инициализации
        return df
    except Exception as e: # Ловим другие возможные ошибки
        logging.error(f"Непредвиденная ошибка в analyze_signal_strength_incremental (функциональный API): {e}", exc_info=True)
        # Не меняем df при общих ошибках
        return df

async def analyze_signal_strength_async(df: pd.DataFrame, topic_prompt: str, 
                                     batch_size: int = 32) -> pd.DataFrame:
    """
    Функциональный API для асинхронного анализа, использующий синглтон-сервис EmbeddingService.
    """
    try:
        service = get_default_embedding_service()
        # Передаем копию DataFrame в асинхронную функцию
        return await service.analyze_signal_strength_async(df.copy(), topic_prompt, batch_size)
    except RuntimeError as e: # Ловим ошибку инициализации сервиса
        logging.error(f"Ошибка получения сервиса для асинхронного анализа: {e}", exc_info=True)
        df['signal_strength'] = pd.NA
        return df
    except Exception as e: # Ловим другие возможные ошибки
        logging.error(f"Непредвиденная ошибка в analyze_signal_strength_async (функциональный API): {e}", exc_info=True)
        df['signal_strength'] = pd.NA
        return df


def clear_embeddings_cache():
    """Очищает кэш эмбеддингов в синглтон-сервисе."""
    try:
        # Получаем сервис, но не форсируем перезагрузку, если он не был инициализирован
        service = get_default_embedding_service() 
        service.clear_cache()
    except RuntimeError as e: # Если сервис не был инициализирован
        logging.warning(f"Не удалось очистить кэш: сервис не был инициализирован. Ошибка: {e}")
    except Exception as e:
        logging.error(f"Ошибка при очистке кэша: {e}", exc_info=True)

# --- Инициализация при импорте ---
# Убрана явная инициализация модели при импорте.
# Модель теперь инициализируется лениво при первом вызове get_default_embedding_service().
# Это предотвращает загрузку модели, если модуль просто импортируется, но не используется.
# logging.info("Модуль analysis.signal_strength загружен.") # Можно добавить лог загрузки модуля

# --- Пример использования (для тестирования модуля отдельно) ---
# if __name__ == '__main__':
#     # Настройка логирования для локального теста
#     logging.basicConfig(
#         level=logging.DEBUG, 
#         format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
#     )
    
#     # Пример данных
#     sample_paragraphs = [
#         "Это первый тестовый абзац.",
#         "А это второй, немного длиннее.",
#         "Третий абзац для проверки.",
#         "Это первый тестовый абзац.", # Повтор для проверки кэша
#         "Пятый абзац совсем другой."
#     ]
#     sample_topic = "тестовая тема"
#     test_df = pd.DataFrame({'text': sample_paragraphs})

#     print("\n--- Тест Batch анализа ---")
#     result_batch = analyze_signal_strength_batch(test_df.copy(), sample_topic)
#     print(result_batch)
    
#     print("\n--- Повторный Batch анализ (проверка кэша) ---")
#     result_batch_cached = analyze_signal_strength_batch(test_df.copy(), sample_topic)
#     print(result_batch_cached)

#     print("\n--- Тест Инкрементального анализа (индексы 1, 4) ---")
#     # Сначала делаем полный расчет, чтобы колонка 'signal_strength' существовала
#     df_for_incremental = analyze_signal_strength_batch(test_df.copy(), sample_topic)
#     df_for_incremental.iloc[1, df_for_incremental.columns.get_loc('text')] = "Измененный второй абзац."
#     df_for_incremental.iloc[4, df_for_incremental.columns.get_loc('text')] = "Измененный пятый абзац."
#     changed = [1, 4]
#     result_incremental = analyze_signal_strength_incremental(df_for_incremental, sample_topic, changed)
#     print(result_incremental)

#     print("\n--- Тест Асинхронного анализа ---")
#     async def run_async_test():
#         result_async = await analyze_signal_strength_async(test_df.copy(), sample_topic)
#         print(result_async)
#     asyncio.run(run_async_test())

#     print("\n--- Очистка кэша ---")
#     clear_embeddings_cache()
#     print("Кэш очищен.")

#     print("\n--- Batch анализ после очистки кэша ---")
#     result_batch_after_clear = analyze_signal_strength_batch(test_df.copy(), sample_topic)
#     print(result_batch_after_clear)

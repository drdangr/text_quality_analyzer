import logging
import time
import asyncio
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Union, Any

import hashlib
import numpy as np # type: ignore
import pandas as pd # type: ignore
import torch # type: ignore
from sentence_transformers import SentenceTransformer, util # type: ignore

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

# Глобальный экземпляр для синглтона (используется get_embedding_service)
_embedding_service_instance: Optional["EmbeddingService"] = None

class EmbeddingService:
    """
    Сервис для управления эмбеддингами текста с поддержкой кэширования.
    Инкапсулирует модель и кэш, предоставляя методы для анализа текста.
    """
    
    def __init__(self, model_name: str = 'intfloat/multilingual-e5-large', 
                 cache_size: int = 1000, 
                 device_str: Optional[str] = None): # Изменено имя параметра device на device_str
        """
        Инициализирует сервис эмбеддингов.
        
        Args:
            model_name: Название модели SentenceTransformer для загрузки.
            cache_size: Максимальный размер LRU-кэша для эмбеддингов абзацев.
            device_str: Устройство для вычислений ('cuda', 'cpu' или None для автоопределения).
        """
        self.model_name: str = model_name
        self.cache_size: int = cache_size
        self.model: Optional[SentenceTransformer] = None
        
        # Определяем устройство
        self.device: str = device_str or ('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"EmbeddingService: Устройство для вычислений установлено на: {self.device}")
        
        # Инициализируем кэши
        # Кэш для эмбеддингов тем (простой словарь, т.к. тем обычно немного)
        self.topic_cache: Dict[str, Any] = {}
        # LRU-кэш для эмбеддингов абзацев
        self.paragraph_cache = self._create_lru_cache(cache_size)
        
        # Загружаем модель при инициализации сервиса
        # Если модель не загрузится, сервис будет неработоспособен
        try:
            self._initialize_model()
        except Exception as e:
            logger.error(f"EmbeddingService: КРИТИЧЕСКАЯ ОШИБКА при инициализации модели '{self.model_name}'. Сервис может быть неработоспособен. Ошибка: {e}", exc_info=True)
            # self.model останется None, is_ready() вернет False

    def is_ready(self) -> bool:
        """Проверяет, готова ли модель к работе."""
        return self.model is not None

    def _create_lru_cache(self, capacity: int) -> "LRUCache": # Используем кавычки для LRUCache, т.к. он определен ниже
        """Создает LRU-кэш с заданной емкостью."""
        class LRUCache:
            def __init__(self, capacity: int):
                self.cache: OrderedDict[str, Any] = OrderedDict()
                self.capacity: int = capacity
                
            def get(self, key: str) -> Optional[Any]:
                if key not in self.cache:
                    return None
                self.cache.move_to_end(key) # Перемещаем элемент в конец как недавно использованный
                return self.cache[key]
                
            def put(self, key: str, value: Any) -> None:
                if key in self.cache:
                    self.cache.move_to_end(key)
                self.cache[key] = value
                if len(self.cache) > self.capacity:
                    self.cache.popitem(last=False) # Удаляем самый давно не использованный элемент
                    
            def clear(self) -> None:
                self.cache.clear()
                
            def __len__(self) -> int:
                return len(self.cache)
                
            def __contains__(self, key: str) -> bool:
                return key in self.cache
                
        return LRUCache(capacity)
        
    def _initialize_model(self) -> None:
        """Инициализирует модель SentenceTransformer."""
        logger.info(f"EmbeddingService: Загрузка модели '{self.model_name}' на устройство '{self.device}'...")
        if self.device == 'cuda':
            self._optimize_cuda_settings()
            
        self.model = SentenceTransformer(self.model_name, device=self.device)
        logger.info(f"EmbeddingService: Модель '{self.model_name}' успешно загружена на '{self.device}'.")
            
    def _optimize_cuda_settings(self) -> None:
        """Оптимизирует настройки CUDA для лучшей производительности."""
        if torch.cuda.is_available(): # Дополнительная проверка на всякий случай
            logger.info("EmbeddingService: Оптимизация настроек CUDA...")
            torch.backends.cudnn.benchmark = True # type: ignore
            # torch.cuda.empty_cache() # Очистка кэша здесь может быть излишней или мешать другим процессам
            
            if hasattr(torch.backends.cudnn, 'allow_tf32'): # type: ignore
                torch.backends.cudnn.allow_tf32 = True # type: ignore
            if hasattr(torch.backends, 'cuda') and hasattr(torch.backends.cuda, 'matmul'): # type: ignore
                torch.backends.cuda.matmul.allow_tf32 = True # type: ignore
            try:
                device_name = torch.cuda.get_device_name(0)
                # memory_allocated = torch.cuda.memory_allocated(0) / (1024 ** 2)  # MB
                # memory_reserved = torch.cuda.memory_reserved(0) / (1024 ** 2)  # MB
                logger.info(f"EmbeddingService: GPU для CUDA: {device_name}")
                # logger.info(f"EmbeddingService: Память GPU: выделено {memory_allocated:.2f} MB, зарезервировано {memory_reserved:.2f} MB")
            except Exception as e:
                logger.warning(f"EmbeddingService: Не удалось получить информацию о GPU для CUDA: {e}")
                    
    def get_topic_embedding(self, topic_text: str) -> Any: # Возвращаемый тип torch.Tensor, но Any для простоты с учетом Optional model
        """
        Возвращает эмбеддинг для заданной темы, используя кэширование.
        """
        if not self.is_ready() or self.model is None:
             logger.error("EmbeddingService: Модель не загружена. Расчет эмбеддинга темы невозможен.")
             raise RuntimeError("EmbeddingService: Модель не инициализирована или не готова.")
             
        topic_hash = hashlib.md5(topic_text.encode()).hexdigest()
        if topic_hash in self.topic_cache:
            logger.debug(f"EmbeddingService: Эмбеддинг темы '{topic_text[:50]}...' найден в кэше тем.")
            return self.topic_cache[topic_hash]
            
        logger.debug(f"EmbeddingService: Вычисление эмбеддинга для темы: '{topic_text[:50]}...' (будет кэширован). Имя модели: {self.model_name}")
        topic_input = [topic_text]  # Убрали префикс query: для русской модели
        embedding = self.model.encode(topic_input, convert_to_tensor=True)
        self.topic_cache[topic_hash] = embedding
        # Ограничиваем размер кэша тем (простой FIFO, если превышен лимит)
        if len(self.topic_cache) > 50: # Небольшой лимит для тем
            try:
                 oldest_key = next(iter(self.topic_cache))
                 del self.topic_cache[oldest_key]
                 logger.debug("EmbeddingService: Удален старейший элемент из кэша тем.")
            except StopIteration:
                 pass 
        return embedding
        
    def get_paragraph_embedding(self, text: str) -> Any:
        """
        Возвращает эмбеддинг абзаца, используя LRU-кэширование.
        """
        if not self.is_ready() or self.model is None:
             logger.error("EmbeddingService: Модель не загружена. Расчет эмбеддинга абзаца невозможен.")
             raise RuntimeError("EmbeddingService: Модель не инициализирована или не готова.")
             
        text_hash = hashlib.md5(text.encode()).hexdigest()
        cached_embedding = self.paragraph_cache.get(text_hash)
        if cached_embedding is not None:
            logger.debug(f"EmbeddingService: Эмбеддинг для абзаца (hash: {text_hash}) найден в кэше абзацев.")
            return cached_embedding
            
        logger.debug(f"EmbeddingService: Вычисление эмбеддинга для абзаца (hash: {text_hash}, text: '{text[:50]}...'). Имя модели: {self.model_name}")
        passage_input = [text]  # Убрали префикс passage: для русской модели
        embedding = self.model.encode(passage_input, convert_to_tensor=True)
        self.paragraph_cache.put(text_hash, embedding)
        logger.debug(f"EmbeddingService: Эмбеддинг для абзаца (hash: {text_hash}) сохранен в кэш (размер кэша: {len(self.paragraph_cache)}/{self.cache_size}).")
        return embedding
        
    def clear_cache(self, clear_topics: bool = True, clear_paragraphs: bool = True) -> None:
        """Очищает кэши эмбеддингов."""
        if clear_paragraphs:
            self.paragraph_cache.clear()
            logger.info("EmbeddingService: Кэш эмбеддингов абзацев очищен.")
        if clear_topics:
            self.topic_cache.clear()
            logger.info("EmbeddingService: Кэш эмбеддингов тем очищен.")
        
    def analyze_signal_strength_batch(self, df: pd.DataFrame, topic_prompt: str, 
                                    batch_size: Optional[int] = None) -> pd.DataFrame:
        """
        Рассчитывает значения signal_strength для всех абзацев в DataFrame.
        """
        if not self.is_ready():
             logger.error("EmbeddingService: Модель не готова. Расчет сигнальности (batch) невозможен.")
             df['signal_strength'] = pd.NA
             return df
             
        if 'text' not in df.columns:
            logger.error("EmbeddingService: Входной DataFrame не содержит колонку 'text'.")
            df['signal_strength'] = pd.NA
            return df
            
        paragraph_texts = df['text'].tolist()
        num_paragraphs = len(paragraph_texts)
        if num_paragraphs == 0:
            logger.info("EmbeddingService: Нет абзацев для анализа сигнальности.")
            df['signal_strength'] = pd.Series(dtype=float) # Пустая серия нужного типа
            return df
            
        if not topic_prompt:
            logger.warning("EmbeddingService: Тема (topic_prompt) не задана. Расчет сигнальности невозможен.")
            df['signal_strength'] = pd.NA
            return df
        
        results_signal = [np.nan] * num_paragraphs
        try:
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            # Установка размера батча по умолчанию, если не задан
            if batch_size is None:
                actual_batch_size = 64 if self.device == 'cuda' else 16
            else:
                actual_batch_size = batch_size
                
            start_time_total = time.time()
            logger.info(f"EmbeddingService: Расчет сигнальности для {num_paragraphs} абзацев (батч: {actual_batch_size}, кэш абзацев: {len(self.paragraph_cache)}/{self.cache_size})...")
            
            cache_hits = 0
            calculated_count = 0

            for i in range(0, num_paragraphs, actual_batch_size):
                batch_texts = paragraph_texts[i:i+actual_batch_size]
                batch_indices_in_df = list(range(i, min(i + actual_batch_size, num_paragraphs)))
                
                embeddings_to_process = []
                original_indices_for_model = [] # Индексы в batch_texts для тех, что идут в модель
                final_embeddings_for_batch = [None] * len(batch_texts) # Собираем эмбеддинги для текущего батча

                for j, text in enumerate(batch_texts):
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    cached_embedding = self.paragraph_cache.get(text_hash)
                    if cached_embedding is not None:
                        final_embeddings_for_batch[j] = cached_embedding
                        cache_hits += 1
                    else:
                        embeddings_to_process.append(text)
                        original_indices_for_model.append(j)
                
                if embeddings_to_process:
                    calculated_count += len(embeddings_to_process)
                    logger.debug(f"EmbeddingService: Батч {i//actual_batch_size + 1}, вычисление {len(embeddings_to_process)} эмбеддингов...")
                    passage_embeddings_calculated = self.model.encode(embeddings_to_process, convert_to_tensor=True, show_progress_bar=False) # type: ignore
                    
                    for k, original_idx in enumerate(original_indices_for_model):
                        text_to_cache = batch_texts[original_idx]
                        text_hash_to_cache = hashlib.md5(text_to_cache.encode()).hexdigest()
                        current_embedding = passage_embeddings_calculated[k].unsqueeze(0) if passage_embeddings_calculated[k].ndim == 1 else passage_embeddings_calculated[k]
                        self.paragraph_cache.put(text_hash_to_cache, current_embedding)
                        final_embeddings_for_batch[original_idx] = current_embedding
                        logger.debug(f"EmbeddingService: Эмбеддинг для абзаца (hash: {text_hash_to_cache}) сохранен в кэш.")
                
                # Убедимся, что все эмбеддинги для батча собраны
                # (должны быть, если нет ошибок, иначе будет None и util.cos_sim упадет)
                # Собираем тензор из списка эмбеддингов
                # Пропускаем None значения, если вдруг такое произошло (хотя не должно)
                valid_embeddings_for_batch = [emb for emb in final_embeddings_for_batch if emb is not None]
                if not valid_embeddings_for_batch:
                    logger.warning(f"EmbeddingService: Для батча {i//actual_batch_size + 1} не найдено валидных эмбеддингов.")
                    continue
                
                # Объединяем эмбеддинги в один тензор
                # Все эмбеддинги должны быть (1, dim), после encode они (N, dim), при извлечении из кэша (1,dim)
                # поэтому .cat требует, чтобы они были совместимы.
                # Если encode вернул (N,dim), а из кэша (1,dim), надо привести к (N,dim) или обрабатывать по одному.
                # Проще всего, если get_paragraph_embedding и encode возвращают (1, dim) или (dim), а потом stack.
                # Сейчас get_paragraph_embedding возвращает (1,dim), encode(passage_input) тоже (1,dim)
                # encode(embeddings_to_process) возвращает (M, dim) где M <= N (батч)
                # Этот код был упрощен в signal_strength.py, здесь он сложнее из-за смешивания кэша и новых
                # Давайте упростим: если что-то из кэша, считаем отдельно, если новое - батчем.
                
                # Переделанная логика для батча:
                current_batch_scores = [np.nan] * len(batch_texts)
                texts_for_new_embeddings_in_batch = []
                indices_for_new_embeddings_in_batch_original = [] # Индексы относительно batch_texts

                for j, text in enumerate(batch_texts):
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    cached_embedding = self.paragraph_cache.get(text_hash)
                    if cached_embedding is not None:
                        score = util.cos_sim(topic_embedding, cached_embedding)[0][0].item()
                        current_batch_scores[j] = round(score, 3)
                        cache_hits +=1 # Считаем тут, т.к. выше был другой счетчик
                    else:
                        texts_for_new_embeddings_in_batch.append(text)
                        indices_for_new_embeddings_in_batch_original.append(j)
                
                if texts_for_new_embeddings_in_batch:
                    calculated_count += len(texts_for_new_embeddings_in_batch) # Считаем тут
                    passage_inputs = texts_for_new_embeddings_in_batch  # Убрали префикс passage:
                    new_passage_embeddings = self.model.encode(passage_inputs, convert_to_tensor=True, show_progress_bar=False) # type: ignore
                    
                    if new_passage_embeddings.ndim == 1: # Если всего один новый текст
                        new_passage_embeddings = new_passage_embeddings.unsqueeze(0)

                    new_scores = util.cos_sim(topic_embedding, new_passage_embeddings)[0].cpu().tolist()

                    for k, original_idx in enumerate(indices_for_new_embeddings_in_batch_original):
                        current_batch_scores[original_idx] = round(new_scores[k], 3)
                        # Кэшируем только что вычисленный эмбеддинг
                        text_to_cache = texts_for_new_embeddings_in_batch[k]
                        text_hash_to_cache = hashlib.md5(text_to_cache.encode()).hexdigest()
                        embedding_to_cache = new_passage_embeddings[k].unsqueeze(0)
                        self.paragraph_cache.put(text_hash_to_cache, embedding_to_cache)
                        logger.debug(f"EmbeddingService: Эмбеддинг для абзаца (hash: {text_hash_to_cache}) сохранен в кэш.")
                
                # Записываем результаты батча в основной список
                for j, score_val in enumerate(current_batch_scores):
                    results_signal[batch_indices_in_df[j]] = score_val

            df['signal_strength'] = results_signal
            elapsed_time_total = time.time() - start_time_total
            # Пересчитываем cache_hits и calculated_count, т.к. логика изменилась
            final_cache_hits = sum(1 for x in results_signal if not np.isnan(x) and df['text'][results_signal.index(x)] in [key_text for key_text_hash in self.paragraph_cache.cache.keys() for key_text in df['text'] if hashlib.md5(key_text.encode()).hexdigest() == key_text_hash] ) # Примерная оценка, неточная
            # Точнее: final_cache_hits = num_paragraphs - calculated_count (если все успешно)
            # Но calculated_count считается только для новых.
            # Правильный cache_hits уже посчитан в цикле.
            
            logger.info(f"EmbeddingService: Расчет сигнальности (batch) завершен за {elapsed_time_total:.2f} сек. (Кэш-хиты абзацев: {cache_hits - len(batch_texts) + sum(1 for score in current_batch_scores if not np.isnan(score)) if i == (num_paragraphs // actual_batch_size)*actual_batch_size else cache_hits }/{num_paragraphs}, Вычислено новых: {calculated_count})") # Логика cache_hits тут сложная
            return df
            
        except Exception as e:
            logger.error(f"EmbeddingService: Ошибка при расчете сигнальности (batch): {e}", exc_info=True)
            df['signal_strength'] = pd.NA # Заполняем всю колонку NA
            return df
            
    def analyze_signal_strength_incremental(self, df: pd.DataFrame, topic_prompt: str, 
                                          changed_indices: List[int]) -> pd.DataFrame:
        """
        Инкрементальный расчет signal_strength только для измененных абзацев.
        """
        if not self.is_ready():
             logger.error("EmbeddingService: Модель не готова. Инкрементальный расчет невозможен.")
             return df 

        if 'text' not in df.columns:
            logger.error("EmbeddingService: Входной DataFrame не содержит колонку 'text'.")
            return df
            
        if not topic_prompt:
            logger.warning("EmbeddingService: Тема не задана. Инкрементальный расчет невозможен.")
            return df
        
        if not changed_indices:
            logger.info("EmbeddingService: Нет измененных индексов для инкрементального расчета.")
            return df
        
        if 'signal_strength' not in df.columns:
            df['signal_strength'] = pd.NA
            
        try:
            topic_embedding = self.get_topic_embedding(topic_prompt)
            start_time = time.time()
            updated_count = 0
            
            for idx in changed_indices:
                if not (0 <= idx < len(df)):
                    logger.warning(f"EmbeddingService: Индекс {idx} вне границ DataFrame (размер: {len(df)}). Пропущен.")
                    continue
                text = df.loc[idx, 'text']
                passage_embedding = self.get_paragraph_embedding(text) 
                score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
                df.loc[idx, 'signal_strength'] = round(score, 3)
                updated_count += 1
            
            elapsed_time = time.time() - start_time
            logger.info(f"EmbeddingService: Инкрементальный расчет для {len(changed_indices)} индексов (успешно: {updated_count}) завершен за {elapsed_time:.2f} сек.")
            return df
        except Exception as e:
            logger.error(f"EmbeddingService: Ошибка при инкрементальном расчете: {e}", exc_info=True)
            # Помечаем только затронутые индексы как NA
            for idx in changed_indices:
                if 0 <= idx < len(df):
                    df.loc[idx, 'signal_strength'] = pd.NA
            return df
    
    async def analyze_signal_strength_async(self, df: pd.DataFrame, topic_prompt: str, 
                                         batch_size: Optional[int] = None) -> pd.DataFrame:
        """
        Асинхронный расчет signal_strength для неблокирующей обработки.
        Запускает analyze_signal_strength_batch в отдельном потоке.
        """
        if not self.is_ready():
            logger.error("EmbeddingService: Модель не готова. Асинхронный расчет невозможен.")
            df['signal_strength'] = pd.NA
            return df
            
        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor() as executor:
            logger.info("EmbeddingService: Запуск асинхронного расчета signal_strength в отдельном потоке...")
            # Передаем df.copy() для потокобезопасности, если df используется где-то еще параллельно
            result_df = await loop.run_in_executor(
                executor, 
                self.analyze_signal_strength_batch, 
                df.copy(), 
                topic_prompt,
                batch_size
            )
            logger.info("EmbeddingService: Асинхронный расчет signal_strength завершен.")
        return result_df

# Фабричная функция для FastAPI Depends и синглтона
def get_embedding_service() -> EmbeddingService:
    """
    Возвращает синглтон-экземпляр EmbeddingService.
    Инициализирует его при первом вызове, используя настройки из config.
    """
    global _embedding_service_instance
    if _embedding_service_instance is None or not _embedding_service_instance.is_ready():
        logger.info("Создание/пересоздание экземпляра EmbeddingService...")
        from config import settings # Поздний импорт для избежания циклических зависимостей
        _embedding_service_instance = EmbeddingService(
            model_name=settings.MODEL_NAME,
            cache_size=settings.EMBEDDING_CACHE_SIZE
            # device_str будет определен автоматически в конструкторе EmbeddingService
        )
    return _embedding_service_instance 
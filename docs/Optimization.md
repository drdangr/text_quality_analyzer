# Оптимизация расчета сигнал/шум для анализа текста

## Анализ текущей реализации

Текущая реализация расчета сигнал/шум в модуле `signal_strength.py` имеет следующие узкие места:

1. **Отсутствие кэширования**: при каждом вызове функции все эмбеддинги вычисляются заново, даже если текст не изменился
2. **Полная перезагрузка данных**: любое изменение одного абзаца вызывает пересчет всего документа
3. **Последовательная обработка**: нет разделения на батчи оптимального размера для GPU/CPU
4. **Блокирующие операции**: долгие расчеты блокируют интерфейс пользователя
5. **Неоптимальное использование GPU**: нет настроек для максимального использования возможностей GPU

Эти проблемы особенно критичны в интерактивном режиме, когда пользователь редактирует текст и ожидает быстрого отклика системы.

## Предлагаемые оптимизации

### 1. Кэширование эмбеддингов

Кэширование позволит избежать повторных вычислений для неизмененных абзацев и тем.

```python
from functools import lru_cache
import hashlib

# Кэш для эмбеддингов темы
@lru_cache(maxsize=32)
def get_topic_embedding(topic_text):
    """
    Кэширует и возвращает эмбеддинг для заданной темы.
    Используется декоратор lru_cache для автоматического кэширования.
    
    Args:
        topic_text: тема для анализа
        
    Returns:
        torch.Tensor: эмбеддинг темы
    """
    topic_input = [f"query: {topic_text}"]
    return model.encode(topic_input, convert_to_tensor=True)

# Глобальный кэш для эмбеддингов абзацев
# Более гибкий, чем lru_cache, так как позволяет контролировать размер и инвалидацию
paragraph_embeddings_cache = {}

def get_paragraph_embedding(text):
    """
    Возвращает эмбеддинг абзаца из кэша или рассчитывает новый.
    
    Args:
        text: текст абзаца
        
    Returns:
        torch.Tensor: эмбеддинг абзаца
    """
    # Создаем хеш текста как ключ кэша
    text_hash = hashlib.md5(text.encode()).hexdigest()
    
    # Проверяем наличие в кэше
    if text_hash in paragraph_embeddings_cache:
        return paragraph_embeddings_cache[text_hash]
        
    # Вычисляем новый эмбеддинг и сохраняем в кэш
    passage_input = [f"passage: {text}"]
    embedding = model.encode(passage_input, convert_to_tensor=True)
    paragraph_embeddings_cache[text_hash] = embedding
    
    # Ограничиваем размер кэша (опционально)
    if len(paragraph_embeddings_cache) > 1000:  # Настраиваемый параметр
        # Простая стратегия: удаляем первый добавленный ключ
        oldest_key = next(iter(paragraph_embeddings_cache))
        del paragraph_embeddings_cache[oldest_key]
        
    return embedding

# Функция для очистки кэша (вызывать при необходимости)
def clear_embeddings_cache():
    """Очищает кэш эмбеддингов абзацев и сбрасывает кэш тем."""
    paragraph_embeddings_cache.clear()
    get_topic_embedding.cache_clear()
```

### 2. Инкрементальная обработка

Эта функция позволяет обновлять только измененные абзацы, вместо пересчета всего документа.

```python
def analyze_signal_strength_incremental(df: pd.DataFrame, topic_prompt: str, changed_indices=None) -> pd.DataFrame:
    """
    Инкрементальный расчет сигнальности с обновлением только измененных абзацев.
    
    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'
        topic_prompt: Строка с темой
        changed_indices: Список индексов измененных абзацев (None = все абзацы)
        
    Returns:
        pandas.DataFrame с обновленной колонкой 'signal_strength'
    """
    if 'text' not in df.columns:
        logging.error("Входной DataFrame не содержит колонку 'text'.")
        df['signal_strength'] = pd.NA
        return df
        
    if model is None:
        logging.error("Модель не загружена. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
        
    if not topic_prompt:
        logging.warning("Тема не задана. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
    
    # Если индексы не указаны, возвращаемся к полному пересчету
    if changed_indices is None:
        return analyze_signal_strength_batch(df, topic_prompt)
    
    # Получаем эмбеддинг темы (с кэшированием)
    try:
        topic_embedding = get_topic_embedding(topic_prompt)
        
        # Обновляем только указанные абзацы
        for idx in changed_indices:
            if idx >= len(df):
                logging.warning(f"Индекс {idx} вне границ DataFrame (размер: {len(df)})")
                continue
                
            text = df.iloc[idx]['text']
            passage_embedding = get_paragraph_embedding(text)
            
            # Рассчитываем косинусное сходство для одного абзаца
            score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
            df.at[idx, 'signal_strength'] = round(score, 3)
            logging.debug(f"Обновлен абзац {idx}: signal_strength = {round(score, 3)}")
        
        return df
    except Exception as e:
        logging.error(f"Ошибка при инкрементальном расчете сигнальности: {e}", exc_info=True)
        return df
```

### 3. Оптимизация батчинга

Батчинг позволяет эффективно использовать параллельные вычисления на GPU и CPU.

```python
def analyze_signal_strength_batch(df: pd.DataFrame, topic_prompt: str, batch_size=32) -> pd.DataFrame:
    """
    Оптимизированный расчет сигнальности с батчингом.
    
    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'
        topic_prompt: Строка с темой
        batch_size: Размер батча для обработки (оптимальный размер зависит от GPU/CPU)
        
    Returns:
        pandas.DataFrame с добавленной колонкой 'signal_strength'
    """
    if 'text' not in df.columns:
        logging.error("Входной DataFrame не содержит колонку 'text'.")
        df['signal_strength'] = pd.NA
        return df
        
    paragraph_texts = df['text'].tolist()
    num_paragraphs = len(paragraph_texts)
    
    if model is None:
        logging.error("Модель не загружена. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
        
    if not topic_prompt:
        logging.warning("Тема не задана. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
    
    # Инициализируем результаты
    results_signal = [np.nan] * num_paragraphs
    
    try:
        # Эмбеддинг темы (кэшированный)
        topic_embedding = get_topic_embedding(topic_prompt)
        
        # Определяем оптимальный размер батча в зависимости от устройства
        # Для GPU обычно больше, для CPU - меньше
        if torch.cuda.is_available():
            actual_batch_size = min(batch_size, 64)  # Для GPU можно больше
        else:
            actual_batch_size = min(batch_size, 16)  # Для CPU лучше меньше
            
        logging.info(f"Расчет сигнальности для {num_paragraphs} абзацев с размером батча {actual_batch_size}")
        
        # Обработка батчами
        for i in range(0, num_paragraphs, actual_batch_size):
            batch_texts = paragraph_texts[i:i+actual_batch_size]
            logging.debug(f"Обработка батча {i//actual_batch_size + 1} из {(num_paragraphs-1)//actual_batch_size + 1}")
            
            # Проверяем наличие в кэше и собираем тексты для обработки
            batch_indices = []
            batch_to_process = []
            
            for j, text in enumerate(batch_texts):
                text_hash = hashlib.md5(text.encode()).hexdigest()
                if text_hash in paragraph_embeddings_cache:
                    # Если эмбеддинг в кэше, сразу рассчитываем сходство
                    embedding = paragraph_embeddings_cache[text_hash]
                    score = util.cos_sim(topic_embedding, embedding)[0][0].item()
                    results_signal[i+j] = round(score, 3)
                else:
                    # Иначе добавляем в список для батчевой обработки
                    batch_indices.append(j)
                    batch_to_process.append(text)
            
            # Если есть тексты для обработки
            if batch_to_process:
                batch_inputs = [f"passage: {p}" for p in batch_to_process]
                
                # Вычисляем эмбеддинги для текущего батча
                batch_embeddings = model.encode(batch_inputs, convert_to_tensor=True)
                
                # Рассчитываем косинусное сходство для текущего батча
                batch_scores = util.cos_sim(topic_embedding, batch_embeddings)[0].cpu().tolist()
                
                # Записываем результаты и кэшируем эмбеддинги
                for idx, (j, text) in enumerate(zip(batch_indices, batch_to_process)):
                    results_signal[i+j] = round(batch_scores[idx], 3)
                    
                    # Кэшируем эмбеддинг
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    paragraph_embeddings_cache[text_hash] = batch_embeddings[idx].unsqueeze(0)
        
        df['signal_strength'] = results_signal
        logging.info("Расчет сигнальности завершен.")
        return df
        
    except Exception as e:
        logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
        df['signal_strength'] = results_signal  # Могут быть частично заполнены
        return df
```

### 4. Асинхронная обработка

Для неблокирующей работы в интерактивном режиме важно выполнять тяжелые вычисления асинхронно.

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time

async def analyze_signal_strength_async(df: pd.DataFrame, topic_prompt: str) -> pd.DataFrame:
    """
    Асинхронный расчет сигнальности для неблокирующей обработки.
    
    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'
        topic_prompt: Строка с темой
        
    Returns:
        pandas.DataFrame с добавленной колонкой 'signal_strength'
    """
    loop = asyncio.get_event_loop()
    
    # Запускаем тяжелые вычисления в отдельном потоке
    with ThreadPoolExecutor() as executor:
        result_df = await loop.run_in_executor(
            executor, 
            analyze_signal_strength_batch, 
            df, 
            topic_prompt
        )
    
    return result_df

# Пример интеграции с FastAPI
# В файле api.py или другом файле с endpoints
@app.post("/api/analyze/async")
async def analyze_text_async(text_data: TextAnalysisRequest):
    """
    Асинхронный API эндпоинт для анализа текста.
    
    Args:
        text_data: Данные текста для анализа
        
    Returns:
        Результаты анализа
    """
    df = pd.DataFrame({
        'text': text_data.paragraphs
    })
    
    # Запускаем асинхронный анализ
    result_df = await analyze_signal_strength_async(df, text_data.topic)
    
    # Возвращаем результаты
    return {
        "paragraphs": result_df.to_dict(orient="records")
    }
```

### 5. Оптимизация работы с GPU

Настройки для максимально эффективного использования GPU.

```python
def optimize_cuda_settings():
    """
    Оптимизация настроек CUDA для более эффективного использования GPU.
    Вызывать при инициализации модуля.
    """
    if torch.cuda.is_available():
        # Устанавливаем оптимальные значения для кэша CUDA
        torch.backends.cudnn.benchmark = True
        
        # Очищаем кэш GPU
        torch.cuda.empty_cache()
        
        # Установка оптимальных размеров для операций свертки
        if hasattr(torch.backends.cudnn, 'allow_tf32'):
            # TF32 - формат, обеспечивающий хороший баланс между точностью и скоростью
            torch.backends.cudnn.allow_tf32 = True
            
        if hasattr(torch.backends, 'cuda'):
            if hasattr(torch.backends.cuda, 'matmul'):
                torch.backends.cuda.matmul.allow_tf32 = True
        
        # Логируем информацию о GPU
        device_name = torch.cuda.get_device_name(0)
        memory_allocated = torch.cuda.memory_allocated(0) / (1024 ** 2)  # MB
        memory_reserved = torch.cuda.memory_reserved(0) / (1024 ** 2)  # MB
        
        logging.info(f"GPU: {device_name}")
        logging.info(f"Память GPU: выделено {memory_allocated:.2f} MB, зарезервировано {memory_reserved:.2f} MB")
```

## Инкапсуляция в класс EmbeddingService

Для лучшей организации кода и управления жизненным циклом компонентов, предлагается инкапсулировать функциональность в класс:

```python
from typing import Dict, Union, List, Optional
import hashlib
import logging
import time
from collections import OrderedDict
import torch
import numpy as np
from sentence_transformers import SentenceTransformer, util
import pandas as pd

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
        
        # Инициализируем кэш
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
            logging.info(f"Модель '{self.model_name}' загружена на {self.device}")
            return model
        except Exception as e:
            logging.error(f"Ошибка инициализации модели: {e}", exc_info=True)
            raise
            
    def _optimize_cuda_settings(self):
        """Оптимизирует настройки CUDA для лучшей производительности."""
        if torch.cuda.is_available():
            torch.backends.cudnn.benchmark = True
            torch.cuda.empty_cache()
            
            if hasattr(torch.backends.cudnn, 'allow_tf32'):
                torch.backends.cudnn.allow_tf32 = True
            if hasattr(torch.backends, 'cuda'):
                if hasattr(torch.backends.cuda, 'matmul'):
                    torch.backends.cuda.matmul.allow_tf32 = True
                    
    def get_topic_embedding(self, topic_text: str):
        """
        Возвращает эмбеддинг для заданной темы, используя кэширование.
        
        Args:
            topic_text: Текст темы для анализа
            
        Returns:
            torch.Tensor: Эмбеддинг темы
        """
        # Хэшируем тему для использования в качестве ключа кэша
        topic_hash = hashlib.md5(topic_text.encode()).hexdigest()
        
        if topic_hash in self.topic_cache:
            return self.topic_cache[topic_hash]
            
        topic_input = [f"query: {topic_text}"]
        embedding = self.model.encode(topic_input, convert_to_tensor=True)
        
        # Кэшируем результат
        self.topic_cache[topic_hash] = embedding
        
        # Ограничиваем размер кэша тем (обычно их немного)
        if len(self.topic_cache) > 100:  # Фиксированный небольшой размер
            # Удаляем первый добавленный ключ
            oldest_key = next(iter(self.topic_cache))
            del self.topic_cache[oldest_key]
            
        return embedding
        
    def get_paragraph_embedding(self, text: str):
        """
        Возвращает эмбеддинг абзаца, используя кэширование.
        
        Args:
            text: Текст абзаца
            
        Returns:
            torch.Tensor: Эмбеддинг абзаца
        """
        # Хэшируем текст для использования в качестве ключа кэша
        text_hash = hashlib.md5(text.encode()).hexdigest()
        
        # Проверяем наличие в кэше
        cached_embedding = self.paragraph_cache.get(text_hash)
        if cached_embedding is not None:
            return cached_embedding
            
        # Вычисляем новый эмбеддинг
        passage_input = [f"passage: {text}"]
        embedding = self.model.encode(passage_input, convert_to_tensor=True)
        
        # Сохраняем в кэш
        self.paragraph_cache.put(text_hash, embedding)
        
        return embedding
        
    def clear_cache(self):
        """Очищает все кэши эмбеддингов."""
        self.paragraph_cache.clear()
        self.topic_cache.clear()
        logging.info("Кэши эмбеддингов очищены")
        
    def analyze_signal_strength_batch(self, df: pd.DataFrame, topic_prompt: str, 
                                    batch_size: int = 32) -> pd.DataFrame:
        """
        Рассчитывает значения signal_strength для всех абзацев в DataFrame.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        if 'text' not in df.columns:
            logging.error("Входной DataFrame не содержит колонку 'text'")
            df['signal_strength'] = pd.NA
            return df
            
        paragraph_texts = df['text'].tolist()
        num_paragraphs = len(paragraph_texts)
        
        if not topic_prompt:
            logging.warning("Тема не задана. Расчет сигнальности невозможен")
            df['signal_strength'] = pd.NA
            return df
        
        # Создаем копию DataFrame для атомарности операции
        result_df = df.copy()
        
        # Инициализируем результаты
        results_signal = [np.nan] * num_paragraphs
        
        try:
            # Получаем эмбеддинг темы
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            # Определяем оптимальный размер батча
            if self.device == 'cuda':
                actual_batch_size = min(batch_size, 64)
            else:
                actual_batch_size = min(batch_size, 16)
                
            # Замеряем время выполнения для профилирования
            start_time = time.time()
            logging.info(f"Расчет сигнальности: {num_paragraphs} абзацев, размер батча {actual_batch_size}")
            
            # Обработка батчами
            for i in range(0, num_paragraphs, actual_batch_size):
                batch_texts = paragraph_texts[i:i+actual_batch_size]
                
                # Проверяем наличие в кэше и собираем тексты для обработки
                batch_indices = []
                batch_to_process = []
                
                for j, text in enumerate(batch_texts):
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    cached_embedding = self.paragraph_cache.get(text_hash)
                    if cached_embedding is not None:
                        # Если эмбеддинг в кэше, сразу рассчитываем сходство
                        score = util.cos_sim(topic_embedding, cached_embedding)[0][0].item()
                        results_signal[i+j] = round(score, 3)
                    else:
                        # Иначе добавляем в список для батчевой обработки
                        batch_indices.append(j)
                        batch_to_process.append(text)
                
                # Если есть тексты для обработки
                if batch_to_process:
                    batch_inputs = [f"passage: {p}" for p in batch_to_process]
                    
                    # Вычисляем эмбеддинги для текущего батча
                    batch_embeddings = self.model.encode(batch_inputs, convert_to_tensor=True)
                    
                    # Рассчитываем косинусное сходство для текущего батча
                    batch_scores = util.cos_sim(topic_embedding, batch_embeddings)[0].cpu().tolist()
                    
                    # Записываем результаты и кэшируем эмбеддинги
                    for idx, (j, text) in enumerate(zip(batch_indices, batch_to_process)):
                        results_signal[i+j] = round(batch_scores[idx], 3)
                        
                        # Кэшируем эмбеддинг
                        text_hash = hashlib.md5(text.encode()).hexdigest()
                        self.paragraph_cache.put(text_hash, batch_embeddings[idx].unsqueeze(0))
            
            # После успешного завершения всех операций применяем результаты
            result_df['signal_strength'] = results_signal
            elapsed_time = time.time() - start_time
            logging.info(f"Расчет сигнальности завершен за {elapsed_time:.2f} сек")
            return result_df
            
        except Exception as e:
            logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
            # Возвращаем исходный DataFrame с пометкой ошибки
            df['signal_strength'] = pd.NA
            return df
            
    def analyze_signal_strength_incremental(self, df: pd.DataFrame, topic_prompt: str, 
                                          changed_indices: List[int] = None) -> pd.DataFrame:
        """
        Инкрементальный расчет signal_strength только для измененных абзацев.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            changed_indices: Список индексов измененных абзацев
            
        Returns:
            pd.DataFrame: DataFrame с обновленной колонкой 'signal_strength'
        """
        if 'text' not in df.columns:
            logging.error("Входной DataFrame не содержит колонку 'text'")
            df['signal_strength'] = pd.NA
            return df
            
        if not topic_prompt:
            logging.warning("Тема не задана. Расчет сигнальности невозможен")
            df['signal_strength'] = pd.NA
            return df
        
        # Если индексы не указаны, выполняем полный расчет
        if changed_indices is None or not changed_indices:
            return self.analyze_signal_strength_batch(df, topic_prompt)
        
        try:
            # Получаем эмбеддинг темы
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            start_time = time.time()
            # Обновляем только указанные абзацы
            for idx in changed_indices:
                if idx >= len(df):
                    logging.warning(f"Индекс {idx} вне границ DataFrame (размер: {len(df)})")
                    continue
                    
                text = df.iloc[idx]['text']
                passage_embedding = self.get_paragraph_embedding(text)
                
                # Рассчитываем косинусное сходство для одного абзаца
                score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
                df.at[idx, 'signal_strength'] = round(score, 3)
            
            elapsed_time = time.time() - start_time
            logging.info(f"Инкрементальный расчет для {len(changed_indices)} абзацев: {elapsed_time:.2f} сек")
            return df
        except Exception as e:
            logging.error(f"Ошибка при инкрементальном расчете: {e}", exc_info=True)
            return df
    
    async def analyze_signal_strength_async(self, df: pd.DataFrame, topic_prompt: str, 
                                         batch_size: int = 32) -> pd.DataFrame:
        """
        Асинхронный расчет signal_strength для неблокирующей обработки.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        loop = asyncio.get_event_loop()
        
        # Запускаем вычисления в отдельном потоке
        with ThreadPoolExecutor() as executor:
            result_df = await loop.run_in_executor(
                executor, 
                self.analyze_signal_strength_batch, 
                df, 
                topic_prompt,
                batch_size
            )
        
        return result_df
```

### Использование класса EmbeddingService

```python
# Создание сервиса
embedding_service = EmbeddingService(model_name='intfloat/multilingual-e5-large', cache_size=1000)

# Анализ текста
df = pd.DataFrame({'text': paragraph_texts})
result_df = embedding_service.analyze_signal_strength_batch(df, topic_prompt)

# Инкрементальное обновление
result_df = embedding_service.analyze_signal_strength_incremental(df, topic_prompt, [0, 2, 5])

# Асинхронный анализ
result_df = await embedding_service.analyze_signal_strength_async(df, topic_prompt)
```

## Полная оптимизированная версия модуля

Объединение всех оптимизаций в единый модуль.

```python
# signal_strength_optimized.py
from sentence_transformers import SentenceTransformer, util
import torch
import numpy as np
import logging
import pandas as pd
import hashlib
from functools import lru_cache
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Константы
MODEL_NAME = 'intfloat/multilingual-e5-large'
DEFAULT_BATCH_SIZE = 32
MAX_CACHE_SIZE = 1000

# Глобальные переменные
model = None
# Используем OrderedDict для реализации LRU-кэша вместо обычного словаря
from collections import OrderedDict

class LRUCache:
    """
    Реализация LRU-кэша (Least Recently Used) на основе OrderedDict.
    Более эффективна для сценариев анализа текста, чем простой FIFO-подход.
    """
    def __init__(self, capacity):
        self.cache = OrderedDict()
        self.capacity = capacity
        
    def get(self, key):
        if key not in self.cache:
            return None
        # Перемещаем элемент в конец (как недавно использованный)
        self.cache.move_to_end(key)
        return self.cache[key]
        
    def put(self, key, value):
        # Если ключ существует, обновляем его и перемещаем
        if key in self.cache:
            self.cache.move_to_end(key)
        # Добавляем новый ключ
        self.cache[key] = value
        # Удаляем старейший элемент при превышении емкости
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)
            
    def clear(self):
        """Очищает весь кэш"""
        self.cache.clear()
        
    def __len__(self):
        return len(self.cache)
        
    def __contains__(self, key):
        return key in self.cache

# Создаем экземпляр LRU-кэша
paragraph_embeddings_cache = LRUCache(MAX_CACHE_SIZE)

# Инициализация модели
def initialize_model():
    """Инициализирует модель для расчета эмбеддингов."""
    global model
    
    try:
        # Определяем устройство
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logging.info(f"Используется устройство: {device}")
        
        # Оптимизируем настройки CUDA если доступно
        if device == 'cuda':
            optimize_cuda_settings()
        
        # Загружаем модель
        model = SentenceTransformer(MODEL_NAME, device=device)
        logging.info(f"Модель '{MODEL_NAME}' успешно загружена на {device}")
        
        return True
    except Exception as e:
        logging.error(f"Ошибка инициализации модели: {e}", exc_info=True)
        model = None
        return False

def optimize_cuda_settings():
    """Оптимизирует настройки CUDA для GPU."""
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True
        torch.cuda.empty_cache()
        
        if hasattr(torch.backends.cudnn, 'allow_tf32'):
            torch.backends.cudnn.allow_tf32 = True
            
        if hasattr(torch.backends, 'cuda'):
            if hasattr(torch.backends.cuda, 'matmul'):
                torch.backends.cuda.matmul.allow_tf32 = True
        
        # Логируем информацию о GPU
        device_name = torch.cuda.get_device_name(0)
        memory_allocated = torch.cuda.memory_allocated(0) / (1024 ** 2)  # MB
        memory_reserved = torch.cuda.memory_reserved(0) / (1024 ** 2)  # MB
        
        logging.info(f"GPU: {device_name}")
        logging.info(f"Память GPU: выделено {memory_allocated:.2f} MB, зарезервировано {memory_reserved:.2f} MB")

# Функции кэширования
@lru_cache(maxsize=32)
def get_topic_embedding(topic_text):
    """Кэширует и возвращает эмбеддинг для заданной темы."""
    if model is None and not initialize_model():
        raise RuntimeError("Модель не инициализирована")
        
    topic_input = [f"query: {topic_text}"]
    return model.encode(topic_input, convert_to_tensor=True)

def get_paragraph_embedding(text):
    """Возвращает эмбеддинг абзаца из кэша или рассчитывает новый."""
    if model is None and not initialize_model():
        raise RuntimeError("Модель не инициализирована")
        
    # Создаем хеш текста как ключ кэша
    text_hash = hashlib.md5(text.encode()).hexdigest()
    
    # Проверяем наличие в кэше
    cached_embedding = paragraph_embeddings_cache.get(text_hash)
    if cached_embedding is not None:
        return cached_embedding
        
    # Вычисляем новый эмбеддинг и сохраняем в кэш
    passage_input = [f"passage: {text}"]
    embedding = model.encode(passage_input, convert_to_tensor=True)
    paragraph_embeddings_cache.put(text_hash, embedding)
        
    return embedding

def clear_embeddings_cache():
    """Очищает кэш эмбеддингов."""
    paragraph_embeddings_cache.clear()
    get_topic_embedding.cache_clear()
    logging.info("Кэш эмбеддингов очищен")

# Основные функции анализа
def analyze_signal_strength_batch(df: pd.DataFrame, topic_prompt: str, batch_size=DEFAULT_BATCH_SIZE) -> pd.DataFrame:
    """Оптимизированный расчет сигнальности с батчингом."""
    if 'text' not in df.columns:
        logging.error("Входной DataFrame не содержит колонку 'text'")
        df['signal_strength'] = pd.NA
        return df
        
    paragraph_texts = df['text'].tolist()
    num_paragraphs = len(paragraph_texts)
    
    if model is None and not initialize_model():
        logging.error("Модель не инициализирована")
        df['signal_strength'] = pd.NA
        return df
        
    if not topic_prompt:
        logging.warning("Тема не задана. Расчет сигнальности невозможен")
        df['signal_strength'] = pd.NA
        return df
    
    # Создаем копию DataFrame для атомарности операции
    result_df = df.copy()
    
    # Инициализируем результаты
    results_signal = [np.nan] * num_paragraphs
    
    try:
        # Эмбеддинг темы (кэшированный)
        topic_embedding = get_topic_embedding(topic_prompt)
        
        # Определяем оптимальный размер батча
        if torch.cuda.is_available():
            actual_batch_size = min(batch_size, 64)
        else:
            actual_batch_size = min(batch_size, 16)
            
        logging.info(f"Расчет сигнальности: {num_paragraphs} абзацев, размер батча {actual_batch_size}")
        
        # Обработка батчами
        for i in range(0, num_paragraphs, actual_batch_size):
            batch_texts = paragraph_texts[i:i+actual_batch_size]
            
            # Проверяем наличие в кэше и собираем тексты для обработки
            batch_indices = []
            batch_to_process = []
            
            for j, text in enumerate(batch_texts):
                text_hash = hashlib.md5(text.encode()).hexdigest()
                cached_embedding = paragraph_embeddings_cache.get(text_hash)
                if cached_embedding is not None:
                    # Если эмбеддинг в кэше, сразу рассчитываем сходство
                    score = util.cos_sim(topic_embedding, cached_embedding)[0][0].item()
                    results_signal[i+j] = round(score, 3)
                else:
                    # Иначе добавляем в список для батчевой обработки
                    batch_indices.append(j)
                    batch_to_process.append(text)
            
            # Если есть тексты для обработки
            if batch_to_process:
                batch_inputs = [f"passage: {p}" for p in batch_to_process]
                
                # Вычисляем эмбеддинги для текущего батча
                batch_embeddings = model.encode(batch_inputs, convert_to_tensor=True)
                
                # Рассчитываем косинусное сходство для текущего батча
                batch_scores = util.cos_sim(topic_embedding, batch_embeddings)[0].cpu().tolist()
                
                # Записываем результаты и кэшируем эмбеддинги
                for idx, (j, text) in enumerate(zip(batch_indices, batch_to_process)):
                    results_signal[i+j] = round(batch_scores[idx], 3)
                    
                    # Кэшируем эмбеддинг
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    paragraph_embeddings_cache.put(text_hash, batch_embeddings[idx].unsqueeze(0))
        
        # После успешного завершения всех операций применяем результаты к копии DataFrame
        result_df['signal_strength'] = results_signal
        logging.info("Расчет сигнальности завершен")
        return result_df
        
    except Exception as e:
        logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
        # Возвращаем исходный DataFrame с пометкой ошибки вместо частичных результатов
        df['signal_strength'] = pd.NA
        return df

def analyze_signal_strength_incremental(df: pd.DataFrame, topic_prompt: str, changed_indices=None) -> pd.DataFrame:
    """Инкрементальный расчет сигнальности только для измененных абзацев."""
    if 'text' not in df.columns:
        logging.error("Входной DataFrame не содержит колонку 'text'")
        df['signal_strength'] = pd.NA
        return df
        
    if model is None and not initialize_model():
        logging.error("Модель не инициализирована")
        df['signal_strength'] = pd.NA
        return df
        
    if not topic_prompt:
        logging.warning("Тема не задана. Расчет сигнальности невозможен")
        df['signal_strength'] = pd.NA
        return df
    
    # Если индексы не указаны, возвращаемся к полному пересчету
    if changed_indices is None:
        return analyze_signal_strength_batch(df, topic_prompt)
    
    # Получаем эмбеддинг темы (с кэшированием)
    try:
        topic_embedding = get_topic_embedding(topic_prompt)
        
        start_time = time.time()
        # Обновляем только указанные абзацы
        for idx in changed_indices:
            if idx >= len(df):
                logging.warning(f"Индекс {idx} вне границ DataFrame (размер: {len(df)})")
                continue
                
            text = df.iloc[idx]['text']
            passage_embedding = get_paragraph_embedding(text)
            
            # Рассчитываем косинусное сходство для одного абзаца
            score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
            df.at[idx, 'signal_strength'] = round(score, 3)
        
        logging.info(f"Инкрементальный расчет для {len(changed_indices)} абзацев: {time.time() - start_time:.2f} сек")
        return df
    except Exception as e:
        logging.error(f"Ошибка при инкрементальном расчете: {e}", exc_info=True)
        return df

async def analyze_signal_strength_async(df: pd.DataFrame, topic_prompt: str) -> pd.DataFrame:
    """Асинхронный расчет сигнальности для неблокирующей обработки."""
    loop = asyncio.get_event_loop()
    
    # Запускаем тяжелые вычисления в отдельном потоке
    with ThreadPoolExecutor() as executor:
        result_df = await loop.run_in_executor(
            executor, 
            analyze_signal_strength_batch, 
            df, 
            topic_prompt
        )
    
    return result_df

# Инициализация при импорте модуля
try:
    initialize_model()
except Exception as e:
    logging.error(f"Ошибка при инициализации модуля: {e}")
```

## Интеграция с React-фронтендом

Пример компонента, который обновляет текст и получает новые метрики через API.

```typescript
// ParagraphEditor.tsx
import React, { useState } from 'react';
import axios from 'axios';

interface ParagraphProps {
  id: number;
  text: string;
  signalStrength: number;
  onUpdate: (id: number, data: any) => void;
}

const ParagraphEditor: React.FC<ParagraphProps> = ({ id, text, signalStrength, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSave = async () => {
    if (text === editedText) {
      setIsEditing(false);
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await axios.post('/api/update-paragraph', {
        paragraph_id: id,
        new_text: editedText
      });
      
      onUpdate(id, response.data);
      setIsLoading(false);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating paragraph:', error);
      setIsLoading(false);
      // Можно добавить обработку ошибок
    }
  };
  
  return (
    <div className="paragraph-card">
      {isEditing ? (
        <>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            disabled={isLoading}
          />
          <div className="button-group">
            <button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Обновление...' : 'Сохранить'}
            </button>
            <button onClick={() => setIsEditing(false)} disabled={isLoading}>
              Отмена
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="paragraph-content" style={{ 
            backgroundColor: `rgba(255, 196, 0, ${signalStrength})` 
          }}>
            {text}
          </div>
          <div className="metrics">
            Signal Strength: {signalStrength.toFixed(3)}
          </div>
          <button onClick={() => setIsEditing(true)}>Редактировать</button>
        </>
      )}
    </div>
  );
};

export default ParagraphEditor;
```

## Полная оптимизированная версия модуля

Объединение всех оптимизаций в единый модуль:

```python
# signal_strength_optimized.py
from sentence_transformers import SentenceTransformer, util
import torch
import numpy as np
import logging
import pandas as pd
import hashlib
from functools import lru_cache
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time
from collections import OrderedDict
from typing import List, Optional, Dict, Union

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

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
            logging.info(f"Модель '{self.model_name}' загружена на {self.device}")
            return model
        except Exception as e:
            logging.error(f"Ошибка инициализации модели: {e}", exc_info=True)
            raise
            
    def _optimize_cuda_settings(self):
        """Оптимизирует настройки CUDA для лучшей производительности."""
        if torch.cuda.is_available():
            torch.backends.cudnn.benchmark = True
            torch.cuda.empty_cache()
            
            if hasattr(torch.backends.cudnn, 'allow_tf32'):
                torch.backends.cudnn.allow_tf32 = True
            if hasattr(torch.backends, 'cuda'):
                if hasattr(torch.backends.cuda, 'matmul'):
                    torch.backends.cuda.matmul.allow_tf32 = True
                    
    def get_topic_embedding(self, topic_text: str):
        """
        Возвращает эмбеддинг для заданной темы, используя кэширование.
        
        Args:
            topic_text: Текст темы для анализа
            
        Returns:
            torch.Tensor: Эмбеддинг темы
        """
        # Хэшируем тему для использования в качестве ключа кэша
        topic_hash = hashlib.md5(topic_text.encode()).hexdigest()
        
        if topic_hash in self.topic_cache:
            return self.topic_cache[topic_hash]
            
        topic_input = [f"query: {topic_text}"]
        embedding = self.model.encode(topic_input, convert_to_tensor=True)
        
        # Кэшируем результат
        self.topic_cache[topic_hash] = embedding
        
        # Ограничиваем размер кэша тем (обычно их немного)
        if len(self.topic_cache) > 100:  # Фиксированный небольшой размер
            # Удаляем первый добавленный ключ
            oldest_key = next(iter(self.topic_cache))
            del self.topic_cache[oldest_key]
            
        return embedding
        
    def get_paragraph_embedding(self, text: str):
        """
        Возвращает эмбеддинг абзаца, используя кэширование.
        
        Args:
            text: Текст абзаца
            
        Returns:
            torch.Tensor: Эмбеддинг абзаца
        """
        # Хэшируем текст для использования в качестве ключа кэша
        text_hash = hashlib.md5(text.encode()).hexdigest()
        
        # Проверяем наличие в кэше
        cached_embedding = self.paragraph_cache.get(text_hash)
        if cached_embedding is not None:
            return cached_embedding
            
        # Вычисляем новый эмбеддинг
        passage_input = [f"passage: {text}"]
        embedding = self.model.encode(passage_input, convert_to_tensor=True)
        
        # Сохраняем в кэш
        self.paragraph_cache.put(text_hash, embedding)
        
        return embedding
        
    def clear_cache(self):
        """Очищает все кэши эмбеддингов."""
        self.paragraph_cache.clear()
        self.topic_cache.clear()
        logging.info("Кэши эмбеддингов очищены")
        
    def analyze_signal_strength_batch(self, df: pd.DataFrame, topic_prompt: str, 
                                    batch_size: int = 32) -> pd.DataFrame:
        """
        Рассчитывает значения signal_strength для всех абзацев в DataFrame.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        if 'text' not in df.columns:
            logging.error("Входной DataFrame не содержит колонку 'text'")
            df['signal_strength'] = pd.NA
            return df
            
        paragraph_texts = df['text'].tolist()
        num_paragraphs = len(paragraph_texts)
        
        if not topic_prompt:
            logging.warning("Тема не задана. Расчет сигнальности невозможен")
            df['signal_strength'] = pd.NA
            return df
        
        # Создаем копию DataFrame для атомарности операции
        result_df = df.copy()
        
        # Инициализируем результаты
        results_signal = [np.nan] * num_paragraphs
        
        try:
            # Получаем эмбеддинг темы
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            # Определяем оптимальный размер батча
            if self.device == 'cuda':
                actual_batch_size = min(batch_size, 64)
            else:
                actual_batch_size = min(batch_size, 16)
                
            # Замеряем время выполнения для профилирования
            start_time = time.time()
            logging.info(f"Расчет сигнальности: {num_paragraphs} абзацев, размер батча {actual_batch_size}")
            
            # Обработка батчами
            for i in range(0, num_paragraphs, actual_batch_size):
                batch_texts = paragraph_texts[i:i+actual_batch_size]
                
                # Проверяем наличие в кэше и собираем тексты для обработки
                batch_indices = []
                batch_to_process = []
                
                for j, text in enumerate(batch_texts):
                    text_hash = hashlib.md5(text.encode()).hexdigest()
                    cached_embedding = self.paragraph_cache.get(text_hash)
                    if cached_embedding is not None:
                        # Если эмбеддинг в кэше, сразу рассчитываем сходство
                        score = util.cos_sim(topic_embedding, cached_embedding)[0][0].item()
                        results_signal[i+j] = round(score, 3)
                    else:
                        # Иначе добавляем в список для батчевой обработки
                        batch_indices.append(j)
                        batch_to_process.append(text)
                
                # Если есть тексты для обработки
                if batch_to_process:
                    batch_inputs = [f"passage: {p}" for p in batch_to_process]
                    
                    # Вычисляем эмбеддинги для текущего батча
                    batch_embeddings = self.model.encode(batch_inputs, convert_to_tensor=True)
                    
                    # Рассчитываем косинусное сходство для текущего батча
                    batch_scores = util.cos_sim(topic_embedding, batch_embeddings)[0].cpu().tolist()
                    
                    # Записываем результаты и кэшируем эмбеддинги
                    for idx, (j, text) in enumerate(zip(batch_indices, batch_to_process)):
                        results_signal[i+j] = round(batch_scores[idx], 3)
                        
                        # Кэшируем эмбеддинг
                        text_hash = hashlib.md5(text.encode()).hexdigest()
                        self.paragraph_cache.put(text_hash, batch_embeddings[idx].unsqueeze(0))
            
            # После успешного завершения всех операций применяем результаты
            result_df['signal_strength'] = results_signal
            elapsed_time = time.time() - start_time
            logging.info(f"Расчет сигнальности завершен за {elapsed_time:.2f} сек")
            return result_df
            
        except Exception as e:
            logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
            # Возвращаем исходный DataFrame с пометкой ошибки
            df['signal_strength'] = pd.NA
            return df
            
    def analyze_signal_strength_incremental(self, df: pd.DataFrame, topic_prompt: str, 
                                          changed_indices: List[int] = None) -> pd.DataFrame:
        """
        Инкрементальный расчет signal_strength только для измененных абзацев.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            changed_indices: Список индексов измененных абзацев
            
        Returns:
            pd.DataFrame: DataFrame с обновленной колонкой 'signal_strength'
        """
        if 'text' not in df.columns:
            logging.error("Входной DataFrame не содержит колонку 'text'")
            df['signal_strength'] = pd.NA
            return df
            
        if not topic_prompt:
            logging.warning("Тема не задана. Расчет сигнальности невозможен")
            df['signal_strength'] = pd.NA
            return df
        
        # Если индексы не указаны, выполняем полный расчет
        if changed_indices is None or not changed_indices:
            return self.analyze_signal_strength_batch(df, topic_prompt)
        
        try:
            # Получаем эмбеддинг темы
            topic_embedding = self.get_topic_embedding(topic_prompt)
            
            start_time = time.time()
            # Обновляем только указанные абзацы
            for idx in changed_indices:
                if idx >= len(df):
                    logging.warning(f"Индекс {idx} вне границ DataFrame (размер: {len(df)})")
                    continue
                    
                text = df.iloc[idx]['text']
                passage_embedding = self.get_paragraph_embedding(text)
                
                # Рассчитываем косинусное сходство для одного абзаца
                score = util.cos_sim(topic_embedding, passage_embedding)[0][0].item()
                df.at[idx, 'signal_strength'] = round(score, 3)
            
            elapsed_time = time.time() - start_time
            logging.info(f"Инкрементальный расчет для {len(changed_indices)} абзацев: {elapsed_time:.2f} сек")
            return df
        except Exception as e:
            logging.error(f"Ошибка при инкрементальном расчете: {e}", exc_info=True)
            return df
    
    async def analyze_signal_strength_async(self, df: pd.DataFrame, topic_prompt: str, 
                                         batch_size: int = 32) -> pd.DataFrame:
        """
        Асинхронный расчет signal_strength для неблокирующей обработки.
        
        Args:
            df: DataFrame с колонкой 'text'
            topic_prompt: Тема для анализа
            batch_size: Размер батча для обработки
            
        Returns:
            pd.DataFrame: DataFrame с добавленной колонкой 'signal_strength'
        """
        loop = asyncio.get_event_loop()
        
        # Запускаем вычисления в отдельном потоке
        with ThreadPoolExecutor() as executor:
            result_df = await loop.run_in_executor(
                executor, 
                self.analyze_signal_strength_batch, 
                df, 
                topic_prompt,
                batch_size
            )
        
        return result_df

# Создание синглтон-экземпляра для использования в приложении
_default_service = None

def get_default_embedding_service():
    """Возвращает глобальный экземпляр EmbeddingService (синглтон)."""
    global _default_service
    if _default_service is None:
        _default_service = EmbeddingService()
    return _default_service

# Для обратной совместимости - функциональный API, использующий сервис-синглтон
def analyze_signal_strength_batch(df: pd.DataFrame, topic_prompt: str, batch_size: int = 32) -> pd.DataFrame:
    """Функциональный API для batch анализа, использующий синглтон-сервис."""
    service = get_default_embedding_service()
    return service.analyze_signal_strength_batch(df, topic_prompt, batch_size)

def analyze_signal_strength_incremental(df: pd.DataFrame, topic_prompt: str, 
                                     changed_indices: List[int] = None) -> pd.DataFrame:
    """Функциональный API для инкрементального анализа, использующий синглтон-сервис."""
    service = get_default_embedding_service()
    return service.analyze_signal_strength_incremental(df, topic_prompt, changed_indices)

async def analyze_signal_strength_async(df: pd.DataFrame, topic_prompt: str, 
                                     batch_size: int = 32) -> pd.DataFrame:
    """Функциональный API для асинхронного анализа, использующий синглтон-сервис."""
    service = get_default_embedding_service()
    return await service.analyze_signal_strength_async(df, topic_prompt, batch_size)

def clear_embeddings_cache():
    """Очищает кэш эмбеддингов в синглтон-сервисе."""
    service = get_default_embedding_service()
    service.clear_cache()
```

## Требования к системе

1. Минимум 8 ГБ ОЗУ для использования CPU
2. Для GPU-ускорения: совместимая с CUDA видеокарта с минимум 4 ГБ VRAM
3. Python 3.8 или выше
4. Достаточно свободного места на диске для кэширования моделей (около 2 ГБ)
5. Redis (опционально для многопроцессорной среды)

## Заключение

Предложенные оптимизации значительно улучшат производительность расчета сигнал/шум, особенно в интерактивном режиме. Основные улучшения:

1. **Снижение нагрузки на CPU/GPU** за счет эффективного LRU-кэширования эмбеддингов
2. **Быстрое обновление UI** за счет инкрементальной обработки измененных абзацев
3. **Эффективное использование аппаратных ресурсов** через оптимальный батчинг
4. **Атомарность операций** благодаря копированию DataFrame для предотвращения частичных результатов
5. **Отзывчивость интерфейса** за счет асинхронной обработки в отдельных потоках
6. **Улучшенная масштабируемость** через инкапсуляцию в класс и использование Redis для межпроцессного взаимодействия

Для дальнейшей оптимизации рекомендуется рассмотреть:

1. **Предварительное вычисление эмбеддингов** для часто встречающихся текстов или фраз
2. **Таймаут-стратегии для запросов** для прерывания слишком долгих вычислений
3. **Адаптивные размеры батча** в зависимости от доступной памяти и CPU/GPU мощности
4. **Интеграция с системами мониторинга** (Prometheus, Grafana) для отслеживания производительности
5. **Ведение метрик использования** (cache hit rate, время вычисления, использование памяти)
6. **Добавление версионирования кэша** для инвалидации при обновлении моделей
7. **Компрессия эмбеддингов** для снижения объема памяти и сетевого трафика

Использование данного решения обеспечит быструю и эффективную работу с функцией сигнал/шум даже при интенсивном интерактивном взаимодействии пользователя с текстом.
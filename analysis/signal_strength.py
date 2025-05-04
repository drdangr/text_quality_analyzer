from sentence_transformers import SentenceTransformer, util
import torch
import numpy as np
import logging
import pandas as pd

# Загружаем модель один раз при импорте модуля
# Используем рекомендованную модель intfloat/multilingual-e5-large
MODEL_NAME = 'intfloat/multilingual-e5-large'
model = None
try:
    # Определяем устройство
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logging.info(f"Device set to use {device}")
    model = SentenceTransformer(MODEL_NAME, device=device)
    logging.info(f"Модель Signal Strength '{MODEL_NAME}' загружена на {device}.")
except Exception as e:
    logging.error(f"Ошибка загрузки модели SentenceTransformer '{MODEL_NAME}': {e}")
    model = None # Убедимся, что модель None в случае ошибки

def analyze_signal_strength_batch(df: pd.DataFrame, topic_prompt: str) -> pd.DataFrame:
    """Рассчитывает косинусную близость к теме для параграфов в DataFrame.

    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'.
        topic_prompt: Строка с темой.

    Returns:
        pandas.DataFrame с добавленной колонкой 'signal_strength'.
        В случае ошибки колонка 'signal_strength' будет заполнена NaN.
    """
    if 'text' not in df.columns:
        logging.error("Входной DataFrame для signal_strength не содержит колонку 'text'.")
        df['signal_strength'] = pd.NA
        return df
        
    paragraph_texts = df['text'].tolist()
    num_paragraphs = len(paragraph_texts)
    
    if model is None:
        logging.error("Модель Signal Strength не загружена. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
        
    if not topic_prompt:
        logging.warning("Тема (topic_prompt) не задана. Расчет сигнальности невозможен.")
        df['signal_strength'] = pd.NA
        return df
        
    # Добавляем префиксы согласно документации модели e5
    topic_input = [f"query: {topic_prompt}"] 
    passage_inputs = [f"passage: {p}" for p in paragraph_texts]
    
    results_signal = [np.nan] * num_paragraphs # Инициализируем NaN
    
    try:
        logging.info(f"Вычисление эмбеддинга для темы: '{topic_prompt[:50]}...'")
        topic_embedding = model.encode(topic_input, convert_to_tensor=True)
        
        logging.info(f"Вычисление эмбеддингов для {len(passage_inputs)} параграфов...")
        passage_embeddings = model.encode(passage_inputs, convert_to_tensor=True, show_progress_bar=True)
        
        cosine_scores = util.cos_sim(topic_embedding, passage_embeddings)
        similarity_list = cosine_scores[0].cpu().tolist()
        results_signal = [round(score, 3) for score in similarity_list]
        logging.info("Расчет сигнальности завершен.")
        
    except Exception as e:
        logging.error(f"Ошибка при расчете сигнальности: {e}", exc_info=True)
        # results_signal уже содержит NaN
        
    # Добавляем результаты как новую колонку к DataFrame
    df['signal_strength'] = results_signal
    return df # Возвращаем обновленный DataFrame

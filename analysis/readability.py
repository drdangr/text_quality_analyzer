# Readability module placeholder
from textstat import textstat
import re
import numpy as np # Добавляем numpy для усреднения и clip
import math  # Для sqrt в SMOG
import string # Для очистки пунктуации
from rusenttokenize import ru_sent_tokenize # Добавляем импорт
import logging
import pandas as pd # Добавляем pandas

# Получаем логгер для этого модуля (лучше делать так, чем logging.error и т.д. напрямую)
logger = logging.getLogger(__name__)

# Определяем шкалы здесь, чтобы они были доступны всем функциям
SCALE_LIX = (0, 80)
SCALE_SMOG = (3, 20)

def normalize_metric(value, min_val, max_val):
    """Нормализует значение по заданной шкале, обрезая выходы за границы."""
    if value is None: # Если метрика не посчиталась
        return None
    clipped_value = np.clip(value, min_val, max_val)
    if max_val == min_val:
        return 0.0
    return round((clipped_value - min_val) / (max_val - min_val), 3)

def count_russian_syllables(word):
    """Считает слоги в русском слове по количеству гласных букв."""
    vowels = "аеёиоуыэюя"
    word = word.lower()
    count = 0
    for char in word:
        if char in vowels:
            count += 1
    # Простое правило: если гласных нет, считаем 1 слог (для аббревиатур и т.п.)
    return count if count > 0 else 1

def russian_smog_index(text):
    """Расчитывает индекс SMOG для русского текста.

    Использует rusenttokenize для предложений и re.findall для слов.
    Возвращает кортеж (smog_value, is_valid).
    is_valid = True, если в тексте >= 3 предложений.
    """
    if not text or pd.isna(text):
        return None, False
    try:
        sentences = ru_sent_tokenize(text)
    except Exception as e:
        logger.warning(f"Ошибка токенизации предложений (rusenttokenize) для SMOG: {e}. Текст: '{str(text)[:50]}...'")
        return None, False

    num_sentences = len(sentences)
    is_valid = num_sentences >= 3
    if num_sentences == 0:
        return None, False

    # 2. Извлекаем слова (кириллица, >= 2 букв)
    # Применяем ко всему тексту, т.к. SMOG смотрит на весь текст
    words = re.findall(r"[а-яёА-ЯЁ]{2,}", text)
    if not words:
        return None, is_valid # Не можем считать без слов

    # 3. Считаем сложные слова (>= 3 слогов)
    polysyllable_count = 0
    for word in words:
        syllables = count_russian_syllables(word)
        if syllables >= 3:
            polysyllable_count += 1

    # 4. Применяем формулу SMOG
    try:
        # Обеспечиваем, что деления на 0 не будет (проверили num_sentences)
        # Добавляем небольшое значение к знаменателю на случай, если num_sentences < 30,
        # чтобы избежать слишком больших значений под корнем, хотя нормализация должна это сгладить.
        # Формула ожидает минимум 30 предложений, но мы адаптируем.
        smog_raw = polysyllable_count * (30 / num_sentences)
        smog = 1.043 * math.sqrt(smog_raw) + 3.1291
        return round(smog, 3), is_valid
    except (ValueError, ZeroDivisionError) as e: 
        logger.warning(f"Ошибка вычисления SMOG (polysyllables: {polysyllable_count}, sentences: {num_sentences}): {e}. Текст: '{str(text)[:50]}...'")
        return None, is_valid

def russian_lix_index(text):
    """Расчитывает индекс LIX для русского текста по формуле из документации."""
    if not text or pd.isna(text):
        return None
    try:
        sentences = ru_sent_tokenize(text)
    except Exception as e:
        logger.warning(f"Ошибка токенизации предложений (rusenttokenize) для LIX: {e}. Текст: '{str(text)[:50]}...'")
        return None

    num_sentences = len(sentences)
    if num_sentences == 0:
        return None

    # 2. Извлекаем слова (только кириллические последовательности >= 2 букв)
    # Изменяем на такое же извлечение, как в SMOG, для консистентности
    words = re.findall(r"[а-яёА-ЯЁ]{2,}", text)
    num_words = len(words)
    if num_words == 0:
        return None

    # 3. Считаем длинные слова (> 6 букв)
    num_long_words = sum(1 for word in words if len(word) > 6)

    # 4. Применяем формулу LIX
    try:
        lix = (num_words / num_sentences) + 100 * (num_long_words / num_words)
        return round(lix, 3)
    except ZeroDivisionError:
        logger.warning(f"Ошибка вычисления LIX (деление на ноль). Слов: {num_words}, Предложений: {num_sentences}. Текст: '{str(text)[:50]}...'")
        return None

def normalize_score(score, min_val, max_val):
    """Нормализует значение по заданной шкале [0, 1], обрезая выходы за границы.
       Работает с np.nan."""
    if pd.isna(score): # Используем pd.isna для проверки на None и np.nan
        return np.nan
    clipped_value = np.clip(score, min_val, max_val)
    if max_val == min_val:
        # Избегаем деления на ноль, если шкала имеет нулевую длину
        return 0.0 if clipped_value == min_val else 1.0 # Или другое поведение по умолчанию
    return round((clipped_value - min_val) / (max_val - min_val), 3)

def calculate_complexity(lix, smog, smog_valid):
    """Рассчитывает итоговую сложность на основе LIX и SMOG.
       SMOG используется только если smog_valid=True.
       Работает с np.nan."""
    norm_lix = normalize_score(lix, *SCALE_LIX)
    # Нормализуем SMOG только если он валиден
    norm_smog = normalize_score(smog, *SCALE_SMOG) if smog_valid else np.nan

    # Собираем валидные (не NaN) нормализованные значения
    valid_scores = []
    if not pd.isna(norm_lix):
        valid_scores.append(norm_lix)
    if not pd.isna(norm_smog):
        valid_scores.append(norm_smog)

    # Исправляем проверку: используем len() для списка
    if len(valid_scores) > 0:
        # Считаем среднее только по валидным значениям
        return round(np.mean(valid_scores).item(), 3) # .item() для преобразования в Python float
    else:
        # Если обе метрики NaN, возвращаем NaN
        return np.nan

def analyze_readability_batch(df: pd.DataFrame, update_only: bool = False) -> pd.DataFrame:
    """Рассчитывает метрики читаемости для параграфов во входном DataFrame.

    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'.
        update_only: Если True, функция вернет DataFrame, содержащий только 
                     обработанные строки с новыми/обновленными метриками. 
                     Если False (по умолчанию), вернет копию всего входного 
                     DataFrame с добавленными/обновленными метриками.

    Returns:
        pandas.DataFrame с колонками 'lix', 'smog', 'complexity'.
    """
    if 'text' not in df.columns:
        logger.error("Входной DataFrame для readability не содержит колонку 'text'.")
        # В зависимости от update_only, возвращаем либо пустой DF с нужными колонками, либо исходный с пустыми колонками
        empty_metrics_df = pd.DataFrame(columns=['lix', 'smog', 'complexity'])
        if update_only:
            # Для update_only, если нет 'text', нечего обновлять, возвращаем пустой DF с колонками метрик
            # или можно вернуть df.iloc[0:0] скопировав колонки из df и добавив метрики?
            # Безопаснее вернуть DataFrame только с колонками метрик, чтобы не смешивать.
            # Оркестратор ожидает метрики.
            # Если df был пуст (df.iloc[[idx]]), он будет пуст и тут.
            return df.assign(lix=pd.NA, smog=pd.NA, complexity=pd.NA) if not df.empty else empty_metrics_df
        else:
            # Для полного анализа, добавляем пустые колонки к копии исходного df
            result_df = df.copy()
            result_df['lix'] = pd.NA
            result_df['smog'] = pd.NA
            result_df['complexity'] = pd.NA
            return result_df
        
    # Создаем копию для работы, чтобы не изменять оригинал, если update_only=False
    # Если update_only=True, мы все равно создаем копию, чтобы вернуть только нужные строки/колонки.
    # Входной df может быть срезом (одна строка для инкрементального), 
    # и мы хотим вернуть такой же срез, но с метриками.
    # Поэтому работаем с result_df, который является копией входного df.
    result_df = df.copy() 

    # Инициализируем колонки метрик в result_df, если их нет
    for col in ['lix', 'smog', 'complexity']:
        if col not in result_df.columns:
            result_df[col] = pd.NA

    texts_to_process = result_df['text'].tolist()
    indices_to_process = result_df.index.tolist() # Сохраняем исходные индексы

    # Временные списки для результатов этого батча (по индексам из result_df)
    lix_values = pd.Series([np.nan] * len(texts_to_process), index=indices_to_process, dtype=float)
    smog_values = pd.Series([np.nan] * len(texts_to_process), index=indices_to_process, dtype=float)
    complexity_values = pd.Series([np.nan] * len(texts_to_process), index=indices_to_process, dtype=float)

    for i, original_idx in enumerate(indices_to_process):
        text = texts_to_process[i]
        
        if not text or pd.isna(text):
            logger.debug(f"Параграф с индексом {original_idx} пуст или NaN, пропуск расчета читаемости.")
            continue
        
        current_lix = np.nan
        current_smog = np.nan
        smog_is_valid = False
        current_complexity = np.nan

        try:
            current_lix = russian_lix_index(text)
        except Exception as e:
            logger.warning(f"Ошибка расчета LIX для параграфа (индекс {original_idx}): {e}. Текст: '{str(text)[:50]}...'")

        try:
            current_smog, smog_is_valid = russian_smog_index(text)
            if current_smog is None: # russian_smog_index может вернуть None
                current_smog = np.nan 
        except Exception as e:
            logger.warning(f"Ошибка расчета SMOG для параграфа (индекс {original_idx}): {e}. Текст: '{str(text)[:50]}...'")

        try:
            current_complexity = calculate_complexity(current_lix, current_smog, smog_is_valid)
        except Exception as e:
            logger.warning(f"Ошибка расчета Complexity для параграфа (индекс {original_idx}): {e}")

        lix_values.loc[original_idx] = round(current_lix, 3) if not pd.isna(current_lix) else np.nan
        smog_values.loc[original_idx] = round(current_smog, 3) if not pd.isna(current_smog) else np.nan
        complexity_values.loc[original_idx] = round(current_complexity, 3) if not pd.isna(current_complexity) else np.nan
        
        logger.debug(f"Параграф (индекс {original_idx}): LIX={lix_values.loc[original_idx]}, SMOG={smog_values.loc[original_idx]}, Complexity={complexity_values.loc[original_idx]}")

    # Обновляем/добавляем колонки в result_df
    result_df['lix'] = lix_values
    result_df['smog'] = smog_values
    result_df['complexity'] = complexity_values
    
    if update_only:
        # Возвращаем DataFrame, содержащий только те строки, что были на входе (result_df)
        # но только с нужными колонками (исходные + метрики)
        # Если исходный df имел другие колонки, они сохранятся в result_df.
        return result_df 
    else:
        # Для полного анализа, мы уже работали с копией df (result_df), так что просто возвращаем ее.
        # Это гарантирует, что если df имел другие колонки, они сохранятся.
        return result_df

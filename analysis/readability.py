# Readability module placeholder
from textstat import textstat
import re
import numpy as np # Добавляем numpy для усреднения и clip
import math  # Для sqrt в SMOG
import string # Для очистки пунктуации
from rusenttokenize import ru_sent_tokenize # Добавляем импорт
import logging
import pandas as pd # Добавляем pandas

# Определяем шкалы здесь, чтобы они были доступны всем функциям
SCALE_LIX = (0, 80)
SCALE_SMOG = (3, 20)

def split_into_paragraphs(text):
    # Разделение текста по пустым строкам
    return [p.strip() for p in text.split("\n\n") if p.strip()]

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
    if not text:
        return None, False

    # 1. Разбиваем на предложения с помощью rusenttokenize
    try:
        sentences = ru_sent_tokenize(text)
    except Exception as e:
        print(f"Error tokenizing sentences with rusenttokenize: {e}")
        # Можно вернуться к простому сплиту как fallback?
        # sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        return None, False # Пока просто возвращаем ошибку

    num_sentences = len(sentences)
    is_valid = num_sentences >= 3

    # Если предложений меньше 3, сам индекс считать невалидным, но можем посчитать для информации
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
    except ValueError: # На случай отрицательного значения под корнем (не должно быть)
        print(f"ValueError during SMOG calculation (sqrt negative?). Polysyllables: {polysyllable_count}, Sentences: {num_sentences}")
        return None, is_valid
    except ZeroDivisionError:
         print(f"ZeroDivisionError during SMOG calculation. Should not happen here.")
         return None, is_valid

def russian_lix_index(text):
    """Расчитывает индекс LIX для русского текста по формуле из документации."""
    if not text:
        return None

    # 1. Разбиваем на предложения (используем rusenttokenize)
    try:
        sentences = ru_sent_tokenize(text)
    except Exception as e:
        print(f"Error tokenizing sentences with rusenttokenize for LIX: {e}")
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
        return None

def split_into_sentences_ru(text):
    """Разбивает текст на предложения с помощью rusenttokenize."""
    try:
        return ru_sent_tokenize(text)
    except Exception as e:
        logging.error(f"Ошибка токенизации предложений: {e}")
        # Простой fallback
        sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        logging.warning("Использован fallback для разбиения на предложения.")
        return sentences

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
        return round(np.mean(valid_scores), 3)
    else:
        # Если обе метрики NaN, возвращаем NaN
        return np.nan

def analyze_readability_batch(df: pd.DataFrame) -> pd.DataFrame:
    """Рассчитывает метрики читаемости для списка параграфов во входном DataFrame.

    Args:
        df: pandas.DataFrame с обязательной колонкой 'text'.

    Returns:
        pandas.DataFrame с добавленными колонками 
        'lix', 'smog', 'complexity'.
    """
    if 'text' not in df.columns:
        logging.error("Входной DataFrame для readability не содержит колонку 'text'.")
        # Возвращаем исходный df или добавляем пустые колонки?
        # Лучше добавить пустые, чтобы не сломать дальнейший пайплайн
        df['lix'] = pd.NA
        df['smog'] = pd.NA
        df['complexity'] = pd.NA
        return df
        
    paragraph_texts = df['text'].tolist()
    num_paragraphs = len(paragraph_texts)
    results_lix = [np.nan] * num_paragraphs
    results_smog = [np.nan] * num_paragraphs
    results_complexity = [np.nan] * num_paragraphs

    for i, text in enumerate(paragraph_texts):
        if not text or pd.isna(text): # Пропускаем пустые или NaN параграфы
            logging.debug(f"Параграф {i+1} пуст или NaN, пропуск расчета читаемости.")
            continue
        
        smog_is_valid = False
        lix_value = np.nan
        smog_value = np.nan
        complexity_value = np.nan

        try:
            lix_value = russian_lix_index(text)
        except Exception as e:
            logging.warning(f"Ошибка расчета LIX для параграфа {i+1}: {e}. Текст: '{str(text)[:50]}...'")

        try:
            smog_value, smog_is_valid = russian_smog_index(text)
            if smog_value is None:
                smog_value = np.nan 
        except Exception as e:
            logging.info(f"Не удалось рассчитать SMOG для параграфа {i+1}: {e}. Текст: '{str(text)[:50]}...'")

        try:
            complexity_value = calculate_complexity(lix_value, smog_value, smog_is_valid)
        except Exception as e:
            logging.warning(f"Ошибка расчета Complexity для параграфа {i+1}: {e}")

        # Записываем результаты в списки
        results_lix[i] = round(lix_value, 3) if not pd.isna(lix_value) else np.nan
        results_smog[i] = round(smog_value, 3) if not pd.isna(smog_value) else np.nan
        results_complexity[i] = round(complexity_value, 3) if not pd.isna(complexity_value) else np.nan
        
        logging.debug(f"Параграф {i+1}: LIX={results_lix[i]}, SMOG={results_smog[i]}, Complexity={results_complexity[i]}")

    # Добавляем результаты как новые колонки к исходному DataFrame
    df['lix'] = results_lix
    df['smog'] = results_smog
    df['complexity'] = results_complexity
    
    return df # Возвращаем обновленный DataFrame

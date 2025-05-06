# Semantic_function module placeholder

from transformers import pipeline
import torch # Убедимся, что torch импортирован для проверки доступности GPU
import config # Импортируем config для доступа к теме (хотя лучше передавать аргументом)
import os
import logging
from dotenv import load_dotenv
import re # Добавляем re для парсера
from typing import List, Dict, Tuple # Добавляем типизацию
import pandas as pd # Добавляем pandas для prepare_numbered_text_block

try:
    import openai # Оставляем импорт openai
except ImportError:
    # Логирование ошибки теперь в utils/openai_client.py
    # logging.error("Библиотека openai не установлена...")
    openai = None

# 1. Словарь меток и гипотез
LABEL_SYNONYMS = {
    # Метки, ЗАВИСЯЩИЕ от темы
    "раскрытие темы": [
        "объясняет суть темы",
        "развивает тему",
        "непосредственно относится к теме",
        "конкретизирует тему",
        "продолжает изложение темы"
    ],
    "пояснение на примере": [
        "разъясняет тему через пример",
        "иллюстрирует тему",
        "объясняет идею с помощью аналога",
        "даёт пример по теме",
        "конкретизирует тему бытовой ситуацией"
    ],
    "лирическое отступление": [
        "это содержательное отступление от темы",
        "философское или культурное отступление",
        "не о теме напрямую, но создаёт глубину",
        "содержит мысль, не связанную с темой напрямую",
        "расширяет контекст, отступая от основной линии"
    ],
    # Метки, НЕ ЗАВИСЯЩИЕ от темы
    "метафора": [
        "это метафора",
        "это образное выражение",
        "это переносный смысл",
        "это поэтическое сравнение",
        "это аналогия"
    ],
    "юмор": [
        "это юмор",
        "это ирония",
        "это шутка",
        "это сарказм",
        "это комическая вставка"
    ]
}

# 2. Модель и ДВА шаблона
MODEL_NAME = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
TEMPLATE_WITH_TOPIC = "Этот фрагмент касается темы '{topic}' и {{}}."
TEMPLATE_NEUTRAL = "Этот фрагмент является {}."

# 3. Загружаем модель
classifier = None
try:
    device_id = 0 if torch.cuda.is_available() else -1
    classifier = pipeline(
        "zero-shot-classification",
        model=MODEL_NAME,
        device=device_id
    )
    print(f"Zero-shot classifier '{MODEL_NAME}' loaded successfully on device: {'GPU' if device_id == 0 else 'CPU'}.")
except Exception as e:
    print(f"Error loading zero-shot classification pipeline '{MODEL_NAME}': {e}")
    print("Semantic function analysis will not be available.")

# 4. Функция принимает topic_prompt
def analyze_semantic_function(paragraph_text, topic_prompt):
    """Анализирует семантическую функцию параграфа, используя разные шаблоны гипотез
    для разных типов меток."""
    if classifier is None:
        print("Zero-shot classifier not loaded. Skipping semantic analysis.")
        return {"semantic_function": "error", "probabilities": {}}

    if not paragraph_text:
        return {"semantic_function": "empty", "probabilities": {}}

    # Словарь для хранения максимальных score для каждой ОСНОВНОЙ метки
    aggregated_scores = {}

    try:
        # 5. Итерируем по основным меткам
        for main_label, synonym_hypotheses in LABEL_SYNONYMS.items():

            # 6. Выбираем правильный шаблон и форматируем его
            current_template = ""
            if main_label in ["раскрытие темы", "пояснение на примере", "лирическое отступление"]:
                if not topic_prompt:
                    print(f"Warning: Topic prompt is empty for topic-dependent label '{main_label}'. Using neutral template.")
                    current_template = TEMPLATE_NEUTRAL
                else:
                    # Используем f-string для подстановки темы, экранируя фигурные скобки для format пайплайна
                    current_template = TEMPLATE_WITH_TOPIC.format(topic=topic_prompt)
            else: # Для метафоры и юмора
                current_template = TEMPLATE_NEUTRAL

            # 7. Выполняем классификацию для текущей основной метки и ее синонимов
            results = classifier(
                paragraph_text,
                synonym_hypotheses, # Передаем синонимы ТОЛЬКО для этой метки
                hypothesis_template=current_template, # Передаем СООТВЕТСТВУЮЩИЙ шаблон
                multi_label=True
            )

            # 8. Находим максимальный score среди синонимов этой метки
            max_score_for_label = 0.0
            if results and 'scores' in results:
                 max_score_for_label = max(results['scores'])

            aggregated_scores[main_label] = round(max_score_for_label, 3)

        # 9. Находим основную метку с наивысшим агрегированным score
        if not aggregated_scores:
            top_main_label = "error"
        else:
            top_main_label = max(aggregated_scores, key=aggregated_scores.get)

        print(f"    Семантическая функция: {top_main_label} (max_score: {aggregated_scores.get(top_main_label, 0.0):.3f})")

        return {
            "semantic_function": top_main_label,
            "probabilities": aggregated_scores
        }

    except Exception as e:
        print(f"Error during semantic function analysis for paragraph '{paragraph_text[:50]}...': {e}")
        return {"semantic_function": "error", "probabilities": {}}

# --- Конфигурация для Локального Fallback Метода ---
LABEL_SYNONYMS_LOCAL = {
    # (Словарь с 5 метками и их синонимами, как в предыдущей версии)
    "раскрытие темы": [
        "объясняет суть темы", "развивает тему", "непосредственно относится к теме",
        "конкретизирует тему", "продолжает изложение темы"
    ],
    "пояснение на примере": [
        "разъясняет тему через пример", "иллюстрирует тему", "объясняет идею с помощью аналога",
        "даёт пример по теме", "конкретизирует тему бытовой ситуацией"
    ],
    "метафора": [
        "это метафора", "это образное выражение", "это переносный смысл",
        "это поэтическое сравнение", "это аналогия"
    ],
    "юмор": [
        "это юмор", "это ирония", "это шутка",
        "это сарказм", "это комическая вставка"
    ],
    "лирическое отступление": [
        "это содержательное отступление от темы", "философское или культурное отступление", "не о теме напрямую, но создаёт глубину",
        "содержит мысль, не связанную с темой напрямую", "расширяет контекст, отступая от основной линии"
    ]
}
MODEL_NAME_LOCAL = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
TEMPLATE_WITH_TOPIC_LOCAL = "Этот фрагмент касается темы '{topic}' и {{}}."
TEMPLATE_NEUTRAL_LOCAL = "Этот фрагмент является {}."

# Загружаем локальную модель для fallback
local_classifier = None
try:
    if 'pipeline' in globals() and callable(pipeline):
        device_id = 0 if torch.cuda.is_available() else -1
        device_name = 'GPU' if device_id == 0 else 'CPU'
        print(f"Загрузка локального классификатора '{MODEL_NAME_LOCAL}' на {device_name}...")
        local_classifier = pipeline(
            "zero-shot-classification",
            model=MODEL_NAME_LOCAL,
            device=device_id
        )
        logging.info(f"Локальный классификатор '{MODEL_NAME_LOCAL}' загружен на {device_name}.")
    else:
        logging.warning("Не удалось загрузить локальный классификатор: функция 'pipeline' не найдена.")
except Exception as e:
    logging.error(f"Ошибка загрузки локального классификатора '{MODEL_NAME_LOCAL}': {e}")
# ----------------------------------------------------

# --- Конфигурация для API Метода ---
API_MODEL_NAME = "gpt-4o" # или gpt-4-turbo
API_TEMPERATURE = 0.3
API_LABELS = list(LABEL_SYNONYMS_LOCAL.keys()) # Используем те же основные метки
API_LABEL_DESCRIPTIONS = {
    # Метки, ЗАВИСЯЩИЕ от темы
    "раскрытие темы": "Этот фрагмент раскрывает тему '{}'",
    "пояснение на примере": "Этот фрагмент иллюстрирует тему '{}' на примере",
    "лирическое отступление": "Это содержательное отступление от темы '{}'",
    "ключевой тезис": "Этот фрагмент формулирует основную мысль по теме '{}'",
    "шум": "Этот фрагмент не относится к теме '{}'",
    # Метки, НЕ ЗАВИСЯЩИЕ от темы
    "метафора / аналогия": "Это метафора или аналогия",
    "юмор / ирония / сарказм": "Это юмор, ирония или сарказм",
    "связующий переход": "Это связующий переход между частями текста",
    "смена темы": "Этот фрагмент обозначает смену темы",
    "противопоставление / контраст": "Этот фрагмент содержит противопоставление или контраст"
}

# Возвращаем определение списка меток, зависящих от темы
TOPIC_DEPENDENT_LABELS = ["раскрытие темы", "пояснение на примере", "лирическое отступление", "ключевой тезис", "шум"]

# --- Новые вспомогательные функции --- 
def prepare_numbered_text_block(paragraph_texts: List[str]) -> str:
    """Нумерует параграфы и объединяет их в один блок текста."""
    numbered_items = [f"{i+1}. {text}" for i, text in enumerate(paragraph_texts)]
    return "\n\n".join(numbered_items)

def parse_gpt_response(response_text: str, expected_count: int) -> List[str]:
    """Парсит ответ GPT, ожидая строки вида 'N. Метка'."""
    parsed_labels = {} # Словарь для хранения {номер: метка}
    lines = response_text.strip().split('\n')
    pattern = re.compile(r"^\s*(\d+)\.\s*(.+?)\s*$") # N. Метка (с возможными пробелами)

    for line in lines:
        match = pattern.match(line)
        if match:
            try:
                paragraph_num = int(match.group(1))
                label = match.group(2).strip() # Убираем лишние пробелы у метки
                # Проверка, что метка валидна (известна)
                if label in API_LABELS:
                     parsed_labels[paragraph_num] = label
                else:
                    logging.warning(f"[Парсер API] Неизвестная метка '{label}' для параграфа {paragraph_num} в строке: '{line}'")
            except ValueError:
                logging.warning(f"[Парсер API] Не удалось извлечь номер параграфа из строки: '{line}'")
        else:
            # Логируем только непустые строки, которые не совпали
            if line.strip(): 
                logging.warning(f"[Парсер API] Строка не соответствует формату 'N. Метка': '{line}'")

    # Собираем результат в нужном порядке, заполняя пропуски
    result_list = [parsed_labels.get(i + 1, "parsing_error") for i in range(expected_count)]
    
    found_count = len(parsed_labels)
    if found_count != expected_count:
         logging.warning(f"[Парсер API] Ожидалось {expected_count} меток, найдено {found_count}. Заполняю недостающие/ненайденные как 'parsing_error'.")

    return result_list

# --- Обновляем функцию создания промпта --- 
def create_api_prompt(paragraph_texts: List[str], topic_prompt: str) -> str:
    """Создает промпт для API OpenAI.
    Возвращает строку с промптом.
    """
    
    # Динамическое создание описаний меток
    label_descriptions = "\n".join(
        f"- {label}: {desc.format(topic_prompt) if label in TOPIC_DEPENDENT_LABELS else desc}"
        for label, desc in API_LABEL_DESCRIPTIONS.items()
    )

    # Нумерованный блок текста
    numbered_text = prepare_numbered_text_block(paragraph_texts)
    
    prompt = f"""Проанализируй следующий текст, разбитый на нумерованные абзацы. Тема текста: '{topic_prompt}'.

Определи основную семантическую функцию *каждого* абзаца. Возможные функции:
{label_descriptions}

Текст для анализа:
---
{numbered_text}
---

Твоя задача: Для *каждого* нумерованного абзаца укажи *одну* наиболее подходящую семантическую функцию из списка выше. Представь ответ в виде нумерованного списка, где каждый пункт соответствует номеру абзаца и содержит только название выбранной функции.
Пример ответа:
1. раскрытие темы
2. пояснение на примере
3. юмор / ирония / сарказм
... (и так далее для всех абзацев)
"""
    return prompt


# --- Функция Локального Анализа (Fallback) --- 
def analyze_semantic_function_local(paragraph_text: str, topic_prompt: str) -> dict:
    """Анализирует один параграф локально, используя zero-shot классификатор."""
    if local_classifier is None:
        logging.warning("Локальный классификатор не загружен. Пропуск локального семантического анализа.")
        return {"semantic_function": "local_model_error", "probabilities": {}}

    if not paragraph_text:
        return {"semantic_function": "empty", "probabilities": {}}

    aggregated_scores = {}
    try:
        for main_label, synonym_hypotheses in LABEL_SYNONYMS_LOCAL.items():
            # Выбираем шаблон
            current_template = ""
            is_topic_dependent = main_label in ["раскрытие темы", "пояснение на примере", "лирическое отступление"]
            
            if is_topic_dependent:
                if not topic_prompt:
                    logging.warning(f"[Локальный анализ] Пустая тема для метки '{main_label}'. Используется нейтральный шаблон.")
                    current_template = TEMPLATE_NEUTRAL_LOCAL
                else:
                    current_template = TEMPLATE_WITH_TOPIC_LOCAL.format(topic=topic_prompt)
            else:
                current_template = TEMPLATE_NEUTRAL_LOCAL
            
            # Классификация
            results = local_classifier(
                paragraph_text,
                synonym_hypotheses,
                hypothesis_template=current_template,
                multi_label=True
            )

            # Агрегация скоров
            max_score_for_label = 0.0
            if results and 'scores' in results and results['scores']:
                max_score_for_label = max(results['scores'])
            aggregated_scores[main_label] = round(max_score_for_label, 3)
        
        # --- Старая логика выбора ОДНОЙ метки (закомментирована) ---
        # if not aggregated_scores:
        #     top_main_label = "error"
        # else:
        #     top_main_label = max(aggregated_scores, key=aggregated_scores.get)
        # logging.debug(f"    Лок. семант. функция: {top_main_label} (max_score: {aggregated_scores.get(top_main_label, 0.0):.3f})")
        # return {"semantic_function": top_main_label, "probabilities": aggregated_scores}
        # --- Конец старой логики ---
        
        # --- Новая логика: Multi-label с порогом --- 
        LOCAL_MULTI_LABEL_THRESHOLD = 0.6 # Порог уверенности
        MAX_LABELS_TO_KEEP = 3       # Максимальное количество меток
        DEFAULT_LABEL = "не определено" # Метка по умолчанию
        
        # 1. Фильтруем метки по порогу
        passed_labels = {
            label: score 
            for label, score in aggregated_scores.items() 
            if score >= LOCAL_MULTI_LABEL_THRESHOLD
        }
        
        # 2. Сортируем по убыванию вероятности
        sorted_labels = sorted(passed_labels.items(), key=lambda item: item[1], reverse=True)
        
        # 3. Оставляем топ N меток
        top_labels = [label for label, score in sorted_labels[:MAX_LABELS_TO_KEEP]]
        
        # 4. Формируем результат
        if not top_labels:
            final_label_str = DEFAULT_LABEL
        else:
            final_label_str = ", ".join(top_labels) # Объединяем через запятую
            
        logging.debug(f"    Лок. семант. функция (multi): {final_label_str} (Scores: {aggregated_scores})")
        
        return {
            "semantic_function": final_label_str, 
            "probabilities": aggregated_scores # Возвращаем все вероятности для возможного анализа
        }
        # --- Конец новой логики ---

    except Exception as e:
        logging.error(f"[Локальный анализ] Ошибка при анализе параграфа '{paragraph_text[:50]}...': {e}", exc_info=True)
        return {"semantic_function": "local_runtime_error", "probabilities": {}}


# --- Функция Локальной Пакетной Обработки --- 
def analyze_semantic_function_local_batch(paragraph_texts: list[str], topic_prompt: str) -> List[str]:
    """Выполняет локальный семантический анализ для списка параграфов."""
    results = []
    total_paragraphs = len(paragraph_texts)
    logging.info(f"[Локальный анализ] Начало обработки {total_paragraphs} параграфов...")
    
    for i, text in enumerate(paragraph_texts):
        if (i + 1) % 20 == 0:
             logging.info(f"[Локальный анализ] Обработано {i + 1}/{total_paragraphs} параграфов...")
        
        # Вызываем обновленную функцию для одного параграфа
        analysis_result = analyze_semantic_function_local(text, topic_prompt) 
        results.append(analysis_result["semantic_function"])
        
    logging.info(f"[Локальный анализ] Завершено.")
    return results

# --- Функция API Пакетной Обработки --- 
def analyze_semantic_function_api_batch(paragraph_texts: list[str], topic_prompt: str, client: openai.OpenAI) -> List[str] | None:
    """Выполняет семантический анализ через API OpenAI."""
    if not client:
        logging.error("[API Анализ] OpenAI клиент не предоставлен.")
        return None
    
    prompt = create_api_prompt(paragraph_texts, topic_prompt)
    expected_count = len(paragraph_texts)
    logging.info(f"[API Анализ] Отправка запроса к {API_MODEL_NAME} для {expected_count} параграфов...")
    
    try:
        completion = client.chat.completions.create(
            model=API_MODEL_NAME,
            messages=[
                {"role": "system", "content": "Ты - ассистент, анализирующий семантическую структуру текста."},
                {"role": "user", "content": prompt}
            ],
            temperature=API_TEMPERATURE
        )
        response_text = completion.choices[0].message.content
        logging.info(f"[API Анализ] Ответ получен. Парсинг...")
        # logging.debug(f"[API Анализ] Полный ответ: \n{response_text}")
        
        parsed_labels = parse_gpt_response(response_text, expected_count)
        logging.info(f"[API Анализ] Парсинг завершен.")
        return parsed_labels

    except openai.APIConnectionError as e:
        logging.error(f"[API Анализ] Ошибка соединения с сервером OpenAI: {e}")
    except openai.RateLimitError as e:
        logging.error(f"[API Анализ] Превышен лимит запросов OpenAI: {e}")
    except openai.APIStatusError as e:
        logging.error(f"[API Анализ] Ошибка API OpenAI (статус {e.status_code}): {e.response}")
    except Exception as e:
        logging.error(f"[API Анализ] Непредвиденная ошибка при запросе к OpenAI: {e}", exc_info=True)
        
    return None # Возвращаем None в случае любой ошибки API

# --- Основная Функция Пакетной Обработки (Диспетчер) --- 
def analyze_semantic_function_batch(df: pd.DataFrame, topic_prompt: str, client: openai.OpenAI | None) -> pd.DataFrame:
    """Анализирует семантическую функцию для всех параграфов в DataFrame.
    Использует API OpenAI, если клиент доступен, иначе переключается на локальную модель.
    """
    paragraph_texts = df['text'].tolist()
    results = None
    method_used = ""

    # --- Принудительный Fallback для Тестирования (раскомментировать строку ниже) ---
    # client = None 
    # --- Конец принудительного Fallback ---
    
    if client:
        logging.info("Используется API метод для семантического анализа.")
        results = analyze_semantic_function_api_batch(paragraph_texts, topic_prompt, client)
        method_used = "api:" + API_MODEL_NAME
    
    # Если API не использовался или вернул ошибку (None)
    if results is None:
        if client:
            logging.warning("Ошибка API метода. Переключение на локальный fallback метод.")
        else:
            logging.info("OpenAI клиент недоступен. Используется локальный fallback метод для семантического анализа.")
        
        if local_classifier:
             results = analyze_semantic_function_local_batch(paragraph_texts, topic_prompt)
             method_used = "local:" + MODEL_NAME_LOCAL
        else:
             logging.error("Локальный классификатор также недоступен. Семантический анализ невозможен.")
             results = ["unavailable"] * len(paragraph_texts)
             method_used = "none"

    # Убедимся, что results имеет правильную длину
    if len(results) != len(df):
        logging.error(f"Количество результатов семантического анализа ({len(results)}) не совпадает с количеством параграфов ({len(df)}). Заполняю ошибками.")
        results = ["length_mismatch_error"] * len(df)
        method_used = "error"
        
    df['semantic_function'] = results
    # Сохраняем информацию о методе (можно использовать для отладки)
    df['semantic_method'] = method_used 
    
    return df 
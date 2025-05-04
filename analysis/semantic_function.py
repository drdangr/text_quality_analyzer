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
def _create_api_prompt(topic_prompt: str, numbered_text: str) -> List[Dict[str, str]]:
    """Создает промпт для OpenAI API с четкими инструкциями и списком меток."""
    
    # Формируем строку со списком меток и их описаний
    labels_string = ""
    for label in API_LABELS:
        desc_template = API_LABEL_DESCRIPTIONS.get(label, "Описание отсутствует")
        description = ""
        # Подставляем тему, если метка этого требует
        if label in TOPIC_DEPENDENT_LABELS:
            try:
                description = desc_template.format(topic_prompt if topic_prompt else "[ТЕМА НЕ УКАЗАНА]")
            except Exception as e:
                logging.warning(f"[Промпт API] Ошибка форматирования описания для метки '{label}': {e}")
                description = desc_template # Оставляем шаблон как есть
        else:
            description = desc_template
        # Добавляем строку в формате "Метка: Описание"
        labels_string += f"- {label}: {description}\n"
    labels_string = labels_string.strip() # Убираем лишний перевод строки в конце

    system_prompt = (
        "Ты - ассистент для анализа текста. Твоя задача - определить семантическую функцию КАЖДОГО нумерованного фрагмента текста, "
        "используя ТОЛЬКО одну метку из предоставленного списка для каждого фрагмента."
    )
    user_prompt = (
        f"Вот список доступных семантических меток и их описаний:\n{labels_string}\n\n"
        f"Проанализируй следующий текст, разбитый на нумерованные фрагменты:\n\n{numbered_text}\n\n"
        "--- ИНСТРУКЦИЯ ПО ВЫВОДУ ---\n"
        "Для КАЖДОГО номера фрагмента (от 1 до N) выведи ТОЛЬКО ОДНУ наиболее подходящую метку ТОЧНО ТАК, КАК она указана в списке ДО двоеточия (например, 'раскрытие темы', 'юмор / ирония / сарказм'). "
        "Выведи результат строго в формате 'Номер. Метка' для каждого фрагмента, каждый на новой строке. "
        "НЕ ИСПОЛЬЗУЙ описания меток в своем ответе. НЕ ДОБАВЛЯЙ никаких других пояснений, комментариев или вводных фраз."
    )

    logging.info(f"[API Промпт] System: {system_prompt[:200]}... User: {user_prompt[:500]}...")
    # Логируем полный промпт на уровне DEBUG для детальной отладки
    logging.debug(f"[API Промпт Полный] System: {system_prompt} User: {user_prompt}") 

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

# --- Локальный Fallback Метод (Обновленный для Batch) ---
def analyze_semantic_function_local_batch(paragraph_texts: list[str], topic_prompt: str) -> List[str]:
    """Анализирует семантическую функцию списком (локальный метод, fallback)."""
    if local_classifier is None:
        logging.error("Локальный классификатор не загружен. Невозможно выполнить fallback анализ.")
        return ["local_model_error"] * len(paragraph_texts)

    all_results = []
    num_paragraphs = len(paragraph_texts)
    logging.info(f"Запуск локального анализа семантики для {num_paragraphs} параграфов...")

    for i, text in enumerate(paragraph_texts):
        if not text or pd.isna(text):
            all_results.append("empty_paragraph")
            continue
            
        current_best_label = "local_fallback_error"
        max_score = -1.0
        
        try:
            topic_labels = {k: v for k, v in LABEL_SYNONYMS_LOCAL.items() if k in TOPIC_DEPENDENT_LABELS}
            neutral_labels = {k: v for k, v in LABEL_SYNONYMS_LOCAL.items() if k not in TOPIC_DEPENDENT_LABELS}
            
            all_hypotheses = []
            label_map = []
            
            for main_label, synonyms in topic_labels.items():
                if topic_prompt:
                    formatted_synonyms = [TEMPLATE_WITH_TOPIC_LOCAL.format(topic=topic_prompt, hypothesis=s) for s in synonyms]
                else:
                    logging.debug(f"[Локальный] Тема пуста, используем нейтральный шаблон для '{main_label}'")
                    formatted_synonyms = [TEMPLATE_NEUTRAL_LOCAL.format(s) for s in synonyms]
                all_hypotheses.extend(formatted_synonyms)
                label_map.extend([main_label] * len(synonyms))
            
            for main_label, synonyms in neutral_labels.items():
                formatted_synonyms = [TEMPLATE_NEUTRAL_LOCAL.format(s) for s in synonyms]
                all_hypotheses.extend(formatted_synonyms)
                label_map.extend([main_label] * len(synonyms))

            if not isinstance(text, str):
                 logging.warning(f"[Локальный] Ожидался текст (str) для параграфа {i+1}, получен {type(text)}. Пропуск.")
                 all_results.append("invalid_input_type")
                 continue
                 
            classifier_output = local_classifier(text, all_hypotheses, multi_label=False)
            
            best_hypothesis_index = all_hypotheses.index(classifier_output['labels'][0])
            current_best_label = label_map[best_hypothesis_index]
            max_score = classifier_output['scores'][0]
            logging.debug(f"[Локальный] Параграф {i+1}: Лучшая метка={current_best_label} (Score: {max_score:.3f})") 

        except Exception as e:
            logging.error(f"[Локальный] Ошибка анализа параграфа {i+1}: {e}", exc_info=True)
            current_best_label = "local_analysis_error"
            
        all_results.append(current_best_label)
        
    logging.info(f"Локальный анализ семантики завершен для {num_paragraphs} параграфов.")
    return all_results

# --- API Метод (Обновленный для Batch) ---
def analyze_semantic_function_api_batch(paragraph_texts: list[str], topic_prompt: str, client: openai.OpenAI) -> List[str] | None:
    """Анализирует семантическую функцию списком с помощью OpenAI API."""
    num_paragraphs = len(paragraph_texts)
    if num_paragraphs == 0:
        return []

    numbered_text = prepare_numbered_text_block(paragraph_texts)
    messages = _create_api_prompt(topic_prompt, numbered_text)

    try:
        logging.info(f"[API] Отправка запроса к {API_MODEL_NAME} для {num_paragraphs} параграфов.")
        response = client.chat.completions.create(
            model=API_MODEL_NAME,
            messages=messages,
            temperature=API_TEMPERATURE,
            max_tokens=max(500, num_paragraphs * 40) # Оставляем запас
        )
        response_content = response.choices[0].message.content
        logging.info(f"[API] Получен ответ от GPT (длина {len(response_content)}).")
        logging.debug(f"[API] Текст ответа:\n{response_content}")

        parsed_result = parse_gpt_response(response_content, num_paragraphs)
        return parsed_result

    except openai.APIConnectionError as e:
        logging.error(f"[API Ошибка] Ошибка соединения с OpenAI: {e}")
    except openai.RateLimitError as e:
        logging.error(f"[API Ошибка] Превышен лимит запросов OpenAI: {e}")
    except openai.APIStatusError as e:
        logging.error(f"[API Ошибка] Ошибка статуса OpenAI (HTTP {e.status_code}): {e.response}")
    except Exception as e:
        logging.error(f"[API Ошибка] Непредвиденная ошибка при вызове OpenAI API: {e}", exc_info=True)

    return None

# --- Основная Функция (Оркестратор - Новая Batch Версия) ---
def analyze_semantic_function_batch(df: pd.DataFrame, topic_prompt: str, client: openai.OpenAI | None) -> pd.DataFrame:
    """Оркестратор для анализа семантической функции (batch)."""
    paragraph_texts = df['text'].tolist()
    results = None
    method_used = "unknown"
    num_paragraphs = len(paragraph_texts)

    if client:
        logging.info("Обнаружен OpenAI API ключ и клиент, попытка использовать batch API...")
        api_results = analyze_semantic_function_api_batch(paragraph_texts, topic_prompt, client)
        
        if api_results is not None and isinstance(api_results, list) and len(api_results) == len(paragraph_texts):
            if not any("error" in str(label).lower() for label in api_results):
                logging.info("[Оркестратор] API отработал успешно, используем его результаты.")
                results = api_results
                method_used = "api_batch"
            else:
                first_error = next((label for label in api_results if "error" in str(label).lower()), "unknown_error")
                logging.warning(f"[Оркестратор] Обнаружена ошибка ('{first_error}') в ответе API. Переключаюсь на локальный fallback.")
        else:
             logging.warning("[Оркестратор] API вызов не вернул ожидаемый результат. Переключаюсь на локальный fallback.")
    else:
        # Логирование причин отсутствия клиента теперь в main.py при проверке импортированного client
        pass # Просто продолжаем к fallback

    if results is None:
        if local_classifier:
            logging.warning(f"Переход на локальный fallback метод ('{MODEL_NAME_LOCAL}').")
            results = analyze_semantic_function_local_batch(paragraph_texts, topic_prompt)
            method_used = "local_fallback"
        else:
            logging.error("Локальная модель недоступна. Не удалось определить семантическую функцию.")
            results = ["error_no_model"] * num_paragraphs
            method_used = "error_no_model"
            
    df['semantic_function'] = results
    df['semantic_method'] = method_used
    
    if results:
        logging.info(f"Семантический анализ через '{method_used}' ({len(results)} меток) завершен.")
        logging.debug(f"[Оркестратор] Пример результата: {results[:5]}...")
    else:
         logging.error("Не удалось получить результаты семантического анализа.")

    return df

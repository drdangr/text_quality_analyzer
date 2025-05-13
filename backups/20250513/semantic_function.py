"""
Модуль анализа семантической функции текста.

Этот модуль предоставляет инструменты для анализа семантической функции параграфов текста,
следуя спецификации из docs/Text Analysis Prototype.md.

Доступны два метода анализа:
1. API-анализ с использованием OpenAI API (основной метод).
2. Локальный анализ с использованием предзагруженной NLI-модели (резервный).

Основные функции:
- analyze_semantic_function_local: анализ одного параграфа локальной моделью.
- analyze_semantic_function_local_batch: пакетный анализ локальной моделью.
- analyze_semantic_function_api_batch: пакетный анализ через OpenAI API.
- analyze_semantic_function_batch: комбинированный анализ (оркестратор).
"""

from typing import Dict, List, Any, Optional, Union
import logging
import re
import torch
import pandas as pd
import hashlib

# Отключаем логирование HTTP-клиента OpenAI и прочих внешних библиотек
logging.getLogger("openai").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("httpcore").setLevel(logging.ERROR)

# Подключаем Transformers для локальной модели
try:
    from transformers import pipeline
except ImportError:
    logging.error("Библиотека transformers не установлена. Локальная модель будет недоступна.")
    pipeline = None

# Подключаем OpenAI для API
try:
    from openai import OpenAI, APIConnectionError, RateLimitError, APIStatusError
except ImportError:
    logging.warning("Библиотека openai не установлена. API анализ будет недоступен.")
    OpenAI = None # type: ignore
    APIConnectionError = Exception # type: ignore
    RateLimitError = Exception # type: ignore
    APIStatusError = Exception # type: ignore

# -----------------------------------------------------------------------------
# Константы и настройки (согласно документации)
# -----------------------------------------------------------------------------

# -- Локальная модель (Fallback) --
# Пробуем альтернативную base модель от MoritzLaurer
# MODEL_NAME_LOCAL = "cointegrated/rubert-base-cased-nli-threeway" # Русскоязычная base NLI модель
MODEL_NAME_LOCAL = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7" # Альтернативная мультиязычная base модель
LOCAL_SCORE_THRESHOLD = 0.5 # Порог для включения метки в топ-3
LOCAL_TOP_N = 4             # Количество лучших меток для вывода

# Словарь семантических меток и их синонимов для локальной модели
# Плейсхолдер <ТЕМА> будет заменен на реальную тему
# уберем несколько гипотез "развивает тему <ТЕМА>","конкретизирует тему <ТЕМА>",
LABEL_SYNONYMS_LOCAL = {
  "раскрытие темы": [
    "объясняет суть темы <ТЕМА>",
    "непосредственно относится к теме <ТЕМА>",
    "продолжает изложение темы <ТЕМА>"
  ],
  "пояснение на примере": [
    "разъясняет тему <ТЕМА> через пример",
    "иллюстрирует тему <ТЕМА>",
    "объясняет идею <ТЕМА> с помощью аналога",
    "даёт пример по теме <ТЕМА>",
    "конкретизирует тему <ТЕМА> бытовой ситуацией"
  ],
  "метафора": [
    "этот абзац может быть метафорой <ТЕМА>", # Примечание: Документация указывает этот синоним как зависящий от темы, хотя сама метка "метафора" вроде бы нет. Оставляем как в док-ции.
    "это образное выражение относительно <ТЕМА>",
    "этот абзац имеет переносный смысл по отношению к <ТЕМА>",
    "этот абзац содержит поэтическое сравнение <ТЕМА>",
    "это аналогия <ТЕМА>"
  ],
  "юмор": [
    "это юмор или шутка или анекдот",
    "этот текст написан в юмористическом тоне",
    "здесь используется ирония или сарказм",
    "автор пытается пошутить",
    "это высказывание имеет комический эффект"
  ],
  "лирическое отступление": [
    "это содержательное отступление от темы <ТЕМА>",
    "философское или культурное отступление от темы <ТЕМА>",
    "не о теме <ТЕМА> напрямую, но создаёт глубину",
    "содержит мысль, не связанную с темой <ТЕМА> напрямую",
    "расширяет контекст, отступая от основной линии <ТЕМА>"
  ]
}

# Плейсхолдер темы для локального анализа
LOCAL_TOPIC_PLACEHOLDER = "<ТЕМА>"

# -- API Метод (Основной) --
API_MODEL_NAME = "gpt-4o" # Предпочтительно, но можно заменить на gpt-4-turbo, если 4o недоступен
API_TEMPERATURE = 0.3
API_MAX_TOKENS_PER_REQUEST = 4000 # Устанавливаем разумный лимит для всего ответа API (с запасом)
API_TOKENS_PER_PARAGRAPH_ESTIMATE = 40 # Грубая оценка для расчета общего лимита

API_PARAMS = {
    "model": API_MODEL_NAME,
    "temperature": API_TEMPERATURE,
    "top_p": 1.0,
    # "max_tokens": 1500, # max_tokens лучше рассчитывать динамически или задать с большим запасом
    "n": 1,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.0
}

# Метки для API (10 штук согласно документации)
API_LABELS = [
    "раскрытие темы",
    "пояснение на примере",
    "лирическое отступление",
    "ключевой тезис",
    "шум",
    "метафора или аналогия",
    "юмор или ирония или сарказм",
    "связующий переход",
    "смена темы",
    "противопоставление или контраст"
]

# Метки API, требующие подстановки темы (<ТЕМА>)
API_TOPIC_LABELS = [
    "раскрытие темы",
    "пояснение на примере",
    "лирическое отступление",
    "ключевой тезис",
    "шум"
]
API_TOPIC_PLACEHOLDER = "<ТЕМА>" # Плейсхолдер в промпте API

# -----------------------------------------------------------------------------
# Глобальные переменные и кеши
# -----------------------------------------------------------------------------

local_classifier = None
GLOBAL_RESULT_CACHE = {} # Кеш для локального анализа {cache_key: result_string}

# -----------------------------------------------------------------------------
# Загрузка моделей и классификаторов
# -----------------------------------------------------------------------------

def load_local_classifier() -> None:
    """Загружает локальный zero-shot классификатор."""
    global local_classifier
    
    if local_classifier is not None:
        logging.debug("Локальный классификатор уже загружен.")
        return
        
    if pipeline is None:
        logging.error("Библиотека transformers (pipeline) не доступна. Локальный классификатор не будет загружен.")
        return
        
    try:
        # Проверяем доступность GPU
        device_id = 0 if torch.cuda.is_available() else -1
        device_name = 'GPU' if device_id == 0 else 'CPU'
        
        logging.info(f"Загрузка локального классификатора '{MODEL_NAME_LOCAL}' на {device_name}...")
        
        local_classifier = pipeline(
            "zero-shot-classification",
            model=MODEL_NAME_LOCAL,
            device=device_id
        )
        
        logging.info(f"Локальный классификатор '{MODEL_NAME_LOCAL}' успешно загружен на {device_name}.")
    except Exception as e:
        logging.error(f"Ошибка загрузки локального классификатора '{MODEL_NAME_LOCAL}': {e}", exc_info=True)
        local_classifier = None # Убедимся, что он None в случае ошибки

# Загружаем классификатор при импорте модуля
load_local_classifier()

# -----------------------------------------------------------------------------
# Вспомогательные функции
# -----------------------------------------------------------------------------

def get_cache_key(text: str, topic: str) -> str:
    """Создает уникальный ключ кеша для локального анализа."""
    # Используем хеш для предотвращения слишком длинных ключей
    text_hash = hashlib.md5(text.encode()).hexdigest()
    topic_hash = hashlib.md5(topic.encode()).hexdigest()
    key = f"local_{text_hash[:16]}_{topic_hash[:16]}"
    return key

def prepare_numbered_text_block(paragraph_texts: List[str]) -> str:
    """
    Нумерует абзацы (1., 2., ...) и соединяет их двойными переводами строк
    для передачи в API одним блоком.
    """
    if not paragraph_texts:
        return ""
    numbered_items = [f"{i+1}. {text}" for i, text in enumerate(paragraph_texts)]
    return "\n\n".join(numbered_items)

def parse_gpt_response(response_text: str, expected_count: int) -> List[str]:
    """
    Анализирует ответ GPT (ожидаемый формат: 'N. роль' или 'N. роль1 / роль2'), извлекая метки.
    Возвращает список меток или 'parsing_error' для нераспознанных строк.
    """
    parsed_labels = {}  # Словарь {номер_параграфа: метка(и)}
    lines = response_text.strip().split('\n')
    # Паттерн: N. Метка (возможно с пробелами, может включать '/')
    pattern = re.compile(r"^\s*(\d+)\.?\s*(.+?)\s*$") 
    
    valid_api_labels_set = set(API_LABELS)
    
    for line in lines:
        match = pattern.match(line)
        if match:
            try:
                paragraph_num = int(match.group(1))
                # Извлекаем метку(и) и убираем лишние пробелы
                labels_part = match.group(2).strip() 
                
                # Проверяем каждую метку (если их несколько, разделенных '/')
                current_labels = []
                possible_labels = [l.strip() for l in labels_part.split('/')]
                
                valid_found = False
                for label in possible_labels:
                    if label in valid_api_labels_set:
                        current_labels.append(label)
                        valid_found = True
                    elif label: # Логируем только непустые нераспознанные метки
                        logging.warning(f"[Парсер API] Неизвестная или некорректная метка '{label}' для параграфа {paragraph_num} в строке: '{line}'")
                
                if valid_found:
                     # Сохраняем валидные метки, объединенные через "/"
                     parsed_labels[paragraph_num] = " / ".join(current_labels)
                
            except ValueError:
                logging.warning(f"[Парсер API] Не удалось извлечь номер параграфа из строки: '{line}'")
            except Exception as e:
                 logging.error(f"[Парсер API] Ошибка парсинга строки '{line}': {e}")
        elif line.strip(): # Логируем непустые строки, не соответствующие формату
            logging.warning(f"[Парсер API] Строка не соответствует формату 'N. Метка(и)': '{line}'")
            
    # Формируем итоговый список, используя 'parsing_error' для отсутствующих номеров
    result_list = [parsed_labels.get(i + 1, "parsing_error") for i in range(expected_count)]
    
    # Проверяем, все ли параграфы получили метку
    found_count = sum(1 for label in result_list if label != "parsing_error")
    if found_count != expected_count:
        missing_count = expected_count - found_count
        logging.warning(f"[Парсер API] Не удалось извлечь метки для {missing_count} из {expected_count} параграфов. Они помечены как 'parsing_error'.")
        missing_indices = [i + 1 for i, label in enumerate(result_list) if label == "parsing_error"]
        if missing_indices:
             logging.debug(f"[Парсер API] Номера параграфов без меток: {missing_indices}")

    return result_list

def _create_api_prompt(topic_prompt: str, numbered_text: str) -> List[Dict[str, str]]:
    """Создаёт промпт для OpenAI API точно по формату документации."""
    
    # Формируем блок описания ролей
    roles_description = ""
    for i, label in enumerate(API_LABELS, 1):
        # Заменяем "/" на "или" для отображения в промпте
        display_label = label.replace(" / ", " или ")
        description = f"{i}. {display_label}" # Используем display_label
        
        if label in API_TOPIC_LABELS: # Проверяем по оригинальной метке
            # Подставляем тему в плейсхолдер <ТЕМА> и добавляем описание
            base_desc = "фрагмент расширяет, развивает или продолжает основную тему: '{}'".format(topic_prompt)
            if label == "пояснение на примере":
                base_desc = "фрагмент иллюстрирует тему '{}' с помощью конкретного случая, аналога или бытовой ситуации".format(topic_prompt)
            elif label == "лирическое отступление":
                 base_desc = "содержательное отступление от темы '{}', предлагающее культурное, философское или эмоциональное размышление".format(topic_prompt)
            elif label == "ключевой тезис":
                 base_desc = "краткая формулировка центральной мысли или главного вывода по теме '{}', часто лаконична и утверждающая".format(topic_prompt)
            elif label == "шум":
                 base_desc = "фрагмент не имеет отношения к теме '{}' и не добавляет ценности обсуждению".format(topic_prompt)
            description += f" — {base_desc}"
        else:
             # Для остальных меток - базовое описание
            # Проверяем по оригинальной метке
            if label == "метафора или аналогия": 
                description += " — образное или переносное выражение, сравнение, аллегория"
            elif label == "юмор или ирония или сарказм":
                description += " — элементы, предназначенные вызвать улыбку, комический эффект или критическое осмысление через иронию"
            elif label == "связующий переход":
                description += " — фраза или предложение, служащее мостом между частями текста"
            elif label == "смена темы":
                description += " — явное или скрытое переключение внимания с одной темы на другую"
            elif label == "противопоставление или контраст":
                description += " — фрагмент подчёркивает различие, оппозицию или конфликт идей"
        roles_description += description + "\n"
        
    # Убираем последний перевод строки
    roles_description = roles_description.strip()

    # Системный промпт
    system_prompt = "Ты — языковой аналитик. Классифицируй текст по ролям."

    # Пользовательский промпт (из документации)
    user_prompt = (
        f"Задание: Определи одну или две наиболее подходящие семантические роли каждого абзаца из списка ниже.\n\n"
        f"Возможные роли:\n{roles_description}\n\n" # Обратите внимание: \n вместо \\n, так как f-string сама обрабатывает
        f"Ответ: укажи для каждого абзаца только одну или две роли, точно как в списке выше, без дополнительных пояснений.\n\n"
        f"{numbered_text}" # Подставляем нумерованный текст напрямую
    )
    
    # Возвращаем структуру для Chat Completions API
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

# -----------------------------------------------------------------------------
# Основные функции анализа
# -----------------------------------------------------------------------------

def analyze_semantic_function_local(
    paragraph_text: str, 
    topic_prompt: str
) -> str:
    """
    Анализирует семантическую функцию ОДНОГО параграфа локальной моделью.
    Возвращает строку с топ-N метками (score > порога) или 'error'/'empty'.
    """
    global GLOBAL_RESULT_CACHE, local_classifier
    
    # Проверки
    if local_classifier is None:
        logging.warning("[Локальный анализ] Классификатор не загружен.")
        return "error: classifier not loaded"
    
    if not paragraph_text:
        logging.debug("[Локальный анализ] Пустой параграф.")
        return "empty"
    
    # Проверяем кеш
    cache_key = get_cache_key(paragraph_text, topic_prompt)
    if cache_key in GLOBAL_RESULT_CACHE:
        logging.debug(f"[Локальный анализ] Кеш хит для ключа: {cache_key}")
        return GLOBAL_RESULT_CACHE[cache_key]
    
    try:
        # Подготовка гипотез с подстановкой темы
        all_hypotheses = []
        main_labels_map = [] # Список основных меток, соответствующий all_hypotheses

        for main_label, synonyms in LABEL_SYNONYMS_LOCAL.items():
            for synonym_template in synonyms:
                # Подставляем тему в плейсхолдер <ТЕМА>, если он есть
                hypothesis = synonym_template.replace(LOCAL_TOPIC_PLACEHOLDER, topic_prompt)
                all_hypotheses.append(hypothesis)
                main_labels_map.append(main_label)
        
        logging.debug(f"[Локальный анализ] Запрос к классификатору для параграфа (длина {len(paragraph_text)}), гипотез: {len(all_hypotheses)}")
        # Запрос к локальной модели
        # Используем multi_label=True, т.к. один параграф может выполнять >1 роли
        result = local_classifier(paragraph_text, all_hypotheses, multi_label=True) 
        
        # Агрегация скоров по основным меткам (берем максимальный скор среди синонимов)
        aggregated_scores: Dict[str, float] = {}
        if result and 'scores' in result and 'labels' in result and len(result['scores']) == len(all_hypotheses):
            for i, score in enumerate(result["scores"]):
                main_label = main_labels_map[i]
                if main_label not in aggregated_scores or score > aggregated_scores[main_label]:
                    aggregated_scores[main_label] = score
        else:
             logging.warning(f"[Локальный анализ] Неожиданный формат ответа классификатора: {result}")
             
        logging.debug(f"[Локальный анализ] Агрегированные скоры: {aggregated_scores}")
                
        # Фильтрация по порогу и сортировка
        filtered_sorted_labels = sorted(
            [(label, score) for label, score in aggregated_scores.items() if score >= LOCAL_SCORE_THRESHOLD],
            key=lambda item: item[1], 
            reverse=True
        )
        
        # Выбираем топ-N (или меньше, если их меньше)
        top_labels = filtered_sorted_labels[:LOCAL_TOP_N]
        
        # Форматируем результат в строку: "метка1 (скор1), метка2 (скор2), ..."
        if top_labels:
            result_string = ", ".join([f"{label} ({score:.2f})" for label, score in top_labels])
        else:
            # Если ни одна метка не прошла порог, возвращаем метку с наивысшим скором (если есть)
            if aggregated_scores:
                max_label = max(aggregated_scores, key=aggregated_scores.get)
                max_score = aggregated_scores[max_label]
                # Помечаем, что она ниже порога
                result_string = f"{max_label} ({max_score:.2f}) (below threshold)" 
                logging.debug(f"[Локальный анализ] Ни одна метка не прошла порог {LOCAL_SCORE_THRESHOLD}. Возвращена лучшая: {result_string}")
            else:
                result_string = "no label found" # Маловероятно, но возможно
                logging.warning("[Локальный анализ] Не найдено ни одной метки после агрегации.")

        # Кешируем и возвращаем
        logging.debug(f"[Локальный анализ] Результат: '{result_string}'")
        GLOBAL_RESULT_CACHE[cache_key] = result_string
        return result_string
            
    except Exception as e:
        logging.error(f"[Локальный анализ] Ошибка при обработке параграфа: {e}", exc_info=True)
        # Можно добавить текст параграфа в лог ошибки для отладки
        # logging.debug(f"Текст параграфа с ошибкой: {paragraph_text[:100]}...") 
        return "error: analysis failed"

def analyze_semantic_function_local_batch(
    paragraph_texts: List[str], 
    topic_prompt: str
) -> List[str]:
    """
    Пакетный анализ семантической функции локальной моделью.
    Обрабатывает каждый параграф индивидуально через analyze_semantic_function_local.
    """
    if not paragraph_texts:
        logging.warning("[Локальный батч] Пустой список параграфов.")
        return []
        
    results = []
    total_paragraphs = len(paragraph_texts)
    processed_count = 0
    
    logging.info(f"[Локальный батч] Начало обработки {total_paragraphs} параграфов...")
    
    for i, para_text in enumerate(paragraph_texts):
        result = analyze_semantic_function_local(para_text, topic_prompt)
        results.append(result)
        processed_count += 1
        # Логирование прогресса каждые N параграфов или в конце
        if processed_count % 50 == 0 or processed_count == total_paragraphs:
             logging.info(f"[Локальный батч] Обработано {processed_count}/{total_paragraphs}...")

    logging.info(f"[Локальный батч] Обработка завершена.")
    return results

def analyze_semantic_function_api_batch(
    paragraph_texts: List[str], 
    topic_prompt: str, 
    client: Any # Ожидается инициализированный клиент OpenAI
) -> Optional[List[str]]:
    """
    Пакетный анализ семантической функции через OpenAI API.
    Отправляет все параграфы одним запросом.
    """
    num_paragraphs = len(paragraph_texts)
    if num_paragraphs == 0:
        logging.warning("[API батч] Пустой список параграфов.")
        return None # Возвращаем None при пустом входе, чтобы оркестратор понял
    
    # Проверяем наличие клиента и класса OpenAI (на случай если импорт не удался)
    if client is None or OpenAI is None:
        logging.error("[API батч] OpenAI клиент не предоставлен или модуль OpenAI не импортирован.")
        return None
    
    try:
        # 1. Подготовка нумерованного текста
        numbered_text = prepare_numbered_text_block(paragraph_texts)
        if not numbered_text:
             logging.error("[API батч] Не удалось создать нумерованный блок текста.")
             return None

        # 2. Создание промпта
        messages = _create_api_prompt(topic_prompt, numbered_text)
        
        # 3. Вызов API
        logging.info(f"[API батч] Вызов OpenAI API ({API_MODEL_NAME}) для {num_paragraphs} параграфов...")
        
        # Рассчитываем примерный max_tokens с запасом
        estimated_max_tokens = max(500, num_paragraphs * API_TOKENS_PER_PARAGRAPH_ESTIMATE) 
        if estimated_max_tokens > API_MAX_TOKENS_PER_REQUEST:
             logging.warning(f"[API батч] Расчетный max_tokens ({estimated_max_tokens}) превышает лимит {API_MAX_TOKENS_PER_REQUEST}. Используем лимит.")
             estimated_max_tokens = API_MAX_TOKENS_PER_REQUEST

        current_api_params = API_PARAMS.copy()
        current_api_params["max_tokens"] = estimated_max_tokens
        
        response = client.chat.completions.create(
            messages=messages,
            **current_api_params # Передаем параметры, включая рассчитанный max_tokens
        )
        
        # 4. Обработка ответа
        if not response.choices or not response.choices[0].message or not response.choices[0].message.content:
            logging.error("[API батч] API не вернул контент в ответе.")
            # Логирование деталей ответа для диагностики
            # logging.debug(f"Полный ответ API: {response}")
            return None
        
        response_text = response.choices[0].message.content
        logging.debug(f"[API батч] Получен ответ от API (длина {len(response_text)})")

        # 5. Парсинг ответа
        labels = parse_gpt_response(response_text, num_paragraphs)
        
        # Проверяем, не вернулись ли только ошибки парсинга
        if all(l == "parsing_error" for l in labels):
             logging.error("[API батч] Не удалось распарсить ни одной метки из ответа API.")
             return None # Считаем это неудачей

        logging.info(f"[API батч] Успешно извлечено {sum(1 for l in labels if l != 'parsing_error')}/{num_paragraphs} меток из ответа.")
        return labels
        
    except APIConnectionError as e:
        logging.error(f"[API батч] Ошибка соединения с OpenAI API: {e}", exc_info=False) 
        return None
    except RateLimitError as e:
        logging.error(f"[API батч] Превышен лимит запросов OpenAI API: {e}", exc_info=False)
        return None
    except APIStatusError as e:
        logging.error(f"[API батч] Ошибка статуса OpenAI API: {e.status_code} - {e.response.text}", exc_info=False)
        return None
    except Exception as e:
        logging.error(f"[API батч] Неожиданная ошибка при вызове API: {e}", exc_info=True)
        return None

def analyze_semantic_function_batch(
    df: pd.DataFrame, 
    topic_prompt: str, 
    client: Optional[Any] # Клиент OpenAI может быть None
) -> pd.DataFrame:
    """
    Оркестратор анализа семантической функции.
    Пытается использовать API, при неудаче переключается на локальную модель.
    Записывает результаты в колонки 'semantic_function' и 'semantic_method'.
    """
    
    # 1. Проверка DataFrame
    if not isinstance(df, pd.DataFrame) or 'text' not in df.columns:
        logging.error("[Оркестратор] DataFrame не содержит колонку 'text'")
        df['semantic_function'] = 'error: invalid input df'
        df['semantic_method'] = 'error'
        return df
    
    paragraphs = df['text'].tolist()
    num_paragraphs = len(paragraphs)
    if num_paragraphs == 0:
        logging.warning("[Оркестратор] Пустой список параграфов в DataFrame.")
        df['semantic_function'] = [] # Пустые списки для пустых DF
        df['semantic_method'] = []
        return df

    logging.info(f"[Оркестратор] Запуск семантического анализа для {num_paragraphs} параграфов. Тема: '{topic_prompt}'")

    # 2. Попытка API анализа
    results = None # Инициализируем None
    method_used = "error" # Начальное значение

    # Проверяем наличие клиента и модуля OpenAI
    if client is not None and OpenAI is not None:
        logging.info("[Оркестратор] Попытка анализа через OpenAI API...")
        api_results = analyze_semantic_function_api_batch(paragraphs, topic_prompt, client)
        
        # Проверяем, вернулся ли валидный список нужной длины
        if isinstance(api_results, list) and len(api_results) == num_paragraphs:
             results = api_results
             method_used = 'api'
             logging.info("[Оркестратор] API анализ вернул результат.")
             # Доп. проверка на ошибки парсинга (не блокируем, но логируем)
             parsing_errors = sum(1 for res in api_results if res == "parsing_error")
             if parsing_errors > 0:
                  logging.warning(f"[Оркестратор] API результат содержит {parsing_errors} ошибок парсинга.")
        else:
            logging.warning("[Оркестратор] API анализ не удался (вернул None или некорректный результат). Переход к локальному fallback.")
            # results остается None
    else:
        logging.info("[Оркестратор] OpenAI клиент не настроен или модуль не импортирован, пропускаем API анализ.")

    # 3. Локальный анализ (Fallback), если API не сработал (results все еще None)
    if results is None:
        logging.info("[Оркестратор] Переход к локальному анализу (Fallback)...")
        # Проверяем, загружен ли локальный классификатор
        if local_classifier is not None:
            local_results = analyze_semantic_function_local_batch(paragraphs, topic_prompt)
            # Проверяем результат локального анализа
            if isinstance(local_results, list) and len(local_results) == num_paragraphs:
                 results = local_results
                 method_used = 'local_fallback'
                 logging.info("[Оркестратор] Локальный анализ успешно завершен.")
            else:
                 logging.error(f"[Оркестратор] Локальный анализ вернул некорректный результат (тип: {type(local_results)}, длина: {len(local_results or [])}).")
                 results = ["error: local analysis failed"] * num_paragraphs # Заполняем ошибками
                 method_used = 'error'
        else:
             logging.error("[Оркестратор] Локальный классификатор не загружен, fallback невозможен.")
             results = ["error: no local model"] * num_paragraphs
             method_used = 'error'

    # 4. Запись результатов в DataFrame
    df['semantic_function'] = results
    df['semantic_method'] = method_used
    logging.info(f"[Оркестратор] Семантический анализ завершен. Использован метод: '{method_used}'.")
    
    # Очистка кеша после завершения анализа одного текста (опционально)
    # global GLOBAL_RESULT_CACHE
    # GLOBAL_RESULT_CACHE.clear()
    # logging.debug("[Оркестратор] Локальный кеш очищен.")

    return df

"""
Модуль анализа семантической функции текста с использованием OpenAI API.
"""

import logging
import re
import pandas as pd # type: ignore
import asyncio # Для асинхронного вызова API
from typing import Dict, List, Any, Optional

# Импортируем OpenAIService для проверки типа и доступа к клиенту
# и сам класс OpenAI для проверки типов исключений
from services.openai_service import OpenAIService
import openai # Для openai.APIConnectionError и т.д.

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Константы и настройки
# -----------------------------------------------------------------------------
# API_MODEL_NAME_DEFAULT будет браться из openai_service.default_model
API_TEMPERATURE = 0.3
API_MAX_TOKENS_REQUEST_LIMIT = 4000 # Максимальный лимит токенов для одного запроса (пример для GPT-4o, может меняться)
                                  # Это общий лимит, который должен вместить и промпт, и ожидаемый ответ.

# Оценка токенов для чанкинга (грубая, лучше использовать tiktoken для точности, но это усложнит)
PROMPT_OVERHEAD_TOKENS = 1000  # Примерный размер промпта без текста абзацев
TOKENS_PER_PARAGRAPH_CONTENT_ESTIMATE = 200 # Средняя оценка токенов в тексте одного абзаца
TOKENS_PER_PARAGRAPH_RESPONSE_ESTIMATE = 30 # Средняя оценка токенов в ответе API на один абзац

API_CALL_PARAMS = {
    "temperature": API_TEMPERATURE,
    "top_p": 1.0,
    "n": 1,
    "presence_penalty": 0.0,
    "frequency_penalty": 0.0
}

API_LABELS = [
    "раскрытие темы", "пояснение на примере", "лирическое отступление",
    "ключевой тезис", "шум", "метафора или аналогия",
    "юмор или ирония или сарказм", "связующий переход", "смена темы",
    "противопоставление или контраст"
]

API_TOPIC_LABELS = [
    "раскрытие темы", "пояснение на примере", "лирическое отступление",
    "ключевой тезис", "шум"
]
API_TOPIC_PLACEHOLDER = "<ТЕМА>"

# -----------------------------------------------------------------------------
# Вспомогательные функции
# -----------------------------------------------------------------------------

def _prepare_numbered_text_block(paragraph_texts: List[str]) -> str:
    if not paragraph_texts:
        return ""
    numbered_items = [f"{i+1}. {text}" for i, text in enumerate(paragraph_texts)]
    return "\n\n".join(numbered_items)

def _parse_gpt_response(response_text: str, expected_count: int) -> List[str]:
    parsed_labels: Dict[int, str] = {}
    lines = response_text.strip().split('\n')
    pattern = re.compile(r"^\s*(\d+)\.?\s*(.+?)\s*$")
    # Создаем set из меток в нижнем регистре для быстрой проверки
    valid_api_labels_set_lower = {label.lower() for label in API_LABELS}

    for line in lines:
        match = pattern.match(line)
        if match:
            try:
                paragraph_num = int(match.group(1))
                labels_part = match.group(2).strip()
                current_labels_for_paragraph = []
                # Приводим метки из ответа API к нижнему регистру перед проверкой
                possible_labels_in_part = [l.strip().lower() for l in labels_part.split('/') if l.strip()]
                
                valid_found_for_paragraph = False
                original_case_labels = [] # Сохраняем оригинальный регистр для вывода

                # Итерируемся по оригинальным меткам из ответа, чтобы сохранить их регистр при совпадении
                original_labels_from_api = [l.strip() for l in labels_part.split('/') if l.strip()]

                for i, label_candidate_lower in enumerate(possible_labels_in_part):
                    original_label_candidate = original_labels_from_api[i]
                    if label_candidate_lower in valid_api_labels_set_lower:
                        # Нашли валидную метку, используем ее ОРИГИНАЛЬНЫЙ регистр из API_LABELS
                        # Для этого найдем ее в API_LABELS по нижнему регистру
                        matched_original_case_label = next((api_label for api_label in API_LABELS if api_label.lower() == label_candidate_lower), original_label_candidate)
                        original_case_labels.append(matched_original_case_label)
                        valid_found_for_paragraph = True
                    elif label_candidate_lower: # Логируем только непустые нераспознанные метки
                        logger.warning(f"[SemanticParser] Неизвестная или некорректная метка (после lower): '{label_candidate_lower}' (оригинал: '{original_label_candidate}') для параграфа {paragraph_num} в строке: '{line}'")
                
                if valid_found_for_paragraph:
                     parsed_labels[paragraph_num] = " / ".join(original_case_labels)
                elif possible_labels_in_part: 
                    logger.warning(f"[SemanticParser] Ни одна из предложенных меток ({original_labels_from_api}) не является валидной для параграфа {paragraph_num} в строке: '{line}'")
            
            except ValueError:
                logger.warning(f"[SemanticParser] Не удалось извлечь номер параграфа из строки: '{line}'")
            except Exception as e:
                 logger.error(f"[SemanticParser] Непредвиденная ошибка парсинга строки '{line}': {e}", exc_info=True)
        elif line.strip(): 
            logger.warning(f"[SemanticParser] Строка не соответствует формату 'N. Метка(и)': '{line}'")
            
    result_list = [parsed_labels.get(i + 1, "parsing_error") for i in range(expected_count)]
    
    found_count = sum(1 for label_entry in result_list if label_entry != "parsing_error")
    if found_count != expected_count:
        missing_indices = [i + 1 for i, label_entry in enumerate(result_list) if label_entry == "parsing_error"]
        logger.warning(f"[SemanticParser] Не удалось извлечь/распознать метки для {expected_count - found_count} из {expected_count} параграфов. Пропущенные номера (1-based): {missing_indices}")

    return result_list

def _create_api_prompt_messages(topic_prompt: str, numbered_text_block: str) -> List[Dict[str, str]]:
    roles_description_parts = []
    for i, label in enumerate(API_LABELS, 1):
        display_label = label.replace(" / ", " или ")
        description_line = f"{i}. {display_label}"
        specific_desc = ""
        # Подстановка описаний для меток
        if label in API_TOPIC_LABELS:
            if label == "раскрытие темы": specific_desc = f"фрагмент расширяет, развивает или продолжает основную тему: '{topic_prompt}'"
            elif label == "пояснение на примере": specific_desc = f"фрагмент иллюстрирует тему '{topic_prompt}' с помощью конкретного случая, аналога или бытовой ситуации"
            elif label == "лирическое отступление": specific_desc = f"содержательное отступление от темы '{topic_prompt}', предлагающее культурное, философское или эмоциональное размышление"
            elif label == "ключевой тезис": specific_desc = f"краткая формулировка центральной мысли или главного вывода по теме '{topic_prompt}', часто лаконична и утверждающая"
            elif label == "шум": specific_desc = f"фрагмент не имеет отношения к теме '{topic_prompt}' и не добавляет ценности обсуждению"
        else:
            if label == "метафора или аналогия": specific_desc = "образное или переносное выражение, сравнение, аллегория"
            elif label == "юмор или ирония или сарказм": specific_desc = "элементы, предназначенные вызвать улыбку, комический эффект или критическое осмысление через иронию"
            elif label == "связующий переход": specific_desc = "фраза или предложение, служащее мостом между частями текста"
            elif label == "смена темы": specific_desc = "явное или скрытое переключение внимания с одной темы на другую"
            elif label == "противопоставление или контраст": specific_desc = "фрагмент подчёркивает различие, оппозицию или конфликт идей"
        
        if specific_desc: description_line += f" — {specific_desc}"
        roles_description_parts.append(description_line)
    
    roles_description_str = "\n".join(roles_description_parts)
    system_prompt_content = "Ты — опытный языковой аналитик и редактор. Твоя задача - классифицировать предоставленные абзацы текста по их семантической роли."
    user_prompt_content = (
        f"Задание: Определи одну или, если это абсолютно необходимо, две наиболее подходящие семантические роли для КАЖДОГО абзаца из списка ниже. Используй ТОЛЬКО роли из предоставленного списка.\n\n"
        f"Возможные роли:\n{roles_description_str}\n\n"
        f"Формат ответа: для каждого абзаца предоставь его номер и через точку одну или две роли. Каждая роль на новой строке. Например:\n1. Раскрытие темы\n2. Пояснение на примере / Лирическое отступление\n3. Шум\n\n"
        f"Текст для анализа:\n{numbered_text_block}"
    )
    return [{"role": "system", "content": system_prompt_content}, {"role": "user", "content": user_prompt_content}]

# -----------------------------------------------------------------------------
# Основная функция анализа
# -----------------------------------------------------------------------------
async def analyze_semantic_function_batch(
    df: pd.DataFrame, 
    topic_prompt: str, 
    openai_service: OpenAIService, 
    single_paragraph: bool = False
) -> pd.DataFrame:
    """
    Анализирует семантическую функцию параграфов с использованием OpenAI API.
    Если API недоступен, возвращает DataFrame с соответствующими пометками.
    Обрабатывает ограничения API по токенам, разбивая на чанки при необходимости.
    """
    logger.info(f"[SemanticAPI] Запуск семантического анализа. Параграфов: {len(df)}, Тема: '{topic_prompt[:30]}...', Single: {single_paragraph}")

    # Работаем с копией DataFrame, чтобы не изменять оригинал
    result_df = df.copy()
    # Инициализируем колонки по умолчанию
    result_df['semantic_function'] = "unavailable_api"
    result_df['semantic_method'] = "api"
    result_df['semantic_error'] = None 

    if not openai_service or not openai_service.is_available or not openai_service.client:
        logger.warning("[SemanticAPI] Анализ невозможен: OpenAI API не инициализирован, ключ отсутствует или сервис недоступен.")
        result_df['semantic_error'] = "OpenAI API unavailable or not configured"
        return result_df

    paragraph_texts = result_df['text'].tolist()
    num_total_paragraphs = len(paragraph_texts)
    if num_total_paragraphs == 0:
        logger.info("[SemanticAPI] Нет параграфов для анализа.")
        return result_df 

    # Логика чанкинга (только если не single_paragraph и есть что чанкить)
    chunks_to_process_dfs: List[pd.DataFrame] = []
    if not single_paragraph and num_total_paragraphs > 0:
        # Очень грубая оценка максимального числа параграфов на чанк
        # (Лимит_токенов_запроса - Запас_на_промпт_и_ответы) / Токены_на_текст_параграфа
        # Пример: (4000 - 1500) / 200 = 12.5. Возьмем 10-12.
        # Этот механизм требует тщательной настройки и тестирования.
        # Пока используем более простую оценку из документации.
        max_paragraphs_per_chunk = int(
            (API_MAX_TOKENS_REQUEST_LIMIT - PROMPT_OVERHEAD_TOKENS - num_total_paragraphs * TOKENS_PER_PARAGRAPH_RESPONSE_ESTIMATE) / 
            TOKENS_PER_PARAGRAPH_CONTENT_ESTIMATE 
        ) if TOKENS_PER_PARAGRAPH_CONTENT_ESTIMATE > 0 else num_total_paragraphs
        max_paragraphs_per_chunk = max(1, min(max_paragraphs_per_chunk, 50)) # Ограничим сверху (например, 50)

        if num_total_paragraphs > max_paragraphs_per_chunk:
            logger.warning(f"[SemanticAPI] Текст ({num_total_paragraphs} параграфов) будет разбит на части (примерно по {max_paragraphs_per_chunk} параграфов). Это ГРУБАЯ оценка.")
            for i in range(0, num_total_paragraphs, max_paragraphs_per_chunk):
                chunks_to_process_dfs.append(result_df.iloc[i : i + max_paragraphs_per_chunk])
            logger.info(f"[SemanticAPI] Текст разбит на {len(chunks_to_process_dfs)} частей.")
        else:
            chunks_to_process_dfs.append(result_df) # Один чанк - весь DataFrame
    else: # single_paragraph=True или нет параграфов
        chunks_to_process_dfs.append(result_df)
    
    # --- Обработка каждого чанка --- 
    processed_chunk_dfs: List[pd.DataFrame] = []

    for i, current_chunk_df in enumerate(chunks_to_process_dfs):
        if current_chunk_df.empty:
            processed_chunk_dfs.append(current_chunk_df) # Добавляем пустой, если он был в списке
            continue

        current_paragraph_texts_in_chunk = current_chunk_df['text'].tolist()
        num_paragraphs_in_chunk = len(current_paragraph_texts_in_chunk)
        
        chunk_log_prefix = f"[SemanticAPI Chunk {i+1}/{len(chunks_to_process_dfs)}]"
        logger.info(f"{chunk_log_prefix} Обработка {num_paragraphs_in_chunk} параграфов..." if len(chunks_to_process_dfs) > 1 else f"[SemanticAPI] Обработка {num_paragraphs_in_chunk} параграфов...")
        
        # Создаем временный DataFrame для результатов этого чанка
        # Он будет иметь те же индексы, что и current_chunk_df
        temp_chunk_results_df = pd.DataFrame(index=current_chunk_df.index)
        temp_chunk_results_df['semantic_function'] = "error_api_call"
        temp_chunk_results_df['semantic_method'] = "api"
        temp_chunk_results_df['semantic_error'] = "API call preparation failed"

        try:
            numbered_text_block = _prepare_numbered_text_block(current_paragraph_texts_in_chunk)
            if not numbered_text_block:
                logger.error(f"{chunk_log_prefix} Не удалось создать нумерованный блок текста.")
                processed_chunk_dfs.append(temp_chunk_results_df)
                continue

            messages_for_api = _create_api_prompt_messages(topic_prompt, numbered_text_block)
            
            # Рассчитываем max_tokens для ответа API (примерно, на метки)
            max_tokens_for_api_response = max(150, num_paragraphs_in_chunk * TOKENS_PER_PARAGRAPH_RESPONSE_ESTIMATE) 
            max_tokens_for_api_response = min(max_tokens_for_api_response, API_MAX_TOKENS_REQUEST_LIMIT - PROMPT_OVERHEAD_TOKENS)
            max_tokens_for_api_response = max(50, max_tokens_for_api_response) # Минимальное значение, чтобы что-то получить

            api_call_params_for_chunk = API_CALL_PARAMS.copy()
            api_call_params_for_chunk["model"] = openai_service.default_model
            api_call_params_for_chunk["max_tokens"] = max_tokens_for_api_response
            
            loop = asyncio.get_running_loop()
            api_response = await loop.run_in_executor(
                None, 
                lambda: openai_service.client.chat.completions.create( # type: ignore
                    messages=messages_for_api, **api_call_params_for_chunk
                )
            )
            
            if not api_response.choices or not api_response.choices[0].message or not api_response.choices[0].message.content:
                logger.error(f"{chunk_log_prefix} API не вернул контент в ответе.")
                temp_chunk_results_df['semantic_error'] = "API did not return content"
                processed_chunk_dfs.append(temp_chunk_results_df)
                continue
            
            api_response_text = api_response.choices[0].message.content
            logger.debug(f"{chunk_log_prefix} Получен ответ от API (длина {len(api_response_text)}). Парсинг...")
            
            parsed_labels_list = _parse_gpt_response(api_response_text, num_paragraphs_in_chunk)
            
            temp_chunk_results_df['semantic_function'] = parsed_labels_list
            temp_chunk_results_df['semantic_method'] = "api"
            # Обнуляем ошибку, если все успешно
            temp_chunk_results_df['semantic_error'] = None 
            # Ставим ошибку парсинга, если метка == "parsing_error"
            parsing_error_mask = temp_chunk_results_df['semantic_function'] == 'parsing_error'
            temp_chunk_results_df.loc[parsing_error_mask, 'semantic_error'] = 'Failed to parse API response for paragraph'
            
            logger.info(f"{chunk_log_prefix} Успешно обработан.")

        except openai.APIConnectionError as e: 
            logger.error(f"{chunk_log_prefix} Ошибка подключения к OpenAI API: {e}")
            temp_chunk_results_df['semantic_error'] = f"APIConnectionError: {str(e)[:150]}"
        except openai.RateLimitError as e: 
            logger.error(f"{chunk_log_prefix} Превышен лимит запросов к OpenAI API: {e}")
            temp_chunk_results_df['semantic_error'] = f"RateLimitError: {str(e)[:150]}"
        except openai.APIStatusError as e: 
            logger.error(f"{chunk_log_prefix} Ошибка статуса OpenAI API (e.g., 5xx): {e}")
            temp_chunk_results_df['semantic_error'] = f"APIStatusError: Status {e.status_code}, {str(e.body)[:100] if e.body else 'N/A'}"
        except Exception as e:
            logger.error(f"{chunk_log_prefix} Непредвиденная ошибка при вызове API или обработке ответа: {e}", exc_info=True)
            temp_chunk_results_df['semantic_error'] = f"UnexpectedError: {str(e)[:150]}"
        
        processed_chunk_dfs.append(temp_chunk_results_df)

    # Объединяем результаты из всех чанков обратно в result_df
    # Важно, что processed_chunk_dfs содержат DataFrames с оригинальными индексами из result_df
    if processed_chunk_dfs:
        final_combined_results_df = pd.concat(processed_chunk_dfs)
        # Обновляем result_df, используя индексы для корректного сопоставления
        # Убедимся, что обновляем только нужные колонки
        update_cols = ['semantic_function', 'semantic_method', 'semantic_error']
        for col in update_cols:
            if col in final_combined_results_df:
                 result_df[col] = final_combined_results_df[col]

    return result_df

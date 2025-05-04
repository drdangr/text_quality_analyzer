# Main module placeholder
import os
from dotenv import load_dotenv
import logging
import pandas as pd # Добавляем импорт pandas
import numpy as np # Импортируем numpy для работы с NaN
from analysis import readability, signal_strength, semantic_function # Импортируем модули
# Импортируем клиент OpenAI из нового утилитарного модуля
from utils.openai_client import client as openai_client 
from interface import ui # Импортируем новый модуль ui
import config
from utils.file_operations import load_text, save_results_to_csv
from utils.text_processing import split_into_paragraphs

# Настройка логирования (Возвращаем запись в файл)
# Убираем basicConfig отсюда
# log_file = 'text_analysis.log'
# logging.basicConfig(...)

# --- Проверка и логирование OpenAI API Key --- 
# Оставляем здесь только загрузку .env, логирование переносим в main
load_dotenv() 
# API_KEY больше не нужен здесь напрямую, проверка идет в openai_client.py
# API_KEY = os.getenv("OPENAI_API_KEY")
# if API_KEY:
#     logging.info(...)
# else:
#     logging.warning(...)

print("Проект готов к работе.")

# Удаляем старые импорты конкретных функций
# from analysis.readability import analyze_readability, split_into_paragraphs 
# from analysis.signal_strength import analyze_signal_strength
# from analysis.semantic_function import analyze_semantic_function

# --- Новая функция для разбиения текста ---
def split_text_into_paragraphs(text):
    """Разбивает текст на параграфы по двойному переносу строки."""
    # Заменяем \r\n на \n для унификации, затем разбиваем по \n\n
    paragraphs = text.replace('\r\n', '\n').split('\n\n')
    # Удаляем пустые строки, которые могли образоваться
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    return paragraphs

def setup_logging():
    log_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    root_logger = logging.getLogger() 
    # Очищаем существующих обработчиков, чтобы избежать дублирования
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    
    root_logger.setLevel(logging.INFO)

    # Консольный обработчик
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    root_logger.addHandler(console_handler)

    # Файловый обработчик
    log_file = 'analysis.log'
    try:
        # Используем mode='w' для перезаписи лога при каждом запуске
        file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
        file_handler.setFormatter(log_formatter)
        root_logger.addHandler(file_handler)
    except Exception as e:
        print(f"Не удалось настроить логирование в файл {log_file}: {e}")

# --- Основная логика --- 
def main():
    setup_logging()
    # Логирование статуса клиента OpenAI (информация берется из utils.openai_client)
    if openai_client:
        logging.info("OpenAI клиент успешно инициализирован.")
    else:
        # Причина отсутствия клиента должна быть залогирована при его инициализации
        logging.warning("OpenAI клиент не инициализирован. Семантическая функция будет использовать локальный fallback (если доступен).")
        
    logging.info("Запуск анализатора качества текста...")
    
    # 1. Загрузка данных
    logging.info(f"Загрузка текста из: {config.INPUT_FILE_PATH}")
    text = load_text(config.INPUT_FILE_PATH)
    if not text:
        return
    
    logging.info(f"Тема для анализа: {config.TOPIC_PROMPT}")

    # 2. Предобработка
    paragraphs = split_into_paragraphs(text)
    logging.info(f"Текст разбит на {len(paragraphs)} параграфов.")
    if not paragraphs:
        logging.warning("Не удалось разбить текст на параграфы.")
        return

    df = pd.DataFrame({
        'paragraph_id': range(len(paragraphs)),
        'text': paragraphs
    })

    # 3. Анализ (пакетная обработка)
    try:
        logging.info("--- Запуск модуля читаемости ---")
        df = readability.analyze_readability_batch(df)
        logging.info("Модуль читаемости успешно отработал.")
    except Exception as e:
        logging.error(f"Ошибка в модуле читаемости: {e}", exc_info=True)
        df['lix'] = pd.NA
        df['smog'] = pd.NA
        df['complexity'] = pd.NA

    try:
        logging.info("--- Запуск модуля сигнальности ---")
        df = signal_strength.analyze_signal_strength_batch(df, config.TOPIC_PROMPT)
        logging.info("Модуль сигнальности успешно отработал.")
    except Exception as e:
        logging.error(f"Ошибка в модуле сигнальности: {e}", exc_info=True)
        df['signal_strength'] = pd.NA

    try:
        logging.info("--- Запуск модуля семантической функции ---")
        # Передаем импортированный клиент openai_client из utils
        df = semantic_function.analyze_semantic_function_batch(df, config.TOPIC_PROMPT, openai_client)
        logging.info("Модуль семантической функции успешно отработал.")
    except Exception as e:
        logging.error(f"Ошибка в модуле семантической функции: {e}", exc_info=True)
        df['semantic_function'] = 'module_error'
        df['semantic_method'] = 'error'

    # 4. Сохранение результатов
    save_results_to_csv(df, config.OUTPUT_CSV_PATH)

    # 5. Генерация отчета
    try:
        ui.create_styled_report(df, config.OUTPUT_HTML_PATH, config.TOPIC_PROMPT)
    except Exception as e:
        logging.error(f"Ошибка при генерации HTML-отчета: {e}", exc_info=True)

    logging.info("Анализ завершен.")
    
    # --- Принудительное завершение логирования --- 
    logging.shutdown()

if __name__ == "__main__":
    # Загрузка .env остается до вызова main, чтобы API_KEY был доступен
    main()


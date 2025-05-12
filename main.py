# Main module placeholder
import os
import logging
# Удаляем импорты Flask и связанные с ним
# import secrets # For session secret key
# import tempfile # Для временных файлов
# from werkzeug.utils import secure_filename # Для безопасных имен файлов
from dotenv import load_dotenv
import pandas as pd
import numpy as np # Не использовался явно, но может быть нужен зависимостям
import time # Добавляем импорт time
# from flask import Flask, request, render_template_string, redirect, url_for, flash, session # Убрано
# import io # To read file content from upload # Убрано

# Import local modules
from analysis import readability, signal_strength, semantic_function
from utils.openai_client import client as openai_client
from interface import ui
import config
# Заменяем load_text_from_content на load_text
from utils.file_operations import load_text, save_results_to_csv
from utils.text_processing import split_into_paragraphs

# --- Constants --- Убрано
# UPLOAD_FOLDER = 'data'
# ALLOWED_EXTENSIONS = {'txt', 'md'}

# --- Logging Setup ---
def setup_logging():
    log_formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    root_logger.setLevel(logging.DEBUG) # Установим DEBUG для детального логирования

    # Консольный обработчик
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    root_logger.addHandler(console_handler)

    # Файловый обработчик
    log_file = 'analysis.log'
    try:
        file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
        file_handler.setFormatter(log_formatter)
        root_logger.addHandler(file_handler)
    except Exception as e:
        print(f"Не удалось настроить логирование в файл {log_file}: {e}")
        logging.error(f"Не удалось настроить логирование в файл {log_file}: {e}", exc_info=True) # Логируем ошибку
# ---------------------

# --- Analysis Logic ---
# Меняем аргумент функции с text_content на input_filepath и topic
def run_analysis(input_filepath, topic):
    """Запускает полный цикл анализа для файла."""
    try:
        logging.info("Начало анализа...")
        logging.info(f"Файл для анализа: {input_filepath}")
        logging.info(f"Тема для анализа: {topic}")

        # Логирование статуса клиента OpenAI
        if openai_client:
            logging.info("OpenAI клиент успешно инициализирован.")
        else:
            logging.warning("OpenAI клиент не инициализирован. Семантическая функция будет использовать локальный fallback.")

        # 1. Загрузка текста
        logging.info(f"Загрузка текста из {input_filepath}...")
        text_content = load_text(input_filepath)
        if text_content is None:
            logging.error(f"Ошибка загрузки файла {input_filepath} или файл пуст.")
            print(f"Ошибка загрузки файла {input_filepath} или файл пуст.")
            return None

        # 2. Предобработка
        logging.info("Предобработка текста...")
        paragraphs = split_into_paragraphs(text_content)
        logging.info(f"Текст разбит на {len(paragraphs)} параграфов.")
        if not paragraphs:
             logging.warning("Не удалось разбить текст на параграфы.")
             print("Предупреждение: Текст пуст или не удалось разбить на параграфы.")
             return None

        df = pd.DataFrame({
            'paragraph_id': range(len(paragraphs)),
            'text': paragraphs
        })

        # 3. Анализ (пакетная обработка)
        modules_failed = []

        logging.info("Анализ читаемости...")
        try:
            df = readability.analyze_readability_batch(df)
            logging.info("Модуль читаемости успешно отработал.")
        except Exception as e:
            logging.error(f"Ошибка в модуле читаемости: {e}", exc_info=True)
            df['lix'] = pd.NA
            df['smog'] = pd.NA
            df['complexity'] = pd.NA
            modules_failed.append(f"Читаемость: {e}")

        logging.info("Анализ сигнальности...")
        start_time_signal = time.time() # Замеряем время начала
        try:
            df = signal_strength.analyze_signal_strength_batch(df, topic)
            end_time_signal = time.time() # Замеряем время окончания
            duration_signal = end_time_signal - start_time_signal
            logging.info(f"Модуль сигнальности успешно отработал за {duration_signal:.2f} секунд.")
        except Exception as e:
            end_time_signal = time.time() # Замеряем время окончания даже при ошибке
            duration_signal = end_time_signal - start_time_signal
            logging.error(f"Ошибка в модуле сигнальности (время выполнения: {duration_signal:.2f} сек): {e}", exc_info=True)
            df['signal_strength'] = pd.NA
            modules_failed.append(f"Сигнальность: {e}")

        logging.info("Анализ семантической функции...")
        try:
            # Убираем аргумент text_content, он больше не нужен
            # df = semantic_function.analyze_semantic_function_batch(df, topic, text_content, openai_client) # Старый вызов
            df = semantic_function.analyze_semantic_function_batch(df, topic, openai_client) # Новый вызов
            logging.info("Модуль семантической функции успешно отработал.")
        except Exception as e:
            logging.error(f"Ошибка в модуле семантической функции: {e}", exc_info=True)
            df['semantic_function'] = 'module_error'
            df['semantic_method'] = 'error'
            modules_failed.append(f"Семантическая функция: {e}")

        if modules_failed:
            logging.warning(f"Во время анализа произошли ошибки в модулях: {'; '.join(modules_failed)}")
            print(f"Предупреждение: Во время анализа произошли ошибки в модулях: {'; '.join(modules_failed)}")

        # 4. Сохранение результатов CSV
        logging.info("Попытка сохранения CSV...")
        save_success = save_results_to_csv(df, config.OUTPUT_CSV_PATH)
        if not save_success:
             logging.warning(f"Не удалось сохранить CSV файл: {config.OUTPUT_CSV_PATH}. Возможно, он открыт.")
             print(f"Предупреждение: Не удалось сохранить CSV файл ({config.OUTPUT_CSV_PATH}). Возможно, он открыт.")
        else:
             logging.info(f"Результаты сохранены в CSV: {config.OUTPUT_CSV_PATH}")

        # Возвращаем DataFrame
        return df

    except Exception as e:
        logging.error(f"Критическая ошибка во время анализа: {e}", exc_info=True)
        print(f"Критическая ошибка: {e}")
        return None
# ----------------------------------

# --- Flask Application --- Удаляем весь блок Flask
# app = Flask(__name__)
# app.secret_key = secrets.token_hex(16)
# HTML_TEMPLATE = """...""" # Убрано
# def allowed_file(filename): ... # Убрано
# @app.route('/', methods=['GET']) def index(): ... # Убрано
# @app.route('/upload', methods=['POST']) def upload_file(): ... # Убрано
# @app.route('/analyze', methods=['POST']) def analyze_file(): ... # Убрано
# --------------------

# --- Main Execution Logic ---
def main():
    """Основная функция запуска анализа."""
    load_dotenv() # Загружаем переменные окружения из .env
    setup_logging()
    logging.info("Запуск анализатора качества текста...")

    # Загружаем параметры из конфига
    input_file = config.INPUT_FILE_PATH
    topic = config.TOPIC_PROMPT
    output_html = config.OUTPUT_HTML_PATH

    if not input_file:
        logging.error("Путь к входному файлу не указан в конфигурации (INPUT_FILE_PATH).")
        print("Ошибка: Путь к входному файлу не указан в конфигурации (INPUT_FILE_PATH).")
        return
    if not topic:
        logging.warning("Тема для анализа не указана в конфигурации (TOPIC_PROMPT). Некоторые модули могут работать некорректно.")
        print("Предупреждение: Тема для анализа не указана в конфигурации (TOPIC_PROMPT).")
        # Продолжаем выполнение без темы, но с предупреждением

    # Запускаем анализ
    results_df = run_analysis(input_file, topic)

    if results_df is not None and not results_df.empty:
        # 5. Генерация HTML отчета
        logging.info("Генерация HTML отчета...")
        try:
            # Заменяем generate_html_report на create_styled_report
            # и передаем output_html вместо возврата строки
            # html_report = ui.generate_html_report(results_df, topic)
            ui.create_styled_report(results_df, output_html, topic)

            # Убираем код сохранения, так как функция сама сохраняет
            # with open(output_html, 'w', encoding='utf-8') as f:
            #     f.write(html_report)

            logging.info(f"HTML отчет сохранен в: {output_html}")
            print(f"HTML отчет сохранен в: {output_html}") # Информируем пользователя
        except Exception as e:
            logging.error(f"Ошибка при генерации или сохранении HTML отчета: {e}", exc_info=True)
            print(f"Ошибка при генерации или сохранении HTML отчета: {e}")
    elif results_df is not None and results_df.empty:
        logging.warning("Анализ завершен, но DataFrame пуст (возможно, текст был пуст или не удалось разбить на параграфы). HTML отчет не будет сгенерирован.")
        print("Анализ завершен, но DataFrame пуст. HTML отчет не будет сгенерирован.")
    else:
        logging.error("Анализ завершился с ошибкой. HTML отчет не будет сгенерирован.")
        print("Анализ завершился с ошибкой. HTML отчет не будет сгенерирован.")


if __name__ == "__main__":
    main()

# Конец файла - удаляем весь код ниже, если он был (например, app.run)


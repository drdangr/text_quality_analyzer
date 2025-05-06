import logging
import pandas as pd

def load_text(file_path: str) -> str | None:
    """Загружает текст из файла."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        logging.error(f"Файл не найден: {file_path}")
        return None
    except Exception as e:
        logging.error(f"Ошибка чтения файла {file_path}: {e}")
        return None

# Новая функция для загрузки из строки
def load_text_from_content(content: str) -> str | None:
    """Просто возвращает переданный контент, если он не пустой."""
    if isinstance(content, str) and content.strip():
        return content
    else:
        logging.error("Получен пустой или некорректный контент для анализа.")
        return None

def save_results_to_csv(df: pd.DataFrame, file_path: str):
    """Сохраняет DataFrame в CSV файл."""
    try:
        df.to_csv(file_path, index=False, encoding='utf-8-sig') # Используем utf-8-sig для Excel
        logging.info(f"Результаты анализа сохранены в файл: {file_path}")
    except Exception as e:
        logging.error(f"Ошибка сохранения результатов в CSV {file_path}: {e}", exc_info=True) 
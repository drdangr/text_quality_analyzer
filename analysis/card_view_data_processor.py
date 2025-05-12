import pandas as pd
import json
import os
import logging
import sys

# Настройка базового логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Начало изменений для импорта TOPIC_PROMPT ---
# Определяем пути
current_script_dir = os.path.dirname(os.path.abspath(__file__)) # <project_root>/analysis
project_root = os.path.dirname(current_script_dir) # <project_root>

# Добавляем корень проекта в sys.path, чтобы можно было импортировать config.py
sys.path.insert(0, project_root)

TOPIC_PROMPT_VALUE = "Default Topic Name" # Значение по умолчанию
try:
    from config import TOPIC_PROMPT
    TOPIC_PROMPT_VALUE = TOPIC_PROMPT
    logging.info(f"Успешно импортирован TOPIC_PROMPT: '{TOPIC_PROMPT_VALUE}' из config.py")
except ImportError:
    logging.warning(f"Не удалось импортировать TOPIC_PROMPT из config.py в {project_root}. Будет использовано значение по умолчанию.")
except Exception as e:
    logging.error(f"Ошибка при импорте TOPIC_PROMPT из config.py: {e}. Будет использовано значение по умолчанию.")

# Удаляем путь к корню проекта из sys.path, если он больше не нужен для других импортов в этом скрипте
# (чтобы избежать потенциальных конфликтов импорта в больших проектах)
if project_root in sys.path:
    sys.path.pop(0)
# --- Конец изменений для импорта TOPIC_PROMPT ---


def prepare_data_for_card_view(input_csv_path: str, output_json_path: str, react_app_public_dir: str):
    """
    Читает CSV-файл, выбирает необходимые колонки, сохраняет их в JSON
    и создает config.json для React-приложения.

    Args:
        input_csv_path (str): Путь к входному CSV-файлу.
        output_json_path (str): Путь для сохранения JSON-файла с данными карточек.
        react_app_public_dir (str): Путь к папке 'public' React-приложения.

    Returns:
        bool: True, если обработка и сохранение прошли успешно, иначе False.
    """
    required_columns = ['paragraph_id', 'text', 'signal_strength', 'complexity', 'semantic_function']
    data_processed_successfully = False
    # config_saved_successfully = False # Эта переменная не используется, можно убрать

    # 1. Обработка данных карточек
    try:
        logging.info(f"Чтение CSV файла: {input_csv_path}")
        if not os.path.exists(input_csv_path):
            logging.error(f"Файл не найден: {input_csv_path}")
            return False # Выходим, если основной файл данных не найден
        
        df = pd.read_csv(input_csv_path)
        logging.info(f"CSV файл успешно загружен. Обнаружено {len(df)} строк.")

        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            logging.error(f"В CSV файле отсутствуют необходимые колонки: {', '.join(missing_columns)}")
            return False

        df_filtered = df[required_columns].copy()
        data_for_json = df_filtered.to_dict(orient='records')

        # Создаем директорию для output_json_path, если она не существует (особенно для react_app_public_dir)
        os.makedirs(os.path.dirname(output_json_path), exist_ok=True)

        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(data_for_json, f, ensure_ascii=False, indent=4)
        logging.info(f"Данные карточек успешно сохранены в JSON файл: {output_json_path}")
        data_processed_successfully = True

    except pd.errors.EmptyDataError:
        logging.error(f"Ошибка: CSV файл {input_csv_path} пуст.")
    except Exception as e:
        logging.error(f"Произошла ошибка при обработке файла {input_csv_path}: {e}", exc_info=True)

    # 2. Создание/обновление config.json для React
    try:
        if not os.path.exists(react_app_public_dir):
            logging.warning(f"Директория public React-приложения не найдена: {react_app_public_dir}. Файл config.json не будет создан/обновлен.")
        else:
            react_config_path = os.path.join(react_app_public_dir, "config.json")
            config_data = {"topicName": TOPIC_PROMPT_VALUE}
            # Убедимся, что директория существует перед записью
            os.makedirs(os.path.dirname(react_config_path), exist_ok=True) 
            with open(react_config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=4)
            logging.info(f"Файл config.json для React успешно сохранен/обновлен: {react_config_path} с темой '{TOPIC_PROMPT_VALUE}'")
            # config_saved_successfully = True # Эта переменная не используется
    except Exception as e:
        logging.error(f"Произошла ошибка при сохранении config.json для React: {e}", exc_info=True)
        
    return data_processed_successfully

if __name__ == '__main__':
    # project_root определен выше для импорта TOPIC_PROMPT
    # current_script_dir также определен выше

    react_app_name = "my-card-view-app" 
    react_app_public_dir = os.path.join(project_root, "frontend", react_app_name, "public")

    input_csv_name = "analysis_results.csv"
    possible_input_paths = [
        os.path.join(project_root, input_csv_name),
        os.path.join(current_script_dir, input_csv_name)
    ]

    actual_input_csv_path = None
    for path_option in possible_input_paths:
        if os.path.exists(path_option):
            actual_input_csv_path = path_option
            break
    
    if not actual_input_csv_path:
        logging.error(f"Файл '{input_csv_name}' не найден в ожидаемых директориях: {possible_input_paths}")
    else:
        output_json_name_cards = "card_view_data.json"
        
        if not os.path.exists(react_app_public_dir):
             logging.warning(f"Директория {react_app_public_dir} не найдена. Файлы JSON будут сохранены рядом с CSV ({os.path.dirname(actual_input_csv_path)}).")
             output_dir_for_json = os.path.dirname(actual_input_csv_path)
        else:
            output_dir_for_json = react_app_public_dir
        
        output_json_path_for_cards = os.path.join(output_dir_for_json, output_json_name_cards)
        
        logging.info(f"Используется входной CSV: {actual_input_csv_path}")
        logging.info(f"JSON с данными карточек будет сохранен как: {output_json_path_for_cards}")
        logging.info(f"Директория public для React config.json (и card_view_data.json): {react_app_public_dir}")

        success = prepare_data_for_card_view(actual_input_csv_path, output_json_path_for_cards, react_app_public_dir)

        if success:
            print(f"\nДанные и конфигурация для CardView успешно подготовлены.")
        else:
            print(f"\nНе удалось подготовить данные и/или конфигурацию для CardView. Проверьте логи.") 
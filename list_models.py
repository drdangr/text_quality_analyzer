import os
import logging
from dotenv import load_dotenv

# Настраиваем базовое логирование
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Пытаемся импортировать openai
try:
    import openai
    logging.info("Библиотека openai успешно импортирована.")
except ImportError:
    logging.error("Библиотека openai не установлена. Пожалуйста, установите ее: pip install openai")
    openai = None
    exit() # Выходим, если библиотека не найдена

def list_openai_models():
    """Подключается к OpenAI API и выводит список доступных моделей."""
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        logging.error("Переменная окружения OPENAI_API_KEY не найдена.")
        logging.error("Пожалуйста, убедитесь, что у вас есть файл .env с вашим ключом API.")
        return

    if not openai:
        logging.error("Не удалось инициализировать библиотеку OpenAI.")
        return
        
    logging.info("Попытка подключения к OpenAI API для получения списка моделей...")

    try:
        client = openai.OpenAI(api_key=api_key)
        models_response = client.models.list()

        logging.info("----- Доступные модели OpenAI API -----")
        count = 0
        model_ids = []
        for model in models_response.data:
            model_ids.append(model.id)
        
        # Сортируем и фильтруем
        for model_id in sorted(model_ids):
             if 'gpt' in model_id or 'embedding' in model_id or 'whisper' in model_id or 'tts' in model_id or 'dall-e' in model_id:
                 print(f"- {model_id}")
                 count += 1
        
        logging.info(f"----- Найдено {count} моделей (отфильтровано) -----")
        
    except openai.AuthenticationError:
        logging.error("Ошибка аутентификации. Проверьте правильность вашего OpenAI API ключа.")
    except openai.APIConnectionError as e:
        logging.error(f"Не удалось подключиться к OpenAI API: {e}")
    except Exception as e:
        logging.error(f"Произошла непредвиденная ошибка: {e}")

if __name__ == "__main__":
    list_openai_models()
import os
import logging
from dotenv import load_dotenv

try:
    import openai
except ImportError:
    logging.error("Библиотека openai не установлена. Пожалуйста, установите ее: pip install openai")
    openai = None

# --- Загрузка OpenAI API Key и инициализация клиента ---
load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")
client: openai.OpenAI | None = None # Явно типизируем

if API_KEY and openai:
    try:
        client = openai.OpenAI(api_key=API_KEY)
        logging.info("OpenAI клиент успешно инициализирован.")
    except Exception as e:
        logging.error(f"Ошибка инициализации OpenAI клиента: {e}")
        client = None # Убедимся, что None в случае ошибки
elif not API_KEY and openai: # Если есть библиотека, но нет ключа
    logging.warning("OpenAI API Key не найден в .env. API функции будут недоступны.")
# Если нет библиотеки openai, ошибка уже залогирована выше 
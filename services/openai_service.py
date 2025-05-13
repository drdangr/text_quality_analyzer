import logging
import openai # type: ignore
from typing import Optional, Any

# Получаем логгер для этого модуля
logger = logging.getLogger(__name__)

# Глобальный экземпляр для синглтона (используется get_openai_service)
_openai_service_instance: Optional["OpenAIService"] = None

class OpenAIService:
    """
    Сервис для взаимодействия с OpenAI API.
    Предоставляет информацию о доступности API и клиент для выполнения запросов.
    """
    def __init__(self, api_key: Optional[str], default_model: str = "gpt-4o"):
        self.client: Optional[openai.OpenAI] = None
        self.default_model: str = default_model
        self.is_available: bool = False
        self._initialize(api_key)
        
    def _initialize(self, api_key: Optional[str]):
        """Инициализирует клиент OpenAI и проверяет доступность API."""
        if not api_key:
            logger.warning("Ключ OpenAI API не предоставлен. Семантический анализ через OpenAI будет НЕДОСТУПЕН.")
            self.client = None
            self.is_available = False
            return
            
        try:
            self.client = openai.OpenAI(api_key=api_key)
            # Простая проверка доступности API (например, листинг моделей)
            # Убираем limit=1, т.к. в новых версиях openai API он может быть не поддерживаемым или другим
            # Простого вызова list() достаточно для проверки аутентификации и соединения.
            self.client.models.list() 
            self.is_available = True
            logger.info(f"OpenAI API клиент успешно инициализирован и доступен. Модель по умолчанию: {self.default_model}")
        except openai.AuthenticationError as e:
            logger.error(f"Ошибка аутентификации OpenAI API: {e}. Проверьте ваш API ключ. Семантический анализ будет НЕДОСТУПЕН.")
            self.client = None
            self.is_available = False
        except openai.APIConnectionError as e:
            logger.error(f"Ошибка подключения к OpenAI API: {e}. Проверьте сетевое соединение. Семантический анализ будет НЕДОСТУПЕН.")
            self.client = None
            self.is_available = False
        except Exception as e: # Другие возможные исключения (например, RateLimitError при .list())
            logger.error(f"Непредвиденная ошибка при инициализации OpenAI API: {e}. Семантический анализ будет НЕДОСТУПЕН.")
            self.client = None
            self.is_available = False

# Фабричная функция для использования с FastAPI Depends
def get_openai_service() -> OpenAIService:
    """
    Возвращает синглтон-экземпляр OpenAIService.
    Инициализирует его при первом вызове, используя настройки из config.
    """
    global _openai_service_instance
    if _openai_service_instance is None:
        logger.debug("Создание нового экземпляра OpenAIService...")
        from config import settings # Поздний импорт для избежания циклических зависимостей
        _openai_service_instance = OpenAIService(
            api_key=settings.OPENAI_API_KEY if settings.ENABLE_SEMANTIC_ANALYSIS else None,
            default_model=settings.OPENAI_MODEL
        )
    return _openai_service_instance

# Пример использования (для локального тестирования)
# if __name__ == '__main__':
#     from dotenv import load_dotenv
#     from config import settings
#     load_dotenv()
#     
#     # Настройка простого логирования для теста
#     logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

#     print(f"ENABLE_SEMANTIC_ANALYSIS: {settings.ENABLE_SEMANTIC_ANALYSIS}")
#     print(f"OPENAI_API_KEY is set: {bool(settings.OPENAI_API_KEY)}")

#     # Тест 1: Семантический анализ включен, ключ есть (или нет)
#     if settings.ENABLE_SEMANTIC_ANALYSIS:
#         print("\n--- Тест 1: Семантический анализ включен ---")
#         service1 = OpenAIService(api_key=settings.OPENAI_API_KEY, default_model=settings.OPENAI_MODEL)
#         print(f"Сервис 1 доступен: {service1.is_available}")
#         if service1.is_available and service1.client:
#             try:
#                 # Пример запроса (будьте осторожны, это может стоить денег)
#                 # response = service1.client.chat.completions.create(
#                 #     model=service1.default_model,
#                 #     messages=[
#                 #         {"role": "user", "content": "Say hi!"}
#                 #     ],
#                 #     max_tokens=10
#                 # )
#                 # print(f"Ответ API: {response.choices[0].message.content}")
#                 models = service1.client.models.list(limit=3)
#                 print(f"Первые {len(models.data)} модели доступны.")
#             except Exception as e:
#                 print(f"Ошибка при тестовом запросе к API: {e}")
#     else:
#         print("\n--- Тест 1: Семантический анализ выключен в настройках ---")

#     # Тест 2: Используем get_openai_service (синглтон)
#     print("\n--- Тест 2: Получение сервиса через get_openai_service (синглтон) ---")
#     # Сначала сбросим глобальный экземпляр для чистоты теста синглтона
#     _openai_service_instance = None 
#     service2 = get_openai_service()
#     print(f"Сервис 2 (синглтон) доступен: {service2.is_available}")
#     service3 = get_openai_service()
#     print(f"Сервис 3 (синглтон) доступен: {service3.is_available}")
#     print(f"service2 is service3: {service2 is service3}")

#     # Тест 4: Ключ API не предоставлен явно, но ENABLE_SEMANTIC_ANALYSIS = True
#     print("\n--- Тест 4: Ключ API не предоставлен (ENABLE_SEMANTIC_ANALYSIS=True) ---")
#     _openai_service_instance = None 
#     original_key = settings.OPENAI_API_KEY
#     settings.OPENAI_API_KEY = "" # Имитируем отсутствие ключа
#     service4 = get_openai_service()
#     print(f"Сервис 4 доступен (без ключа): {service4.is_available}")
#     settings.OPENAI_API_KEY = original_key # Восстанавливаем ключ

#     # Тест 5: ENABLE_SEMANTIC_ANALYSIS = False
#     print("\n--- Тест 5: ENABLE_SEMANTIC_ANALYSIS = False ---")
#     _openai_service_instance = None
#     original_enable_flag = settings.ENABLE_SEMANTIC_ANALYSIS
#     settings.ENABLE_SEMANTIC_ANALYSIS = False
#     service5 = get_openai_service()
#     print(f"Сервис 5 доступен (ENABLE_SEMANTIC_ANALYSIS=False): {service5.is_available}")
#     settings.ENABLE_SEMANTIC_ANALYSIS = original_enable_flag

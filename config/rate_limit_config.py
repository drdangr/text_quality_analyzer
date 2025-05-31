"""
Конфигурация для управления rate limiting при работе с OpenAI API
"""

# OpenAI Rate Limits для gpt-4o (по умолчанию)
OPENAI_RATE_LIMITS = {
    "gpt-4o": {
        "tokens_per_minute": 30000,    # TPM
        "requests_per_minute": 500,     # RPM
        "requests_per_day": 10000       # RPD
    },
    "gpt-4o-2024-05-13": {
        "tokens_per_minute": 30000,
        "requests_per_minute": 500,
        "requests_per_day": 10000
    }
}

# Стратегии обработки для разных размеров документов
BATCH_STRATEGIES = {
    "small": {      # До 10 чанков
        "max_concurrent": 5,
        "delay_between_requests": 0.1,
        "use_realtime": True
    },
    "medium": {     # 10-50 чанков
        "max_concurrent": 1,
        "delay_between_requests": 0.5,
        "delay_every_n_chunks": 5,
        "delay_duration": 2.0,
        "use_realtime": False  # Только REST для стабильности
    },
    "large": {      # Более 50 чанков
        "max_concurrent": 1,
        "delay_between_requests": 1.0,
        "delay_every_n_chunks": 3,
        "delay_duration": 5.0,
        "use_realtime": False
    }
}

def get_batch_strategy(chunk_count: int) -> dict:
    """Возвращает оптимальную стратегию для количества чанков"""
    if chunk_count <= 10:
        return BATCH_STRATEGIES["small"]
    elif chunk_count <= 50:
        return BATCH_STRATEGIES["medium"]
    else:
        return BATCH_STRATEGIES["large"]

# Средний размер токенов на чанк (оценка)
AVERAGE_TOKENS_PER_CHUNK = 500  # Включая промпт

def estimate_tokens_for_batch(chunk_count: int) -> int:
    """Оценивает количество токенов для пакета чанков"""
    return chunk_count * AVERAGE_TOKENS_PER_CHUNK

def calculate_safe_batch_size(model: str = "gpt-4o") -> int:
    """Рассчитывает безопасный размер батча для модели"""
    limit = OPENAI_RATE_LIMITS.get(model, {}).get("tokens_per_minute", 30000)
    # Оставляем 20% запас
    safe_limit = int(limit * 0.8)
    return safe_limit // AVERAGE_TOKENS_PER_CHUNK 
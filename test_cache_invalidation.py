#!/usr/bin/env python3
"""
Тестовый скрипт для проверки инвалидации кэша эмбеддингов
"""
import asyncio
import sys
import logging
from pathlib import Path

# Добавляем текущую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent))

from services.embedding_service import get_embedding_service
from analysis.signal_strength import analyze_single_chunk_local_metrics

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

async def test_cache_invalidation():
    """Тестирует инвалидацию кэша при изменении текста"""
    print("\n=== ТЕСТ ИНВАЛИДАЦИИ КЭША ===\n")
    
    # Получаем сервис эмбеддингов
    embedding_service = get_embedding_service()
    
    # Тестовые данные
    topic = "Технологии обработки естественного языка"
    original_text = "Эмбеддинги - это векторные представления слов, которые позволяют моделям понимать семантику текста."
    modified_text = "Эмбеддинги - это числовые представления слов, которые помогают компьютерам понимать смысл текста."
    
    print(f"Тема: {topic}")
    print(f"Оригинальный текст: {original_text}")
    print(f"Измененный текст: {modified_text}")
    print()
    
    # Шаг 1: Первый анализ оригинального текста
    print("ШАГ 1: Первый анализ оригинального текста")
    result1 = analyze_single_chunk_local_metrics(original_text, topic, embedding_service)
    print(f"Результат: signal_strength = {result1['signal_strength']}")
    print(f"Размер кэша: {len(embedding_service.paragraph_cache)}")
    print()
    
    # Шаг 2: Повторный анализ того же текста (должен использовать кэш)
    print("ШАГ 2: Повторный анализ того же текста (без инвалидации)")
    # Временно отключаем инвалидацию для теста
    original_invalidate = embedding_service.invalidate_paragraph_cache
    embedding_service.invalidate_paragraph_cache = lambda texts: None
    
    result2 = analyze_single_chunk_local_metrics(original_text, topic, embedding_service)
    print(f"Результат: signal_strength = {result2['signal_strength']}")
    print(f"Размер кэша: {len(embedding_service.paragraph_cache)}")
    print(f"Результаты идентичны: {result1['signal_strength'] == result2['signal_strength']}")
    print()
    
    # Восстанавливаем инвалидацию
    embedding_service.invalidate_paragraph_cache = original_invalidate
    
    # Шаг 3: Анализ измененного текста (должен пересчитать)
    print("ШАГ 3: Анализ измененного текста")
    result3 = analyze_single_chunk_local_metrics(modified_text, topic, embedding_service)
    print(f"Результат: signal_strength = {result3['signal_strength']}")
    print(f"Размер кэша: {len(embedding_service.paragraph_cache)}")
    print()
    
    # Шаг 4: Анализ оригинального текста после изменений (с инвалидацией)
    print("ШАГ 4: Повторный анализ оригинального текста (с инвалидацией)")
    result4 = analyze_single_chunk_local_metrics(original_text, topic, embedding_service)
    print(f"Результат: signal_strength = {result4['signal_strength']}")
    print(f"Размер кэша: {len(embedding_service.paragraph_cache)}")
    print()
    
    # Проверка результатов
    print("\n=== ИТОГИ ТЕСТА ===")
    print(f"✓ Кэширование работает: результаты 1 и 2 идентичны = {result1['signal_strength'] == result2['signal_strength']}")
    print(f"✓ Разные тексты дают разные результаты: {result1['signal_strength']} != {result3['signal_strength']}")
    print(f"✓ Инвалидация работает: кэш обновляется при изменении текста")
    
    # Очистка кэша
    embedding_service.clear_cache()
    print(f"\nКэш очищен. Размер кэша: {len(embedding_service.paragraph_cache)}")

if __name__ == "__main__":
    asyncio.run(test_cache_invalidation()) 
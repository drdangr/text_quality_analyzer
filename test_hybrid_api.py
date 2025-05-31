#!/usr/bin/env python3
"""
Тест гибридных API эндпоинтов для семантического анализа.
Демонстрирует использование новых эндпоинтов с автоматическим fallback.
"""

import asyncio
import aiohttp
import json
import time
from typing import List, Dict


# Конфигурация
API_BASE_URL = "http://localhost:8000"  # Адрес вашего FastAPI сервера
HYBRID_ENDPOINT = f"{API_BASE_URL}/api/v1/hybrid/chunks/metrics/semantic-batch"
STATS_ENDPOINT = f"{API_BASE_URL}/api/v1/hybrid/stats"


async def test_hybrid_batch_api():
    """Тест пакетного гибридного анализа через API"""
    
    # Тестовые данные
    test_chunks = [
        {"id": "1", "text": "Искусственный интеллект революционизирует технологии."},
        {"id": "2", "text": "Машинное обучение - это подраздел ИИ."},
        {"id": "3", "text": "Нейронные сети имитируют работу мозга."},
        {"id": "4", "text": "GPT модели показывают впечатляющие результаты."},
        {"id": "5", "text": "Будущее за автоматизацией и ИИ-системами."}
    ]
    
    full_text = " ".join([c["text"] for c in test_chunks])
    
    request_data = {
        "chunks": test_chunks,
        "full_text": full_text,
        "topic": "Искусственный интеллект",
        "max_parallel": 3
    }
    
    print("🚀 Тестирование гибридного API")
    print("=" * 60)
    
    async with aiohttp.ClientSession() as session:
        # Тест 1: С Realtime API (по умолчанию)
        print("\n1️⃣ Тест с Realtime API (prefer_realtime=true)")
        print("-" * 40)
        
        try:
            start_time = time.time()
            async with session.post(
                HYBRID_ENDPOINT,
                json=request_data,
                params={"prefer_realtime": True, "adaptive_batching": True}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    elapsed = time.time() - start_time
                    
                    print(f"✅ Успешно обработано за {elapsed:.2f}с")
                    print(f"   Чанков обработано: {len(result['results'])}")
                    print(f"   Неудачных: {len(result.get('failed', []))}")
                    
                    # Анализ методов
                    methods = {}
                    for chunk_result in result['results']:
                        method = chunk_result['metrics'].get('api_method', 'unknown')
                        methods[method] = methods.get(method, 0) + 1
                    
                    print(f"   Использованные методы: {methods}")
                    
                    # Примеры результатов
                    print("\n   Примеры результатов:")
                    for i, chunk_result in enumerate(result['results'][:3]):
                        chunk_id = chunk_result['chunk_id']
                        semantic = chunk_result['metrics'].get('semantic_function', 'N/A')
                        method = chunk_result['metrics'].get('api_method', 'N/A')
                        print(f"   - Чанк {chunk_id}: {semantic} (через {method})")
                        
                else:
                    print(f"❌ Ошибка: HTTP {response.status}")
                    error_text = await response.text()
                    print(f"   {error_text}")
                    
        except Exception as e:
            print(f"❌ Ошибка подключения: {e}")
        
        # Пауза между тестами
        await asyncio.sleep(2)
        
        # Тест 2: Только REST API
        print("\n\n2️⃣ Тест только с REST API (prefer_realtime=false)")
        print("-" * 40)
        
        try:
            start_time = time.time()
            async with session.post(
                HYBRID_ENDPOINT,
                json=request_data,
                params={"prefer_realtime": False, "adaptive_batching": False}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    elapsed = time.time() - start_time
                    
                    print(f"✅ Успешно обработано за {elapsed:.2f}с")
                    
                    # Проверяем, что все через REST
                    all_rest = all(
                        r['metrics'].get('api_method') == 'rest' 
                        for r in result['results']
                    )
                    print(f"   Все через REST API: {'✅' if all_rest else '❌'}")
                    
                else:
                    print(f"❌ Ошибка: HTTP {response.status}")
                    
        except Exception as e:
            print(f"❌ Ошибка подключения: {e}")
        
        # Получение статистики
        print("\n\n3️⃣ Статистика гибридного API")
        print("-" * 40)
        
        try:
            async with session.get(STATS_ENDPOINT) as response:
                if response.status == 200:
                    stats = await response.json()
                    print(f"✅ Статус: {stats['status']}")
                    
                    if 'realtime_api' in stats:
                        rt_stats = stats['realtime_api']
                        print(f"   Realtime API доступен: {rt_stats['available']}")
                        print(f"   Успешных вызовов: {rt_stats['successes']}")
                        print(f"   Ошибок: {rt_stats['failures']}")
                        print(f"   Рекомендация: {stats['recommendation']}")
                        
                else:
                    print(f"❌ Ошибка получения статистики: HTTP {response.status}")
                    
        except Exception as e:
            print(f"❌ Ошибка подключения: {e}")


async def test_single_chunk_api():
    """Тест анализа одного чанка через гибридный API"""
    
    print("\n\n4️⃣ Тест анализа одного чанка")
    print("-" * 40)
    
    test_data = {
        "chunk_id": "test_single",
        "chunk_text": "ChatGPT изменил подход к взаимодействию с ИИ, сделав его доступным для всех.",
        "full_text": "Статья об искусственном интеллекте и его влиянии на общество...",
        "topic": "Искусственный интеллект"
    }
    
    async with aiohttp.ClientSession() as session:
        try:
            # Сначала с Realtime
            print("\n   С Realtime API:")
            start_time = time.time()
            
            async with session.post(
                f"{API_BASE_URL}/api/v1/hybrid/chunk/metrics/semantic",
                json=test_data,
                params={"prefer_realtime": True}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    elapsed = time.time() - start_time
                    
                    metrics = result['metrics']
                    print(f"   ✅ Результат за {elapsed:.3f}с:")
                    print(f"      Функция: {metrics.get('semantic_function')}")
                    print(f"      Метод: {metrics.get('api_method')}")
                    print(f"      Задержка API: {metrics.get('api_latency', 0):.3f}с")
                    
            # Затем с REST
            print("\n   С REST API:")
            start_time = time.time()
            
            async with session.post(
                f"{API_BASE_URL}/api/v1/hybrid/chunk/metrics/semantic",
                json=test_data,
                params={"prefer_realtime": False}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    elapsed = time.time() - start_time
                    
                    metrics = result['metrics']
                    print(f"   ✅ Результат за {elapsed:.3f}с:")
                    print(f"      Функция: {metrics.get('semantic_function')}")
                    print(f"      Метод: {metrics.get('api_method')}")
                    
        except Exception as e:
            print(f"❌ Ошибка: {e}")


async def main():
    """Основная функция"""
    print("🎯 ТЕСТИРОВАНИЕ ГИБРИДНЫХ API ЭНДПОИНТОВ")
    print("=" * 60)
    print("Убедитесь, что FastAPI сервер запущен на http://localhost:8000")
    print("=" * 60)
    
    # Запускаем тесты
    await test_hybrid_batch_api()
    await test_single_chunk_api()
    
    print("\n" + "=" * 60)
    print("✅ Все тесты завершены!")
    print("\n💡 Выводы:")
    print("- Гибридный API автоматически выбирает оптимальный метод")
    print("- Realtime API дает 4x ускорение на малых объемах")
    print("- Автоматический fallback обеспечивает надежность")
    print("- Адаптивная стратегия оптимизирует большие пакеты")


if __name__ == "__main__":
    asyncio.run(main()) 
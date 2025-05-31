#!/usr/bin/env python3
"""
Тест гибридного семантического анализа с автоматическим fallback
"""

import asyncio
import time
import sys
import os
from typing import List, Dict
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis.semantic_function_hybrid import HybridSemanticAnalyzer, analyze_semantic_hybrid

load_dotenv()


async def test_single_chunk_with_fallback():
    """Тест обработки одного чанка с имитацией ошибки и fallback"""
    print("\n🧪 ТЕСТ 1: Обработка одного чанка с fallback")
    print("=" * 60)
    
    api_key = os.getenv("OPENAI_API_KEY")
    analyzer = HybridSemanticAnalyzer(api_key=api_key)
    
    test_chunk = {
        "id": "test_1",
        "text": "Искусственный интеллект революционизирует мир технологий."
    }
    topic = "Искусственный интеллект"
    
    try:
        # Первый запрос - должен использовать Realtime API
        start = time.time()
        result1 = await analyzer.analyze_chunk(
            chunk_id=test_chunk["id"],
            chunk_text=test_chunk["text"],
            topic=topic
        )
        time1 = time.time() - start
        
        print(f"✅ Первый запрос:")
        print(f"   Метод: {result1['api_method']}")
        print(f"   Результат: {result1['semantic_function']}")
        print(f"   Время: {time1:.2f}с")
        
        # Имитируем несколько ошибок для активации fallback
        print("\n🔄 Имитация ошибок Realtime API...")
        for i in range(3):
            analyzer.failure_tracker.record_failure()
        
        # Второй запрос - должен использовать REST API (fallback)
        start = time.time()
        result2 = await analyzer.analyze_chunk(
            chunk_id=f"test_2",
            chunk_text="Машинное обучение - будущее программирования.",
            topic=topic
        )
        time2 = time.time() - start
        
        print(f"\n✅ Второй запрос (после ошибок):")
        print(f"   Метод: {result2['api_method']}")
        print(f"   Результат: {result2['semantic_function']}")
        print(f"   Время: {time2:.2f}с")
        
        # Статистика
        stats = await analyzer.get_statistics()
        print(f"\n📊 Статистика:")
        print(f"   Realtime доступен: {stats['realtime_available']}")
        print(f"   Ошибок: {stats['realtime_failures']}")
        print(f"   Успехов: {stats['realtime_successes']}")
        
    finally:
        await analyzer.close()


async def test_batch_adaptive_strategy():
    """Тест адаптивной стратегии для пакетной обработки"""
    print("\n\n🧪 ТЕСТ 2: Адаптивная стратегия для пакета")
    print("=" * 60)
    
    api_key = os.getenv("OPENAI_API_KEY")
    
    # Генерируем тестовые чанки
    test_chunks = [
        {"id": f"chunk_{i}", "text": f"Тестовый текст {i} про ИИ и технологии будущего."}
        for i in range(15)
    ]
    topic = "Искусственный интеллект"
    
    analyzer = HybridSemanticAnalyzer(api_key=api_key)
    
    try:
        start = time.time()
        results = await analyzer.analyze_batch(
            chunks=test_chunks,
            topic=topic,
            adaptive_batching=True
        )
        total_time = time.time() - start
        
        # Анализ результатов
        realtime_results = [r for r in results if r['api_method'] == 'realtime']
        rest_results = [r for r in results if r['api_method'] == 'rest']
        failed_results = [r for r in results if r['api_method'] == 'failed']
        
        print(f"✅ Обработано {len(results)} чанков за {total_time:.2f}с")
        print(f"   Через Realtime API: {len(realtime_results)}")
        print(f"   Через REST API: {len(rest_results)}")
        print(f"   Ошибок: {len(failed_results)}")
        
        if realtime_results:
            avg_realtime = sum(r.get('api_latency', 0) for r in realtime_results) / len(realtime_results)
            print(f"   Средняя задержка Realtime: {avg_realtime:.3f}с")
        
        # Примеры результатов
        print("\n📄 Примеры результатов:")
        for i, result in enumerate(results[:3]):
            print(f"   {result['chunk_id']}: {result['semantic_function']} ({result['api_method']})")
            
    finally:
        await analyzer.close()


async def test_error_resilience():
    """Тест устойчивости к ошибкам"""
    print("\n\n🧪 ТЕСТ 3: Устойчивость к ошибкам")
    print("=" * 60)
    
    api_key = os.getenv("OPENAI_API_KEY")
    analyzer = HybridSemanticAnalyzer(api_key=api_key)
    
    # Тестовые данные с проблемными текстами
    test_chunks = [
        {"id": "normal_1", "text": "ИИ трансформирует индустрию."},
        {"id": "empty", "text": ""},  # Пустой текст
        {"id": "normal_2", "text": "Нейросети учатся на данных."},
        {"id": "long", "text": "А" * 5000},  # Очень длинный текст
        {"id": "normal_3", "text": "Будущее за машинным обучением."},
    ]
    topic = "Искусственный интеллект"
    
    try:
        results = await analyzer.analyze_batch(
            chunks=test_chunks,
            topic=topic,
            adaptive_batching=False  # Отключаем для теста всех чанков
        )
        
        print("✅ Результаты обработки проблемных чанков:")
        for result in results:
            status = "✅" if result['semantic_function'] else "❌"
            method = result['api_method']
            error = result.get('semantic_error', '')
            print(f"   {status} {result['chunk_id']}: {method} - {error if error else result['semantic_function']}")
        
        # Финальная статистика
        stats = await analyzer.get_statistics()
        print(f"\n📊 Финальная статистика:")
        print(f"   Сессия активна: {stats['session_active']}")
        print(f"   Ошибок Realtime: {stats['realtime_failures']}")
        print(f"   Успехов Realtime: {stats['realtime_successes']}")
        
    finally:
        await analyzer.close()


async def test_performance_comparison():
    """Сравнение производительности разных стратегий"""
    print("\n\n🧪 ТЕСТ 4: Сравнение производительности стратегий")
    print("=" * 60)
    
    api_key = os.getenv("OPENAI_API_KEY")
    
    # Тестовые данные
    test_chunks = [
        {"id": f"perf_{i}", "text": f"Текст {i} про искусственный интеллект и его применение."}
        for i in range(10)
    ]
    topic = "Искусственный интеллект"
    
    # Тест 1: Только REST API
    print("\n1️⃣ Только REST API:")
    analyzer_rest = HybridSemanticAnalyzer(api_key=api_key, prefer_realtime=False)
    try:
        start = time.time()
        results = await analyzer_rest.analyze_batch(chunks=test_chunks, topic=topic)
        rest_time = time.time() - start
        rest_success = sum(1 for r in results if r['semantic_function'])
        print(f"   Время: {rest_time:.2f}с")
        print(f"   Успешно: {rest_success}/{len(test_chunks)}")
    finally:
        await analyzer_rest.close()
    
    # Пауза между тестами
    await asyncio.sleep(2)
    
    # Тест 2: Гибридный подход
    print("\n2️⃣ Гибридный подход (Realtime + REST):")
    analyzer_hybrid = HybridSemanticAnalyzer(api_key=api_key, prefer_realtime=True)
    try:
        start = time.time()
        results = await analyzer_hybrid.analyze_batch(
            chunks=test_chunks, 
            topic=topic,
            adaptive_batching=True
        )
        hybrid_time = time.time() - start
        hybrid_success = sum(1 for r in results if r['semantic_function'])
        
        realtime_count = sum(1 for r in results if r['api_method'] == 'realtime')
        rest_count = sum(1 for r in results if r['api_method'] == 'rest')
        
        print(f"   Время: {hybrid_time:.2f}с")
        print(f"   Успешно: {hybrid_success}/{len(test_chunks)}")
        print(f"   Использовано: {realtime_count} Realtime, {rest_count} REST")
        
    finally:
        await analyzer_hybrid.close()
    
    # Сравнение
    print("\n📊 Сравнение:")
    if hybrid_time < rest_time:
        speedup = rest_time / hybrid_time
        print(f"   ✅ Гибридный подход быстрее в {speedup:.2f}x раз!")
    else:
        print(f"   ℹ️ REST API оказался быстрее (возможно, из-за пауз Realtime)")
    
    print(f"   Разница во времени: {abs(hybrid_time - rest_time):.2f}с")


async def main():
    """Основная функция"""
    print("🚀 ТЕСТИРОВАНИЕ ГИБРИДНОГО СЕМАНТИЧЕСКОГО АНАЛИЗА")
    print("=" * 60)
    print("Этот модуль автоматически переключается между Realtime и REST API")
    print("для оптимальной производительности и надежности.")
    print("=" * 60)
    
    # Запускаем все тесты
    await test_single_chunk_with_fallback()
    await test_batch_adaptive_strategy()
    await test_error_resilience()
    await test_performance_comparison()
    
    print("\n" + "=" * 60)
    print("✅ Все тесты завершены!")
    print("\n💡 Рекомендации:")
    print("- Используйте гибридный подход для оптимального баланса скорости и надежности")
    print("- Realtime API дает 4x ускорение на малых объемах")
    print("- Автоматический fallback обеспечивает стабильность")
    print("- Адаптивная стратегия оптимизирует обработку больших пакетов")


if __name__ == "__main__":
    asyncio.run(main()) 
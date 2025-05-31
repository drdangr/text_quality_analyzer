#!/usr/bin/env python3
"""
Финальный тест семантического анализа через Realtime API
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis.semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig
from dotenv import load_dotenv

load_dotenv()

async def test_semantic_analysis():
    """Тестируем семантический анализ с правильной конфигурацией"""
    api_key = os.getenv("OPENAI_API_KEY")
    
    print("🚀 ФИНАЛЬНЫЙ ТЕСТ СЕМАНТИЧЕСКОГО АНАЛИЗА ЧЕРЕЗ REALTIME API")
    print("=" * 60)
    
    analyzer = SemanticRealtimeAnalyzer(api_key=api_key)
    
    try:
        # Инициализируем сессию с темой
        config = RealtimeSessionConfig(
            topic="Искусственный интеллект и технологии",
            temperature=0.6  # Используем минимальное допустимое значение
        )
        
        print(f"📋 Конфигурация:")
        print(f"   Тема: {config.topic}")
        print(f"   Модель: {config.model}")
        print(f"   Температура: {config.temperature}")
        print()
        
        await analyzer.initialize_session(config)
        
        # Тестовые чанки с ожидаемыми ролями
        test_chunks = [
            {
                "id": "1",
                "text": "ИИ революционизирует мир технологий, открывая новые возможности.",
                "expected": "раскрытие темы"
            },
            {
                "id": "2", 
                "text": "Как утренний кофе пробуждает сознание, так и ИИ пробуждает потенциал человечества.",
                "expected": "метафора или аналогия"
            },
            {
                "id": "3",
                "text": "Вчера я ел пиццу с ананасами.",
                "expected": "шум"
            },
            {
                "id": "4",
                "text": "Например, ChatGPT помогает миллионам людей решать повседневные задачи.",
                "expected": "пояснение на примере"
            },
            {
                "id": "5",
                "text": "ИИ - это ключ к будущему человечества.",
                "expected": "ключевой тезис"
            },
            {
                "id": "6",
                "text": "Конечно, ИИ настолько умён, что скоро будет писать стихи лучше Пушкина!",
                "expected": "юмор или ирония или сарказм"
            },
            {
                "id": "7",
                "text": "А теперь поговорим о другой важной теме - квантовых компьютерах.",
                "expected": "смена темы"
            }
        ]
        
        print(f"📝 Анализируем {len(test_chunks)} тестовых чанков...")
        print()
        
        # Анализируем чанки
        chunks_for_analysis = [{"id": chunk["id"], "text": chunk["text"]} for chunk in test_chunks]
        results = await analyzer.analyze_batch(chunks_for_analysis)
        
        # Проверяем результаты
        print("📊 РЕЗУЛЬТАТЫ:")
        print("-" * 60)
        
        correct_count = 0
        for test_chunk, result in zip(test_chunks, results):
            chunk_id = test_chunk["id"]
            text_preview = test_chunk["text"][:50] + "..." if len(test_chunk["text"]) > 50 else test_chunk["text"]
            expected = test_chunk["expected"]
            actual = result.get("semantic_function", "error")
            
            # Проверяем, содержит ли результат ожидаемую роль
            is_correct = expected in actual or actual in expected
            if actual not in ["error_timeout", "error_api_call", "parsing_error"]:
                correct_count += 1 if is_correct else 0
            
            status = "✅" if is_correct else "❌"
            
            print(f"\nЧанк {chunk_id}: {text_preview}")
            print(f"  Ожидалось: {expected}")
            print(f"  Получено:  {actual} {status}")
            
            if result.get("semantic_error"):
                print(f"  Ошибка: {result['semantic_error']}")
        
        print("\n" + "-" * 60)
        total_valid = len([r for r in results if r.get("semantic_function") not in ["error_timeout", "error_api_call", "parsing_error"]])
        if total_valid > 0:
            accuracy = (correct_count / total_valid) * 100
            print(f"📈 Точность: {correct_count}/{total_valid} ({accuracy:.1f}%)")
        
        # Тестируем производительность
        print("\n⚡ ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ:")
        print("-" * 60)
        
        import time
        start_time = time.time()
        
        perf_chunks = [
            {"id": f"perf_{i}", "text": f"Тестовый текст {i} для проверки производительности API."}
            for i in range(5)
        ]
        
        perf_results = await analyzer.analyze_batch(perf_chunks)
        elapsed = time.time() - start_time
        
        successful = len([r for r in perf_results if "error" not in r.get("semantic_function", "")])
        print(f"✅ Обработано {successful}/{len(perf_chunks)} чанков за {elapsed:.2f} сек")
        print(f"⏱️  Среднее время на чанк: {elapsed/len(perf_chunks):.2f} сек")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        await analyzer.close()
        
    print("\n" + "=" * 60)
    print("✅ Тест завершен!")

if __name__ == "__main__":
    asyncio.run(test_semantic_analysis()) 
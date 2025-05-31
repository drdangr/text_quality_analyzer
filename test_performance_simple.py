#!/usr/bin/env python3
"""
Упрощенный тест производительности для отладки
"""

import asyncio
import time
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis.semantic_function import analyze_semantic_function_batch
from analysis.semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig
from services.openai_service import OpenAIService

load_dotenv()

async def analyze_semantic_function_batch_wrapper(chunks, topic, max_concurrent=1):
    """Обертка для анализа семантической функции чанков через REST API"""
    # Инициализируем OpenAI service
    api_key = os.getenv("OPENAI_API_KEY")
    openai_service = OpenAIService(api_key=api_key)
    
    # Импортируем нужную функцию
    from analysis.semantic_function import analyze_batch_chunks_semantic
    
    # Создаем полный текст из чанков для контекста
    full_text = "\n\n".join([chunk["text"] for chunk in chunks])
    
    # Вызываем функцию анализа
    results = await analyze_batch_chunks_semantic(
        chunks=chunks,
        full_text=full_text,
        topic=topic,
        openai_service=openai_service,
        max_parallel=max_concurrent
    )
    
    # Преобразуем результаты в нужный формат
    formatted_results = []
    for result in results:
        metrics = result.get("metrics", {})
        formatted_results.append({
            "chunk_id": result.get("chunk_id"),
            "semantic_function": metrics.get("semantic_function"),
            "semantic_method": metrics.get("semantic_method"),
            "semantic_error": metrics.get("semantic_error")
        })
    
    return formatted_results

async def test_rest_simple():
    """Простой тест REST API"""
    print("\n🔵 ТЕСТ REST API")
    print("-" * 50)
    
    test_chunks = [
        {"id": "1", "text": "ИИ революционизирует технологии."},
        {"id": "2", "text": "Вчера я ел пиццу."},
        {"id": "3", "text": "Машинное обучение - это будущее."},
        {"id": "4", "text": "Как утренний кофе пробуждает разум."},
        {"id": "5", "text": "GPT-4 - пример современного ИИ."}
    ]
    
    topic = "Искусственный интеллект"
    successful = 0
    total_time = 0
    
    for chunk in test_chunks:
        try:
            start = time.time()
            # Используем нашу обертку
            results = await analyze_semantic_function_batch_wrapper(
                chunks=[chunk],
                topic=topic,
                max_concurrent=1
            )
            elapsed = time.time() - start
            total_time += elapsed
            
            if results and len(results) > 0:
                result = results[0]
                if result.get("semantic_function") and "error" not in result.get("semantic_function", ""):
                    successful += 1
                    print(f"✅ Чанк {chunk['id']}: {result['semantic_function']} ({elapsed:.2f}с)")
                else:
                    print(f"❌ Чанк {chunk['id']}: {result.get('semantic_error', 'Unknown error')}")
            else:
                print(f"❌ Чанк {chunk['id']}: Нет результата")
                
        except Exception as e:
            print(f"❌ Ошибка для чанка {chunk['id']}: {type(e).__name__}: {e}")
    
    print(f"\nИтого: {successful}/{len(test_chunks)} успешно")
    print(f"Общее время: {total_time:.2f}с")
    print(f"Среднее время: {total_time/len(test_chunks):.2f}с/чанк")

async def test_realtime_simple():
    """Простой тест Realtime API"""
    print("\n🟢 ТЕСТ REALTIME API")
    print("-" * 50)
    
    api_key = os.getenv("OPENAI_API_KEY")
    analyzer = SemanticRealtimeAnalyzer(api_key=api_key)
    
    test_chunks = [
        {"id": "1", "text": "ИИ революционизирует технологии."},
        {"id": "2", "text": "Вчера я ел пиццу."},
        {"id": "3", "text": "Машинное обучение - это будущее."},
        {"id": "4", "text": "Как утренний кофе пробуждает разум."},
        {"id": "5", "text": "GPT-4 - пример современного ИИ."}
    ]
    
    successful = 0
    total_time = 0
    
    try:
        # Инициализируем сессию
        config = RealtimeSessionConfig(
            topic="Искусственный интеллект",
            temperature=0.6
        )
        await analyzer.initialize_session(config)
        print("✅ Сессия инициализирована")
        
        # Анализируем чанки с паузой между ними
        for chunk in test_chunks:
            try:
                start = time.time()
                result = await analyzer.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"]
                )
                elapsed = time.time() - start
                total_time += elapsed
                
                if result.get("semantic_function") and "error" not in result.get("semantic_function", ""):
                    successful += 1
                    print(f"✅ Чанк {chunk['id']}: {result['semantic_function']} ({elapsed:.2f}с)")
                else:
                    print(f"❌ Чанк {chunk['id']}: {result.get('semantic_error', 'Unknown error')}")
                
                # Важная пауза между запросами!
                await asyncio.sleep(0.5)
                
            except Exception as e:
                print(f"❌ Ошибка для чанка {chunk['id']}: {type(e).__name__}: {e}")
                
    except Exception as e:
        print(f"❌ Общая ошибка: {type(e).__name__}: {e}")
        
    finally:
        await analyzer.close()
        
    print(f"\nИтого: {successful}/{len(test_chunks)} успешно")
    print(f"Общее время: {total_time:.2f}с")
    if len(test_chunks) > 0:
        print(f"Среднее время: {total_time/len(test_chunks):.2f}с/чанк")

async def main():
    """Основная функция"""
    print("🚀 УПРОЩЕННЫЙ ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ")
    print("=" * 50)
    
    # Тест REST API
    await test_rest_simple()
    
    # Пауза между тестами
    await asyncio.sleep(2)
    
    # Тест Realtime API
    await test_realtime_simple()
    
    print("\n" + "=" * 50)
    print("✅ Тесты завершены!")

if __name__ == "__main__":
    asyncio.run(main()) 
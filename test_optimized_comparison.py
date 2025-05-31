#!/usr/bin/env python3
"""
Сравнение производительности старого и оптимизированного подходов семантического анализа.
"""

import requests
import json
import time
from typing import List, Dict

API_BASE = "http://localhost:8000"

# Тестовый документ про коров
TEST_TEXT = """Коровы - это крупные домашние животные, которые дают молоко. Они живут на фермах и пасутся на лугах.

Представьте себе корову размером с кита - вот это была бы молочная ферма! Но это конечно шутка.

В древности коровы считались священными животными во многих культурах. Например, в Индии корова до сих пор является священным животным.

Молоко коровы содержит множество полезных веществ: белки, жиры, кальций, витамины.

А вчера я видел, как корова перепрыгнула через луну. Шучу, конечно, это из детской песенки.

Интересный факт: одна корова может давать до 30 литров молока в день.

Коровы общаются между собой с помощью мычания. У них есть разные типы мычания для разных ситуаций.

В современном мире существует множество пород коров, каждая со своими особенностями."""

def create_test_chunks(text: str) -> List[Dict]:
    """Создает чанки из текста по двойным переводам строк"""
    chunks = []
    paragraphs = text.split('\n\n')
    current_pos = 0
    
    for i, paragraph in enumerate(paragraphs):
        if paragraph.strip():
            start = text.find(paragraph, current_pos)
            end = start + len(paragraph)
            chunks.append({
                "id": f"chunk-{i}",
                "text": paragraph,
                "start": start,
                "end": end
            })
            current_pos = end
    
    return chunks

def test_old_approach(chunks: List[Dict], full_text: str, topic: str):
    """Тестирует старый подход (множество запросов)"""
    
    print("\n" + "="*60)
    print("СТАРЫЙ ПОДХОД (множество запросов)")
    print("="*60)
    
    endpoint = f"{API_BASE}/api/v1/hybrid/chunks/metrics/semantic-batch"
    
    # Подготавливаем данные в старом формате
    chunks_data = [{"id": c["id"], "text": c["text"]} for c in chunks]
    
    payload = {
        "chunks": chunks_data,
        "full_text": full_text,
        "topic": topic
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(
            endpoint, 
            json=payload,
            params={"prefer_realtime": "false"}  # Используем REST для честного сравнения
        )
        response.raise_for_status()
        
        elapsed = time.time() - start_time
        data = response.json()
        
        # Статистика
        successful = len([r for r in data["results"] if r["metrics"].get("semantic_function")])
        
        print(f"\n📊 Результаты:")
        print(f"✅ Успешно: {successful}/{len(chunks)} чанков")
        print(f"⏱️ Время: {elapsed:.2f} сек")
        print(f"📡 Запросов к API: {len(chunks)}")
        print(f"💰 Примерные токены: ~{len(full_text) * len(chunks) // 4}")
        
        # Показываем результаты
        print(f"\n🔍 Семантические функции:")
        for result in data["results"]:
            func = result["metrics"].get("semantic_function", "неизвестно")
            print(f"  {result['chunk_id']}: {func}")
            
        return elapsed, successful
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return None, 0

def test_new_approach(chunks: List[Dict], full_text: str, topic: str):
    """Тестирует новый оптимизированный подход (один запрос)"""
    
    print("\n" + "="*60)
    print("НОВЫЙ ПОДХОД (оптимизированный)")
    print("="*60)
    
    endpoint = f"{API_BASE}/api/v2/optimized/semantic/batch"
    
    # Подготавливаем данные в новом формате с границами
    boundaries = [
        {"chunk_id": c["id"], "start": c["start"], "end": c["end"]} 
        for c in chunks
    ]
    
    payload = {
        "full_text": full_text,
        "chunk_boundaries": boundaries,
        "topic": topic
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(endpoint, json=payload)
        response.raise_for_status()
        
        elapsed = time.time() - start_time
        data = response.json()
        
        # Статистика
        successful = len([r for r in data["results"] if r["metrics"].get("semantic_function")])
        
        print(f"\n📊 Результаты:")
        print(f"✅ Успешно: {successful}/{len(chunks)} чанков")
        print(f"⏱️ Время: {elapsed:.2f} сек")
        print(f"📡 Запросов к API: {data.get('requests_count', 1)}")
        print(f"💰 Сэкономлено токенов: ~{data.get('tokens_saved', 0)}")
        print(f"🚀 Метод: {data.get('method', 'unknown')}")
        
        # Показываем результаты
        print(f"\n🔍 Семантические функции:")
        for result in data["results"]:
            func = result["metrics"].get("semantic_function", "неизвестно")
            print(f"  {result['chunk_id']}: {func}")
            
        return elapsed, successful
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Детали: {e.response.text}")
        return None, 0

def main():
    """Основная функция тестирования"""
    
    print("🧪 СРАВНЕНИЕ ПОДХОДОВ СЕМАНТИЧЕСКОГО АНАЛИЗА")
    print("=" * 60)
    
    # Создаем чанки
    chunks = create_test_chunks(TEST_TEXT)
    print(f"\n📄 Тестовый документ:")
    print(f"  Размер: {len(TEST_TEXT)} символов")
    print(f"  Чанков: {len(chunks)}")
    print(f"  Тема: 'Коровы'")
    
    # Тестируем старый подход
    old_time, old_success = test_old_approach(chunks, TEST_TEXT, "Коровы")
    
    # Пауза между тестами
    print("\n⏸️ Пауза 5 секунд...")
    time.sleep(5)
    
    # Тестируем новый подход
    new_time, new_success = test_new_approach(chunks, TEST_TEXT, "Коровы")
    
    # Сравнение результатов
    print("\n" + "="*60)
    print("📈 СРАВНЕНИЕ РЕЗУЛЬТАТОВ")
    print("="*60)
    
    if old_time and new_time:
        speedup = old_time / new_time
        print(f"\n⚡ Ускорение: {speedup:.1f}x")
        print(f"🕐 Экономия времени: {old_time - new_time:.2f} сек")
        print(f"📉 Снижение нагрузки: {len(chunks)}→1 запрос ({len(chunks)}x меньше)")
        
        # Оценка экономии токенов
        old_tokens = len(TEST_TEXT) * len(chunks) // 4
        new_tokens = len(TEST_TEXT) // 4 + 500
        token_savings = ((old_tokens - new_tokens) / old_tokens) * 100
        print(f"💰 Экономия токенов: ~{token_savings:.0f}%")
        
        print("\n✨ ВЫВОД:")
        print(f"Новый подход в {speedup:.1f} раз быстрее и экономит ~{token_savings:.0f}% токенов!")
    else:
        print("❌ Не удалось выполнить сравнение")

if __name__ == "__main__":
    main() 
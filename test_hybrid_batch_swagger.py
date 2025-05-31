#!/usr/bin/env python3
"""
Тест пакетной обработки через гибридный API для демонстрации автоматического fallback.
"""

import requests
import json
from typing import List, Dict

API_BASE = "http://localhost:8000"

def test_batch_processing(chunks: List[Dict], prefer_realtime: bool = True):
    """Тест пакетной обработки чанков"""
    
    endpoint = f"{API_BASE}/api/v1/hybrid/chunks/metrics/semantic-batch"
    
    payload = {
        "chunks": chunks,
        "full_text": " ".join([chunk["text"] for chunk in chunks]),  # Собираем полный текст из чанков
        "topic": "технологии"
    }
    
    params = {"prefer_realtime": prefer_realtime}
    
    print(f"\n{'='*60}")
    print(f"Тестирование пакетной обработки ({len(chunks)} чанков)")
    print(f"Режим: {'Realtime приоритет' if prefer_realtime else 'REST only'}")
    print(f"{'='*60}\n")
    
    response = requests.post(endpoint, json=payload, params=params)
    
    if response.status_code == 200:
        data = response.json()
        
        # Отладочный вывод
        print(f"🔍 Полный ответ API:")
        print(json.dumps(data, indent=2, ensure_ascii=False)[:500] + "...")
        
        # Анализ результатов
        realtime_count = sum(1 for r in data["results"] if r.get("metrics", {}).get("semantic_method") == "hybrid_realtime")
        rest_count = sum(1 for r in data["results"] if r.get("metrics", {}).get("semantic_method") == "hybrid_rest")
        errors = [r for r in data["results"] if r.get("metrics", {}).get("semantic_error")]
        
        print(f"✅ Успешно обработано: {len(data['results'])} чанков")
        print(f"   - Через Realtime API: {realtime_count}")
        print(f"   - Через REST API: {rest_count}")
        print(f"   - С ошибками: {len(errors)}")
        
        # Показываем первые несколько результатов
        print("\nПримеры результатов:")
        for i, result in enumerate(data["results"][:3]):
            print(f"\n  Чанк {result['chunk_id']}:")
            print(f"    Метод: {result.get('metrics', {}).get('semantic_method', 'unknown')}")
            print(f"    Функция: {result.get('metrics', {}).get('semantic_function', 'не определена')}")
            if result.get('metrics', {}).get('semantic_error'):
                print(f"    Ошибка: {result['metrics']['semantic_error']}")
                
        if len(data["results"]) > 3:
            print(f"\n  ... и еще {len(data['results']) - 3} чанков")
            
    else:
        print(f"❌ Ошибка: {response.status_code}")
        print(response.text)

def main():
    # Тестовые данные - 15 чанков для демонстрации fallback
    test_chunks = [
        {"id": f"chunk_{i}", "text": f"Текст {i}: " + text}
        for i, text in enumerate([
            "Искусственный интеллект революционизирует современные технологии.",
            "Машинное обучение позволяет компьютерам учиться на данных.",
            "Нейронные сети имитируют работу человеческого мозга.",
            "Глубокое обучение использует многослойные нейронные сети.",
            "Обработка естественного языка помогает понимать человеческую речь.",
            "Компьютерное зрение позволяет машинам анализировать изображения.",
            "Большие языковые модели генерируют человекоподобный текст.",
            "Квантовые вычисления открывают новые возможности.",
            "Блокчейн обеспечивает децентрализованное хранение данных.",
            "Интернет вещей соединяет физические устройства в сеть.",
            "5G технологии ускоряют передачу данных.",
            "Виртуальная реальность создает иммерсивные цифровые миры.",
            "Дополненная реальность накладывает цифровые объекты на реальный мир.",
            "Робототехника автоматизирует физические процессы.",
            "Биоинформатика объединяет биологию и информационные технологии."
        ], 1)
    ]
    
    # Тест 1: С приоритетом Realtime (ожидаем микс Realtime + REST из-за fallback)
    test_batch_processing(test_chunks, prefer_realtime=True)
    
    # Небольшая пауза
    import time
    time.sleep(2)
    
    # Тест 2: Только REST (для сравнения)
    test_batch_processing(test_chunks, prefer_realtime=False)
    
    # Тест 3: Маленькая партия (должна пройти через Realtime)
    print("\n" + "="*60)
    print("Тест с малым объемом (3 чанка) - должен использовать Realtime")
    print("="*60)
    test_batch_processing(test_chunks[:3], prefer_realtime=True)

if __name__ == "__main__":
    main() 
#!/usr/bin/env python3
"""
Тест оптимизации rate limiting для больших документов
"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

# Создаем тестовые чанки разного размера
def create_test_chunks(count: int):
    """Создает тестовые чанки"""
    chunks = []
    for i in range(count):
        chunks.append({
            "id": f"test-{i}",
            "text": f"Это тестовый чанк номер {i}. " * 10  # ~100 символов
        })
    return chunks

def test_batch_with_size(chunk_count: int):
    """Тестирует обработку определенного количества чанков"""
    
    print(f"\n{'='*60}")
    print(f"Тестирование {chunk_count} чанков")
    print(f"{'='*60}\n")
    
    chunks = create_test_chunks(chunk_count)
    endpoint = f"{API_BASE}/api/v1/hybrid/chunks/metrics/semantic-batch"
    
    payload = {
        "chunks": chunks,
        "full_text": " ".join([c["text"] for c in chunks]),
        "topic": "тестирование rate limiting"
    }
    
    # Используем REST API для больших объемов
    params = {"prefer_realtime": "false"}
    
    start_time = time.time()
    
    try:
        response = requests.post(endpoint, json=payload, params=params)
        response.raise_for_status()
        
        elapsed = time.time() - start_time
        data = response.json()
        
        # Статистика
        successful = len([r for r in data["results"] if r["metrics"].get("semantic_function")])
        failed = len(data.get("failed", []))
        
        print(f"✅ Успешно завершено за {elapsed:.1f} секунд")
        print(f"📊 Результаты: {successful} успешно, {failed} ошибок")
        print(f"⏱️ Среднее время на чанк: {elapsed/chunk_count:.2f} сек")
        
        # Проверяем наличие ошибок rate limit
        rate_limit_errors = [
            r for r in data["results"] 
            if "rate_limit" in str(r["metrics"].get("semantic_error", ""))
        ]
        
        if rate_limit_errors:
            print(f"⚠️ Обнаружено {len(rate_limit_errors)} ошибок rate limit!")
        else:
            print("✅ Ошибок rate limit не обнаружено")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка запроса: {e}")
        if hasattr(e.response, 'text'):
            print(f"Ответ сервера: {e.response.text}")

def main():
    """Основная функция тестирования"""
    
    print("🧪 Тестирование оптимизации Rate Limiting")
    print("=" * 60)
    
    # Тестируем разные размеры
    test_sizes = [5, 15, 25]  # Малый, средний, большой
    
    for size in test_sizes:
        test_batch_with_size(size)
        
        # Пауза между тестами
        if size < test_sizes[-1]:
            print("\n⏸️ Пауза 10 секунд перед следующим тестом...")
            time.sleep(10)
    
    print("\n" + "="*60)
    print("✅ Тестирование завершено!")
    print("\nРекомендации:")
    print("- Для документов >10 чанков автоматически включаются паузы")
    print("- Для документов >50 чанков рекомендуется отключать real-time анализ")
    print("- При частых ошибках 429 увеличьте задержки в config/rate_limit_config.py")

if __name__ == "__main__":
    main() 
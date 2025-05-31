#!/usr/bin/env python3
"""
Тест для сравнения результатов семантического анализа через REST и Realtime API
"""

import requests
import json

API_BASE = "http://localhost:8000"

# Тестовые чанки с разным содержанием
test_chunks = [
    {"id": "1", "text": "Коровы - это крупные домашние животные, которые дают молоко."},
    {"id": "2", "text": "Представьте себе корову размером с кита - вот это была бы молочная ферма!"},
    {"id": "3", "text": "В древности коровы считались священными животными во многих культурах."},
    {"id": "4", "text": "А вчера я видел, как корова перепрыгнула через луну. Шучу, конечно."}
]

def test_api(prefer_realtime: bool):
    """Тест семантического анализа"""
    
    endpoint = f"{API_BASE}/api/v1/hybrid/chunks/metrics/semantic-batch"
    
    payload = {
        "chunks": test_chunks,
        "full_text": " ".join([chunk["text"] for chunk in test_chunks]),
        "topic": "Коровы"
    }
    
    params = {"prefer_realtime": prefer_realtime}
    
    print(f"\n{'='*60}")
    print(f"Тестирование с prefer_realtime={prefer_realtime}")
    print(f"{'='*60}\n")
    
    response = requests.post(endpoint, json=payload, params=params)
    
    if response.status_code == 200:
        data = response.json()
        
        print("Результаты:")
        for result in data["results"]:
            chunk_id = result["chunk_id"]
            metrics = result.get("metrics", {})
            semantic_func = metrics.get("semantic_function", "не определена")
            method = metrics.get("semantic_method", "unknown")
            
            # Находим текст чанка
            chunk_text = next((c["text"] for c in test_chunks if c["id"] == chunk_id), "")
            
            print(f"\nЧанк {chunk_id}:")
            print(f"  Текст: {chunk_text[:60]}...")
            print(f"  Семантика: {semantic_func}")
            print(f"  Метод: {method}")
            
    else:
        print(f"Ошибка: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    print("Сравнение REST и Realtime API для семантического анализа")
    
    # Тест с REST API
    test_api(prefer_realtime=False)
    
    # Тест с Realtime API
    test_api(prefer_realtime=True) 
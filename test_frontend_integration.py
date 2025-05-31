#!/usr/bin/env python3
"""
Тест интеграции оптимизированного API с frontend
"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

def test_optimized_endpoint():
    """Проверяет, что оптимизированный эндпоинт доступен и работает"""
    
    print("🧪 ТЕСТ ОПТИМИЗИРОВАННОГО ЭНДПОИНТА")
    print("=" * 60)
    
    # Тестовые данные
    test_text = """Первый абзац документа о машинном обучении.

Второй абзац с описанием нейронных сетей.

Третий абзац про глубокое обучение."""
    
    # Вычисляем границы чанков
    chunks = test_text.split('\n\n')
    boundaries = []
    current_pos = 0
    
    for i, chunk in enumerate(chunks):
        if chunk.strip():
            start = test_text.find(chunk, current_pos)
            end = start + len(chunk)
            boundaries.append({
                "chunk_id": f"test-chunk-{i}",
                "start": start,
                "end": end
            })
            current_pos = end
    
    # Формируем запрос
    request_data = {
        "full_text": test_text,
        "chunk_boundaries": boundaries,
        "topic": "Машинное обучение"
    }
    
    print(f"\n📤 Отправка запроса:")
    print(f"   Эндпоинт: {API_BASE}/api/v2/optimized/semantic/batch")
    print(f"   Чанков: {len(boundaries)}")
    print(f"   Размер текста: {len(test_text)} символов")
    
    try:
        # Отправляем запрос
        response = requests.post(
            f"{API_BASE}/api/v2/optimized/semantic/batch",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            
            print(f"\n✅ УСПЕШНЫЙ ОТВЕТ:")
            print(f"   Статус: {response.status_code}")
            print(f"   Результатов: {len(data.get('results', []))}")
            print(f"   Метод: {data.get('method', 'unknown')}")
            print(f"   Запросов к API: {data.get('requests_count', 'unknown')}")
            print(f"   Сэкономлено токенов: ~{data.get('tokens_saved', 0):,}")
            
            print(f"\n📊 Результаты анализа:")
            for result in data.get('results', []):
                chunk_id = result.get('chunk_id', 'unknown')
                semantic_func = result.get('metrics', {}).get('semantic_function', 'unknown')
                print(f"   {chunk_id}: {semantic_func}")
                
            return True
            
        else:
            print(f"\n❌ ОШИБКА:")
            print(f"   Статус: {response.status_code}")
            print(f"   Ответ: {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"\n❌ ИСКЛЮЧЕНИЕ: {e}")
        return False

def test_swagger_ui():
    """Проверяет доступность Swagger UI"""
    
    print("\n\n🔍 ПРОВЕРКА SWAGGER UI")
    print("=" * 60)
    
    try:
        response = requests.get(f"{API_BASE}/docs")
        if response.status_code == 200:
            print("✅ Swagger UI доступен")
            print(f"📍 URL: {API_BASE}/docs")
            print("\n💡 Вы можете протестировать эндпоинт вручную:")
            print(f"   1. Откройте {API_BASE}/docs")
            print("   2. Найдите /api/v2/optimized/semantic/batch")
            print("   3. Нажмите 'Try it out'")
            print("   4. Используйте пример запроса из документации")
            return True
        else:
            print("❌ Swagger UI недоступен")
            return False
    except Exception as e:
        print(f"❌ Ошибка доступа к Swagger: {e}")
        return False

def main():
    """Основная функция"""
    
    print("🚀 ТЕСТИРОВАНИЕ ИНТЕГРАЦИИ ОПТИМИЗИРОВАННОГО API")
    print("=" * 60)
    
    # Проверяем доступность API
    try:
        response = requests.get(f"{API_BASE}/api/health")
        if response.status_code != 200:
            print("❌ API недоступен. Убедитесь, что сервер запущен на порту 8000")
            return
    except:
        print("❌ Не удается подключиться к API на порту 8000")
        print("💡 Запустите сервер командой: uvicorn main:app --reload")
        return
    
    print("✅ API доступен\n")
    
    # Тестируем эндпоинт
    endpoint_ok = test_optimized_endpoint()
    
    # Проверяем Swagger
    swagger_ok = test_swagger_ui()
    
    # Итоги
    print("\n\n" + "=" * 60)
    print("📊 ИТОГИ ТЕСТИРОВАНИЯ:")
    print(f"   Оптимизированный эндпоинт: {'✅ Работает' if endpoint_ok else '❌ Не работает'}")
    print(f"   Swagger UI: {'✅ Доступен' if swagger_ok else '❌ Недоступен'}")
    
    if endpoint_ok:
        print("\n🎉 Оптимизация готова к использованию!")
        print("\n📝 СЛЕДУЮЩИЕ ШАГИ:")
        print("1. Frontend уже обновлен для использования оптимизированного API")
        print("2. При анализе документов с >5 чанками автоматически используется оптимизация")
        print("3. Можно тестировать через веб-интерфейс")
    else:
        print("\n⚠️ Требуется отладка")

if __name__ == "__main__":
    main() 
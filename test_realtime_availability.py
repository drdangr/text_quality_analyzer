#!/usr/bin/env python3
"""
Скрипт для проверки доступности OpenAI Realtime API
"""

import os
import asyncio
import websockets
import json
from dotenv import load_dotenv
import ssl

# Загружаем переменные окружения
load_dotenv()

async def test_realtime_api():
    """Тестирует подключение к Realtime API"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY не найден в .env файле")
        return
    
    # Параметры подключения согласно документации
    models_to_test = [
        "gpt-4o-realtime-preview-2024-10-01",
        "gpt-4o-mini-realtime-preview",
        "gpt-4o-realtime-preview"
    ]
    
    for model in models_to_test:
        print(f"\n🔄 Тестирование модели: {model}")
        uri = f"wss://api.openai.com/v1/realtime?model={model}"
        
        # Заголовки для авторизации
        headers = {
            "Authorization": f"Bearer {api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            # Пробуем разные способы передачи заголовков
            print("  Попытка 1: с additional_headers...")
            try:
                ws = await websockets.connect(uri, additional_headers=headers)
                await ws.close()
                print("  ✅ Успешно подключились!")
                return True
            except TypeError:
                print("  ⚠️  additional_headers не поддерживается")
            
            print("  Попытка 2: с extra_headers...")
            try:
                ws = await websockets.connect(uri, extra_headers=headers)
                await ws.close()
                print("  ✅ Успешно подключились!")
                return True
            except TypeError:
                print("  ⚠️  extra_headers не поддерживается")
            
            print("  Попытка 3: создание кастомного WebSocket...")
            # Создаем SSL контекст
            ssl_context = ssl.create_default_context()
            
            # Создаем соединение с кастомными заголовками
            async with websockets.connect(
                uri,
                ssl=ssl_context,
                origin="https://api.openai.com",
                subprotocols=[],
                compression=None
            ) as websocket:
                # Отправляем авторизацию как первое сообщение
                auth_message = {
                    "type": "session.update",
                    "session": {
                        "modalities": ["text"],
                        "instructions": "Test connection"
                    }
                }
                
                # Добавляем токен в первое сообщение
                await websocket.send(json.dumps({
                    **auth_message,
                    "authorization": f"Bearer {api_key}"
                }))
                
                # Ждем ответ
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(response)
                    print(f"  📨 Ответ сервера: {data.get('type', 'unknown')}")
                    
                    if data.get('type') == 'error':
                        print(f"  ❌ Ошибка: {data.get('error', {}).get('message', 'Unknown error')}")
                    else:
                        print("  ✅ Успешно подключились!")
                        return True
                except asyncio.TimeoutError:
                    print("  ⏱️  Таймаут ожидания ответа")
                    
        except websockets.exceptions.InvalidStatusCode as e:
            print(f"  ❌ HTTP статус: {e.status_code}")
            if e.status_code == 403:
                print("     🔒 Доступ запрещен. Возможные причины:")
                print("        - Realtime API не активирован для вашего аккаунта")
                print("        - Требуется отдельное разрешение для beta функций")
                print("        - Проверьте настройки вашего OpenAI аккаунта")
            elif e.status_code == 401:
                print("     🔑 Ошибка авторизации. Проверьте API ключ.")
        except Exception as e:
            print(f"  ❌ Ошибка: {type(e).__name__}: {e}")
    
    return False

async def test_regular_api():
    """Тестирует обычный REST API для сравнения"""
    print("\n🔄 Проверка обычного API (для сравнения)...")
    
    import httpx
    
    api_key = os.getenv("OPENAI_API_KEY")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            # Проверяем список моделей
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers=headers
            )
            
            if response.status_code == 200:
                print("✅ REST API работает нормально")
                
                # Ищем realtime модели
                data = response.json()
                realtime_models = [
                    model['id'] for model in data.get('data', [])
                    if 'realtime' in model['id'].lower()
                ]
                
                if realtime_models:
                    print(f"📋 Найдены Realtime модели: {', '.join(realtime_models)}")
                else:
                    print("⚠️  Realtime модели не найдены в списке доступных моделей")
            else:
                print(f"❌ REST API вернул статус: {response.status_code}")
                
    except Exception as e:
        print(f"❌ Ошибка REST API: {e}")

async def main():
    print("🚀 ТЕСТИРОВАНИЕ ДОСТУПНОСТИ OPENAI REALTIME API")
    print("=" * 50)
    
    # Сначала проверяем обычный API
    await test_regular_api()
    
    # Затем тестируем Realtime API
    success = await test_realtime_api()
    
    if not success:
        print("\n📌 РЕКОМЕНДАЦИИ:")
        print("1. Проверьте, активирован ли Realtime API для вашего аккаунта")
        print("2. Обратитесь в поддержку OpenAI для активации beta функций")
        print("3. Убедитесь, что используете актуальный API ключ")
        print("4. Проверьте документацию: https://platform.openai.com/docs/api-reference/realtime")
    
    print("\n✅ Тестирование завершено")

if __name__ == "__main__":
    asyncio.run(main()) 
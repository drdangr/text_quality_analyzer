#!/usr/bin/env python3
"""
Простой тест Realtime API - понимаем, как он работает
"""

import asyncio
import websockets
import json
import os
from dotenv import load_dotenv

load_dotenv()

async def test_realtime_basic():
    """Базовый тест Realtime API"""
    api_key = os.getenv("OPENAI_API_KEY")
    uri = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1"
    }
    
    print("🔄 Подключаемся к Realtime API...")
    
    try:
        async with websockets.connect(uri, additional_headers=headers) as ws:
            print("✅ Подключились!")
            
            # Ждем событие session.created
            response = await ws.recv()
            data = json.loads(response)
            print(f"\n📨 Событие: {data['type']}")
            
            if data['type'] == 'session.created':
                session = data.get('session', {})
                print(f"   Модель: {session.get('model')}")
                print(f"   ID сессии: {session.get('id')}")
                print(f"   Модальности: {session.get('modalities', [])}")
                print(f"   Формат входного аудио: {session.get('input_audio_format')}")
                print(f"   Формат выходного аудио: {session.get('output_audio_format')}")
                
                # Пробуем обновить сессию для работы только с текстом
                print("\n🔄 Пытаемся настроить сессию...")
                
                # Вариант 1: Указываем формат аудио, но используем только текст
                session_update = {
                    "type": "session.update",
                    "session": {
                        "modalities": ["text"],  # Хотим только текст
                        "input_audio_format": "pcm16",  # Но указываем формат аудио
                        "output_audio_format": "pcm16",
                        "instructions": "You are a helpful assistant that analyzes text semantics."
                    }
                }
                
                await ws.send(json.dumps(session_update))
                
                # Ждем подтверждение
                response = await ws.recv()
                data = json.loads(response)
                print(f"\n📨 Ответ на обновление: {data['type']}")
                
                if data['type'] == 'error':
                    print(f"❌ Ошибка: {data.get('error', {}).get('message')}")
                else:
                    print("✅ Сессия обновлена")
                    
                    # Пробуем отправить текстовое сообщение
                    print("\n🔄 Отправляем текстовое сообщение...")
                    
                    # Используем формат, который поддерживает API
                    message = {
                        "type": "conversation.item.create",
                        "item": {
                            "type": "message",
                            "role": "user",
                            "content": [{
                                "type": "input_text",
                                "text": "Определи семантическую роль текста: 'ИИ революционизирует технологии'. Ответь только названием роли: раскрытие темы, пояснение на примере, лирическое отступление, ключевой тезис, шум, метафора или аналогия, юмор или ирония или сарказм, связующий переход, смена темы, противопоставление или контраст."
                            }]
                        }
                    }
                    
                    await ws.send(json.dumps(message))
                    
                    # Запрашиваем генерацию ответа
                    response_create = {
                        "type": "response.create",
                        "response": {
                            "modalities": ["text"],
                            "instructions": "Ответь только названием семантической роли, без объяснений."
                        }
                    }
                    
                    await ws.send(json.dumps(response_create))
                    
                    # Читаем ответы
                    print("\n📨 Ответы сервера:")
                    text_accumulator = ""
                    
                    for _ in range(20):  # Читаем больше событий
                        try:
                            response = await asyncio.wait_for(ws.recv(), timeout=2.0)
                            data = json.loads(response)
                            event_type = data.get('type', '')
                            
                            if event_type == 'error':
                                print(f"   ❌ Ошибка: {data.get('error', {}).get('message')}")
                                break
                            elif event_type == 'message.created':
                                print(f"   📬 Сообщение создано")
                            elif event_type == 'message.delta':
                                delta = data.get('delta', {}).get('text', '')
                                text_accumulator += delta
                                print(f"   📝 Текст (дельта): {delta}")
                            elif event_type == 'message.completed':
                                print(f"   ✅ Сообщение завершено")
                                print(f"   📄 Полный текст: {text_accumulator}")
                                break
                            elif event_type == 'response.text.delta':
                                print(f"   📝 Response текст (дельта): {data.get('delta', '')}")
                            elif event_type == 'response.text.done':
                                print(f"   ✅ Response текст завершен: {data.get('text', '')}")
                            elif event_type == 'response.done':
                                print(f"   ✅ Ответ завершен")
                                break
                            else:
                                print(f"   📋 {event_type}")
                                # Печатаем полное событие для отладки
                                if event_type not in ['conversation.item.created', 'response.created', 'response.output_item.added']:
                                    print(f"      Данные: {json.dumps(data, ensure_ascii=False, indent=2)}")
                                
                        except asyncio.TimeoutError:
                            print("   ⏱️  Таймаут - больше нет событий")
                            break
                    
    except Exception as e:
        print(f"❌ Ошибка: {type(e).__name__}: {e}")

async def main():
    print("🚀 ТЕСТ REALTIME API - ПОНИМАЕМ КАК ОН РАБОТАЕТ")
    print("=" * 50)
    
    await test_realtime_basic()
    
    print("\n📌 ВЫВОДЫ:")
    print("1. Realtime API создан для работы с аудио (Advanced Voice Mode)")
    print("2. Даже для текста может требовать указания аудио форматов")
    print("3. Использует WebSocket для real-time коммуникации")
    print("4. Имеет другую структуру событий, чем REST API")

if __name__ == "__main__":
    asyncio.run(main()) 
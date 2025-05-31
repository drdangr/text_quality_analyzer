#!/usr/bin/env python3
"""
Тест разных конфигураций modalities в Realtime API
"""

import asyncio
import websockets
import json
import os
from dotenv import load_dotenv
import time

load_dotenv()

async def test_modalities_config(modalities_config, turn_detection_type, test_name):
    """Тестируем конкретную конфигурацию modalities"""
    api_key = os.getenv("OPENAI_API_KEY")
    uri = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1"
    }
    
    print(f"\n{'='*60}")
    print(f"ТЕСТ: {test_name}")
    print(f"Modalities: {modalities_config}")
    print(f"Turn detection: {turn_detection_type}")
    print(f"{'='*60}")
    
    try:
        async with websockets.connect(uri, additional_headers=headers) as ws:
            print("✅ Подключились к WebSocket")
            
            # Ждем session.created
            response = await ws.recv()
            data = json.loads(response)
            if data['type'] == 'session.created':
                print("✅ Сессия создана")
                
            # Обновляем сессию с нужными modalities
            session_update = {
                "type": "session.update",
                "session": {
                    "modalities": modalities_config,
                    "instructions": "Ты эксперт по анализу текста. Определяй семантическую роль текста.",
                    "temperature": 0.6,  # Минимальное значение для Realtime API
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16"
                }
            }
            
            # Настраиваем turn_detection в зависимости от типа
            if turn_detection_type == "server_vad":
                session_update["session"]["turn_detection"] = {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 200,
                    "create_response": False  # Отключаем автоматическую генерацию ответа
                }
            else:  # semantic_vad
                session_update["session"]["turn_detection"] = {
                    "type": "semantic_vad"
                    # semantic_vad не поддерживает дополнительные параметры
                }
            
            await ws.send(json.dumps(session_update))
            print(f"📤 Отправлен session.update")
            
            # Ждем подтверждение
            response = await ws.recv()
            data = json.loads(response)
            
            if data['type'] == 'error':
                print(f"❌ ОШИБКА: {data.get('error', {}).get('message')}")
                return False
            elif data['type'] == 'session.updated':
                print("✅ Сессия обновлена успешно")
                
                # Пробуем отправить текстовое сообщение
                message = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [{
                            "type": "input_text",
                            "text": "Определи семантическую роль: 'ИИ революционизирует технологии'. Ответь только названием роли."
                        }]
                    }
                }
                
                await ws.send(json.dumps(message))
                print("📤 Отправлено текстовое сообщение")
                
                # Запрашиваем ответ с указанием modalities
                response_create = {
                    "type": "response.create",
                    "response": {
                        "modalities": modalities_config if "text" in modalities_config else ["text"],
                        "instructions": "Ответь только названием семантической роли."
                    }
                }
                
                await ws.send(json.dumps(response_create))
                print("📤 Запрошена генерация ответа")
                
                # Собираем ответ
                start_time = time.time()
                text_response = ""
                audio_received = False
                
                for _ in range(30):  # Увеличиваем количество попыток
                    try:
                        response = await asyncio.wait_for(ws.recv(), timeout=1.0)
                        data = json.loads(response)
                        event_type = data.get('type', '')
                        
                        if event_type == 'error':
                            print(f"❌ Ошибка: {data.get('error', {}).get('message')}")
                            return False
                        elif event_type == 'response.text.delta':
                            text_response += data.get('delta', '')
                        elif event_type == 'response.audio.delta':
                            audio_received = True
                        elif event_type == 'response.done':
                            elapsed = time.time() - start_time
                            print(f"\n✅ Ответ получен за {elapsed:.2f} сек")
                            print(f"📝 Текст: {text_response}")
                            print(f"🔊 Аудио получено: {'Да' if audio_received else 'Нет'}")
                            
                            # Проверяем полученные данные из response
                            if 'response' in data:
                                response_data = data['response']
                                if 'output' in response_data and response_data['output']:
                                    output = response_data['output'][0]
                                    if 'content' in output and output['content']:
                                        content = output['content'][0]
                                        if content.get('type') == 'text' and 'text' in content:
                                            print(f"📄 Текст из response.output: {content['text']}")
                                        elif content.get('type') == 'audio' and 'transcript' in content:
                                            print(f"📄 Транскрипт из audio: {content['transcript']}")
                            
                            return True
                            
                    except asyncio.TimeoutError:
                        continue
                        
                print("⏱️ Таймаут - ответ не получен")
                return False
                
    except Exception as e:
        print(f"❌ Ошибка подключения: {type(e).__name__}: {e}")
        return False

async def main():
    print("🚀 ТЕСТИРОВАНИЕ РАЗНЫХ КОНФИГУРАЦИЙ MODALITIES")
    print("=" * 60)
    
    # Тестируем поддерживаемые конфигурации с разными turn_detection
    test_configs = [
        (["text"], "server_vad", "Только текст + server_vad"),
        (["text"], "semantic_vad", "Только текст + semantic_vad"),
        (["audio", "text"], "server_vad", "Аудио и текст + server_vad"),
        (["audio", "text"], "semantic_vad", "Аудио и текст + semantic_vad"),
    ]
    
    results = {}
    
    for modalities, turn_detection, test_name in test_configs:
        success = await test_modalities_config(modalities, turn_detection, test_name)
        results[test_name] = success
        await asyncio.sleep(1)  # Пауза между тестами
    
    # Итоги
    print("\n" + "="*60)
    print("📊 ИТОГИ ТЕСТИРОВАНИЯ:")
    print("="*60)
    
    for test_name, success in results.items():
        status = "✅ Успешно" if success else "❌ Неудачно"
        print(f"{test_name}: {status}")
    
    print("\n💡 ВЫВОДЫ:")
    print("- Поддерживаемые modalities: ['text'] и ['audio', 'text']")
    print("- turn_detection обязателен: 'server_vad' или 'semantic_vad'")
    print("- Для текстового анализа можно использовать ['text'] с отключенным create_response")
    print("- semantic_vad может быть предпочтительнее для текстового анализа")

if __name__ == "__main__":
    asyncio.run(main()) 
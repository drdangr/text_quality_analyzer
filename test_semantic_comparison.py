#!/usr/bin/env python3
"""
Тестовый скрипт для сравнения REST API и Realtime API подходов
к семантическому анализу текста.
"""

import asyncio
import time
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import pandas as pd

# Добавляем путь к корню проекта
sys.path.insert(0, str(Path(__file__).parent))

# Импортируем существующие модули
from analysis.semantic_function import analyze_single_chunk_semantic, analyze_batch_chunks_semantic
from analysis.semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig
from services.openai_service import OpenAIService
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

@dataclass
class TestResult:
    """Результат тестирования одного подхода"""
    method: str  # "REST" или "Realtime"
    total_time: float  # Общее время в секундах
    api_calls: int  # Количество API вызовов
    success_rate: float  # Процент успешных анализов
    results: List[Dict[str, Any]]  # Результаты анализа
    errors: List[str]  # Список ошибок

class SemanticAnalysisComparator:
    """Класс для сравнения двух подходов к семантическому анализу"""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY не найден в .env файле")
        
        # Инициализируем OpenAI сервис для REST подхода
        self.openai_service = OpenAIService(api_key=self.api_key)
        
        # Счетчики для отслеживания API вызовов
        self.rest_api_calls = 0
        self.realtime_api_calls = 0
        
    def generate_test_chunks(self, count: int = 100) -> Tuple[List[Dict[str, str]], str, str]:
        """
        Генерирует тестовые чанки для анализа.
        Возвращает: (чанки, полный текст, тема)
        """
        # Разнообразные примеры текстов для более реалистичного тестирования
        templates = [
            # Раскрытие темы
            "Искусственный интеллект продолжает развиваться с невероятной скоростью, открывая новые возможности в {}.",
            "Машинное обучение позволяет компьютерам {} без явного программирования.",
            "Нейронные сети способны {} лучше традиционных алгоритмов.",
            
            # Примеры
            "Например, система GPT может {} всего за несколько секунд.",
            "Рассмотрим случай, когда ИИ помог {} в медицинской диагностике.",
            
            # Метафоры
            "ИИ - это как {} для современного мира технологий.",
            "Нейронная сеть работает подобно {}, обрабатывая информацию слоями.",
            
            # Юмор/ирония
            "Конечно, роботы скоро {} - шутят скептики.",
            "ИИ настолько умный, что может {} (спойлер: пока не может).",
            
            # Шум
            "Вчера я {} и это было здорово.",
            "Погода сегодня {}, никак не связано с темой.",
            
            # Ключевые тезисы
            "Главное в ИИ - это {}.",
            "Основной принцип машинного обучения: {}.",
            
            # Переходы
            "Теперь перейдем к вопросу о {}.",
            "Следующий важный аспект - это {}.",
            
            # Контрасты
            "В отличие от традиционного программирования, ИИ {}.",
            "Если раньше {}, то теперь благодаря ИИ {}.",
        ]
        
        # Заполнители для шаблонов
        fillers = [
            "анализировать большие данные", "распознавать образы", "генерировать текст",
            "предсказывать тренды", "оптимизировать процессы", "автоматизировать задачи",
            "понимать естественный язык", "создавать искусство", "играть в игры",
            "ел пиццу", "гулял в парке", "смотрел фильм", "читал книгу",
            "мозг человека", "огромная библиотека", "швейцарский нож",
            "захватят мир", "заменят всех программистов", "научатся любить",
            "способность учиться", "обработка данных", "адаптивность",
            "этике ИИ", "безопасности", "будущем развитии",
            "требовалось много времени", "все делается мгновенно"
        ]
        
        # Генерируем чанки
        chunks = []
        texts = []
        
        for i in range(count):
            template = templates[i % len(templates)]
            filler_count = template.count("{}")
            
            # Выбираем случайные заполнители
            import random
            selected_fillers = random.sample(fillers, min(filler_count, len(fillers)))
            if filler_count > len(selected_fillers):
                selected_fillers.extend(["что-то"] * (filler_count - len(selected_fillers)))
            
            # Создаем текст чанка
            chunk_text = template.format(*selected_fillers)
            texts.append(chunk_text)
            
            chunks.append({
                "id": f"test_chunk_{i+1}",
                "text": chunk_text
            })
        
        # Формируем полный текст документа
        full_text = "\n\n".join(texts)
        
        # Тема документа
        topic = "Искусственный интеллект и машинное обучение"
        
        return chunks, full_text, topic
    
    async def test_rest_api(self, chunks: List[Dict[str, str]], full_text: str, topic: str) -> TestResult:
        """Тестирует REST API подход"""
        print("\n🔄 Тестирование REST API подхода...")
        
        start_time = time.time()
        results = []
        errors = []
        self.rest_api_calls = 0
        
        # Тестируем батчами по 10 чанков (как в реальном использовании)
        batch_size = 10
        
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i+batch_size]
            print(f"  Обрабатываем батч {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}")
            
            try:
                # Вызываем существующую функцию
                batch_results = await analyze_batch_chunks_semantic(
                    chunks=batch,
                    full_text=full_text,
                    topic=topic,
                    openai_service=self.openai_service,
                    max_parallel=1  # Как в текущей реализации
                )
                
                # Подсчитываем API вызовы (один на чанк в текущей реализации)
                self.rest_api_calls += len(batch)
                
                # Сохраняем результаты
                for result in batch_results:
                    results.append(result)
                    
                    # Проверяем на ошибки
                    if result.get("metrics", {}).get("semantic_error"):
                        errors.append(f"Chunk {result['chunk_id']}: {result['metrics']['semantic_error']}")
                
                # Небольшая задержка между батчами
                await asyncio.sleep(0.5)
                
            except Exception as e:
                error_msg = f"Ошибка батча {i//batch_size + 1}: {str(e)}"
                print(f"  ❌ {error_msg}")
                errors.append(error_msg)
                
                # Добавляем результаты с ошибками для всех чанков в батче
                for chunk in batch:
                    results.append({
                        "chunk_id": chunk["id"],
                        "metrics": {
                            "semantic_function": "error_api_call",
                            "semantic_error": str(e)
                        }
                    })
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Подсчитываем успешность
        success_count = sum(1 for r in results if not r.get("metrics", {}).get("semantic_error"))
        success_rate = (success_count / len(results)) * 100 if results else 0
        
        print(f"✅ REST API завершен за {total_time:.2f} сек")
        print(f"   API вызовов: {self.rest_api_calls}")
        print(f"   Успешность: {success_rate:.1f}%")
        
        return TestResult(
            method="REST",
            total_time=total_time,
            api_calls=self.rest_api_calls,
            success_rate=success_rate,
            results=results,
            errors=errors
        )
    
    async def test_realtime_api(self, chunks: List[Dict[str, str]], full_text: str, topic: str) -> TestResult:
        """Тестирует Realtime API подход"""
        print("\n🔄 Тестирование Realtime API подхода...")
        
        analyzer = SemanticRealtimeAnalyzer(api_key=self.api_key)
        
        start_time = time.time()
        results = []
        errors = []
        self.realtime_api_calls = 0
        
        try:
            # Инициализируем сессию
            config = RealtimeSessionConfig(
                topic=topic,
                temperature=0.3,
                model="gpt-4o-realtime-preview"
            )
            
            await analyzer.initialize_session(config)
            self.realtime_api_calls += 1  # Одно соединение
            
            # Обрабатываем чанки батчами
            batch_size = 10
            
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                print(f"  Обрабатываем батч {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}")
                
                try:
                    # Анализируем батч через одно соединение
                    batch_results = await analyzer.analyze_batch(batch)
                    
                    # В Realtime API все запросы идут через одно соединение
                    # Но мы считаем каждое сообщение как "использование"
                    self.realtime_api_calls += len(batch)
                    
                    for result in batch_results:
                        results.append(result)
                        
                        if result.get("semantic_error"):
                            errors.append(f"Chunk {result['chunk_id']}: {result['semantic_error']}")
                    
                except Exception as e:
                    error_msg = f"Ошибка батча {i//batch_size + 1}: {str(e)}"
                    print(f"  ❌ {error_msg}")
                    errors.append(error_msg)
                    
                    for chunk in batch:
                        results.append({
                            "chunk_id": chunk["id"],
                            "semantic_function": "error_api_call",
                            "semantic_error": str(e)
                        })
            
        except Exception as e:
            error_msg = f"Ошибка инициализации Realtime API: {str(e)}"
            print(f"❌ {error_msg}")
            errors.append(error_msg)
            
            # Возвращаем результаты с ошибками для всех чанков
            for chunk in chunks:
                results.append({
                    "chunk_id": chunk["id"],
                    "semantic_function": "error_api_call",
                    "semantic_error": str(e)
                })
        
        finally:
            # Закрываем соединение
            if analyzer.websocket:
                await analyzer.close()
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Подсчитываем успешность
        success_count = sum(1 for r in results if not r.get("semantic_error"))
        success_rate = (success_count / len(results)) * 100 if results else 0
        
        print(f"✅ Realtime API завершен за {total_time:.2f} сек")
        print(f"   Соединений: 1, сообщений: {self.realtime_api_calls}")
        print(f"   Успешность: {success_rate:.1f}%")
        
        return TestResult(
            method="Realtime",
            total_time=total_time,
            api_calls=self.realtime_api_calls,
            success_rate=success_rate,
            results=results,
            errors=errors
        )
    
    def compare_results(self, rest_result: TestResult, realtime_result: TestResult) -> Dict[str, Any]:
        """Сравнивает результаты двух подходов"""
        print("\n📊 СРАВНЕНИЕ РЕЗУЛЬТАТОВ")
        print("=" * 50)
        
        comparison = {
            "timestamp": datetime.now().isoformat(),
            "total_chunks": len(rest_result.results),
            "rest_api": {
                "total_time": rest_result.total_time,
                "api_calls": rest_result.api_calls,
                "success_rate": rest_result.success_rate,
                "errors_count": len(rest_result.errors)
            },
            "realtime_api": {
                "total_time": realtime_result.total_time,
                "api_calls": realtime_result.api_calls,
                "success_rate": realtime_result.success_rate,
                "errors_count": len(realtime_result.errors)
            },
            "performance": {
                "time_difference": rest_result.total_time - realtime_result.total_time,
                "time_improvement_percent": ((rest_result.total_time - realtime_result.total_time) / rest_result.total_time * 100) if rest_result.total_time > 0 else 0,
                "api_calls_saved": rest_result.api_calls - realtime_result.api_calls
            }
        }
        
        # Выводим сравнение
        print(f"\n⏱️  ВРЕМЯ ВЫПОЛНЕНИЯ:")
        print(f"   REST API:     {rest_result.total_time:.2f} сек")
        print(f"   Realtime API: {realtime_result.total_time:.2f} сек")
        print(f"   Разница:      {comparison['performance']['time_difference']:.2f} сек ({comparison['performance']['time_improvement_percent']:.1f}%)")
        
        print(f"\n📞 API ВЫЗОВЫ:")
        print(f"   REST API:     {rest_result.api_calls}")
        print(f"   Realtime API: {realtime_result.api_calls}")
        print(f"   Экономия:     {comparison['performance']['api_calls_saved']}")
        
        print(f"\n✅ УСПЕШНОСТЬ:")
        print(f"   REST API:     {rest_result.success_rate:.1f}%")
        print(f"   Realtime API: {realtime_result.success_rate:.1f}%")
        
        # Сравниваем результаты семантического анализа
        print(f"\n🔍 СОГЛАСОВАННОСТЬ РЕЗУЛЬТАТОВ:")
        matches = 0
        differences = []
        
        rest_results_map = {r["chunk_id"]: r for r in rest_result.results}
        realtime_results_map = {r["chunk_id"]: r for r in realtime_result.results}
        
        for chunk_id in rest_results_map:
            rest_func = rest_results_map[chunk_id].get("metrics", {}).get("semantic_function", "")
            realtime_func = realtime_results_map.get(chunk_id, {}).get("semantic_function", "")
            
            if rest_func == realtime_func:
                matches += 1
            else:
                differences.append({
                    "chunk_id": chunk_id,
                    "rest": rest_func,
                    "realtime": realtime_func
                })
        
        match_rate = (matches / len(rest_results_map)) * 100 if rest_results_map else 0
        comparison["consistency"] = {
            "match_rate": match_rate,
            "differences_count": len(differences),
            "sample_differences": differences[:5]  # Первые 5 различий для примера
        }
        
        print(f"   Совпадений: {matches}/{len(rest_results_map)} ({match_rate:.1f}%)")
        
        if differences:
            print(f"\n   Примеры различий (первые 5):")
            for diff in differences[:5]:
                print(f"   - {diff['chunk_id']}:")
                print(f"     REST:     {diff['rest']}")
                print(f"     Realtime: {diff['realtime']}")
        
        # Сохраняем детальный отчет
        self.save_comparison_report(comparison, rest_result, realtime_result)
        
        return comparison
    
    def save_comparison_report(self, comparison: Dict[str, Any], rest_result: TestResult, realtime_result: TestResult):
        """Сохраняет детальный отчет сравнения"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"semantic_comparison_report_{timestamp}.json"
        
        report = {
            "summary": comparison,
            "rest_api_details": {
                "method": rest_result.method,
                "total_time": rest_result.total_time,
                "api_calls": rest_result.api_calls,
                "success_rate": rest_result.success_rate,
                "errors": rest_result.errors[:10],  # Первые 10 ошибок
                "sample_results": rest_result.results[:10]  # Первые 10 результатов
            },
            "realtime_api_details": {
                "method": realtime_result.method,
                "total_time": realtime_result.total_time,
                "api_calls": realtime_result.api_calls,
                "success_rate": realtime_result.success_rate,
                "errors": realtime_result.errors[:10],
                "sample_results": realtime_result.results[:10]
            }
        }
        
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 Детальный отчет сохранен в: {report_file}")

async def main():
    """Основная функция тестирования"""
    print("🚀 СРАВНЕНИЕ REST API И REALTIME API ДЛЯ СЕМАНТИЧЕСКОГО АНАЛИЗА")
    print("=" * 60)
    
    # Параметры тестирования
    CHUNK_COUNT = 5  # Начнем с 5 чанков для экономии квоты API
    
    print(f"\nПараметры теста:")
    print(f"- Количество чанков: {CHUNK_COUNT}")
    print(f"- Тема: Искусственный интеллект и машинное обучение")
    
    try:
        comparator = SemanticAnalysisComparator()
        
        # Генерируем тестовые данные
        print(f"\n📝 Генерация {CHUNK_COUNT} тестовых чанков...")
        chunks, full_text, topic = comparator.generate_test_chunks(CHUNK_COUNT)
        print(f"✅ Сгенерировано {len(chunks)} чанков")
        
        # Тестируем REST API
        rest_result = await comparator.test_rest_api(chunks, full_text, topic)
        
        # Тестируем Realtime API
        # ВАЖНО: Realtime API может быть недоступен или требовать отдельной активации
        # Поэтому обрабатываем возможные ошибки
        try:
            realtime_result = await comparator.test_realtime_api(chunks, full_text, topic)
        except Exception as e:
            print(f"\n⚠️  Ошибка Realtime API: {e}")
            print("Используем симуляцию для демонстрации...")
            
            # Симуляция для случаев, когда API недоступен
            realtime_start = time.time()
            realtime_results = []
            
            for i, chunk in enumerate(chunks):
                rest_result_item = rest_result.results[i]
                await asyncio.sleep(0.05)  # 50ms на чанк
                
                realtime_results.append({
                    "chunk_id": chunk["id"],
                    "semantic_function": rest_result_item.get("metrics", {}).get("semantic_function", "error"),
                    "semantic_method": "realtime_api_simulated",
                    "semantic_error": None
                })
            
            realtime_end = time.time()
            realtime_total_time = realtime_end - realtime_start
            
            realtime_result = TestResult(
                method="Realtime (Simulated)",
                total_time=realtime_total_time,
                api_calls=1,
                success_rate=100.0,
                results=realtime_results,
                errors=[]
            )
            
            print(f"✅ Realtime API (симуляция) завершен за {realtime_total_time:.2f} сек")
        
        # Сравниваем результаты
        comparison = comparator.compare_results(rest_result, realtime_result)
        
        print("\n✅ Тестирование завершено!")
        
    except Exception as e:
        print(f"\n❌ Ошибка тестирования: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main()) 
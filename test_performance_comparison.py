#!/usr/bin/env python3
"""
Сравнительный тест производительности: REST API vs Realtime API
"""

import asyncio
import time
import sys
import os
import statistics
from typing import List, Dict, Any
from dataclasses import dataclass
import json
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analysis.semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig
from services.openai_service import OpenAIService
from dotenv import load_dotenv

load_dotenv()

@dataclass
class TestResult:
    """Результаты теста"""
    method: str
    total_chunks: int
    successful: int
    failed: int
    total_time: float
    avg_time_per_chunk: float
    min_time: float
    max_time: float
    accuracy: float
    errors: List[str]

class PerformanceComparator:
    """Класс для сравнения производительности API"""
    
    def __init__(self, topic: str = "Искусственный интеллект"):
        self.topic = topic
        self.test_chunks = self._generate_test_chunks()
        
    def _generate_test_chunks(self) -> List[Dict[str, Any]]:
        """Генерируем тестовые чанки с ожидаемыми результатами"""
        base_chunks = [
            # Раскрытие темы
            {"id": "1", "text": "ИИ трансформирует индустрию программирования.", "expected": "раскрытие темы"},
            {"id": "2", "text": "Машинное обучение позволяет компьютерам учиться на данных.", "expected": "раскрытие темы"},
            {"id": "3", "text": "Нейронные сети имитируют работу человеческого мозга.", "expected": "раскрытие темы"},
            
            # Примеры
            {"id": "4", "text": "Например, GPT-4 может писать код на Python.", "expected": "пояснение на примере"},
            {"id": "5", "text": "Siri и Alexa - примеры голосовых ассистентов с ИИ.", "expected": "пояснение на примере"},
            
            # Метафоры
            {"id": "6", "text": "ИИ - это новое электричество нашей эпохи.", "expected": "метафора или аналогия"},
            {"id": "7", "text": "Нейросеть как садовник, выращивающий знания из данных.", "expected": "метафора или аналогия"},
            
            # Ключевые тезисы
            {"id": "8", "text": "ИИ - ключевая технология XXI века.", "expected": "ключевой тезис"},
            {"id": "9", "text": "Будущее принадлежит тем, кто освоит ИИ.", "expected": "ключевой тезис"},
            
            # Шум
            {"id": "10", "text": "Вчера я купил новые кроссовки.", "expected": "шум"},
            {"id": "11", "text": "Погода сегодня отличная.", "expected": "шум"},
            
            # Юмор/ирония
            {"id": "12", "text": "Скоро ИИ будет сам себя программировать, а нам останется только кофе пить!", "expected": "юмор или ирония или сарказм"},
            {"id": "13", "text": "ИИ настолько умный, что даже понимает мой почерк врача.", "expected": "юмор или ирония или сарказм"},
            
            # Смена темы
            {"id": "14", "text": "Кстати, о квантовых компьютерах...", "expected": "смена темы"},
            {"id": "15", "text": "Теперь поговорим о блокчейне.", "expected": "смена темы"},
        ]
        
        # Дополнительные чанки для нагрузки
        additional_chunks = [
            {"id": f"load_{i}", "text": f"Тестовый текст {i} про ИИ и технологии.", "expected": "раскрытие темы"}
            for i in range(16, 31)
        ]
        
        return base_chunks + additional_chunks
    
    async def test_rest_api(self) -> TestResult:
        """Тестируем REST API"""
        print("\n🔵 ТЕСТИРОВАНИЕ REST API")
        print("-" * 60)
        
        # Инициализируем OpenAI service
        api_key = os.getenv("OPENAI_API_KEY")
        openai_service = OpenAIService(api_key=api_key)
        
        # Импортируем функцию анализа
        from analysis.semantic_function import analyze_batch_chunks_semantic
        
        chunks = [{"id": c["id"], "text": c["text"]} for c in self.test_chunks]
        chunk_times = []
        errors = []
        successful = 0
        correct_predictions = 0
        
        # Создаем полный текст для контекста
        full_text = "\n\n".join([c["text"] for c in chunks])
        
        start_time = time.time()
        
        try:
            # Тестируем по батчам для честного сравнения
            batch_size = 5
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                batch_start = time.time()
                
                # Используем правильную функцию
                results = await analyze_batch_chunks_semantic(
                    chunks=batch,
                    full_text=full_text,
                    topic=self.topic,
                    openai_service=openai_service,
                    max_parallel=batch_size
                )
                
                batch_time = time.time() - batch_start
                chunk_times.extend([batch_time / len(batch)] * len(batch))
                
                # Проверяем результаты
                for chunk, result in zip(self.test_chunks[i:i+batch_size], results):
                    metrics = result.get("metrics", {})
                    semantic_func = metrics.get("semantic_function", "")
                    
                    if semantic_func and "error" not in semantic_func:
                        successful += 1
                        # Проверяем точность
                        expected = chunk["expected"]
                        actual = semantic_func
                        if expected in actual or actual in expected:
                            correct_predictions += 1
                    else:
                        errors.append(f"Chunk {chunk['id']}: {metrics.get('semantic_error', 'Unknown error')}")
                
                print(f"  Обработан батч {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}")
                await asyncio.sleep(0.1)  # Небольшая пауза между батчами
                
        except Exception as e:
            errors.append(f"General error: {str(e)}")
            
        total_time = time.time() - start_time
        
        return TestResult(
            method="REST API",
            total_chunks=len(chunks),
            successful=successful,
            failed=len(chunks) - successful,
            total_time=total_time,
            avg_time_per_chunk=statistics.mean(chunk_times) if chunk_times else 0,
            min_time=min(chunk_times) if chunk_times else 0,
            max_time=max(chunk_times) if chunk_times else 0,
            accuracy=(correct_predictions / successful * 100) if successful > 0 else 0,
            errors=errors[:5]  # Показываем только первые 5 ошибок
        )
    
    async def test_realtime_api(self) -> TestResult:
        """Тестируем Realtime API"""
        print("\n🟢 ТЕСТИРОВАНИЕ REALTIME API")
        print("-" * 60)
        
        api_key = os.getenv("OPENAI_API_KEY")
        analyzer = SemanticRealtimeAnalyzer(api_key=api_key)
        
        chunks = [{"id": c["id"], "text": c["text"]} for c in self.test_chunks]
        chunk_times = []
        errors = []
        successful = 0
        correct_predictions = 0
        
        start_time = time.time()
        
        try:
            # Инициализируем сессию
            config = RealtimeSessionConfig(
                topic=self.topic,
                temperature=0.6
            )
            await analyzer.initialize_session(config)
            print("  ✅ Сессия инициализирована")
            
            # Обрабатываем чанки по одному для замера времени
            for i, (chunk, test_chunk) in enumerate(zip(chunks, self.test_chunks)):
                chunk_start = time.time()
                
                result = await analyzer.analyze_chunk(
                    chunk_id=chunk["id"],
                    chunk_text=chunk["text"]
                )
                
                chunk_time = time.time() - chunk_start
                chunk_times.append(chunk_time)
                
                if result.get("semantic_function") and "error" not in result.get("semantic_function", ""):
                    successful += 1
                    # Проверяем точность
                    expected = test_chunk["expected"]
                    actual = result.get("semantic_function", "")
                    if expected in actual or actual in expected:
                        correct_predictions += 1
                else:
                    errors.append(f"Chunk {chunk['id']}: {result.get('semantic_error', 'Unknown error')}")
                
                if (i + 1) % 5 == 0:
                    print(f"  Обработано {i + 1}/{len(chunks)} чанков")
                    
        except Exception as e:
            errors.append(f"General error: {str(e)}")
            
        finally:
            await analyzer.close()
            
        total_time = time.time() - start_time
        
        return TestResult(
            method="Realtime API",
            total_chunks=len(chunks),
            successful=successful,
            failed=len(chunks) - successful,
            total_time=total_time,
            avg_time_per_chunk=statistics.mean(chunk_times) if chunk_times else 0,
            min_time=min(chunk_times) if chunk_times else 0,
            max_time=max(chunk_times) if chunk_times else 0,
            accuracy=(correct_predictions / successful * 100) if successful > 0 else 0,
            errors=errors[:5]
        )
    
    def print_results(self, rest_result: TestResult, realtime_result: TestResult):
        """Выводим сравнительные результаты"""
        print("\n" + "="*80)
        print("📊 СРАВНИТЕЛЬНЫЕ РЕЗУЛЬТАТЫ")
        print("="*80)
        
        # Таблица результатов
        print(f"\n{'Метрика':<30} {'REST API':>20} {'Realtime API':>20} {'Разница':>15}")
        print("-" * 85)
        
        # Успешность
        print(f"{'Успешных запросов':<30} {f'{rest_result.successful}/{rest_result.total_chunks}':>20} "
              f"{f'{realtime_result.successful}/{realtime_result.total_chunks}':>20} "
              f"{f'{realtime_result.successful - rest_result.successful:+d}':>15}")
        
        # Точность
        print(f"{'Точность (%)':<30} {f'{rest_result.accuracy:.1f}%':>20} "
              f"{f'{realtime_result.accuracy:.1f}%':>20} "
              f"{f'{realtime_result.accuracy - rest_result.accuracy:+.1f}%':>15}")
        
        # Время
        print(f"{'Общее время (сек)':<30} {f'{rest_result.total_time:.2f}':>20} "
              f"{f'{realtime_result.total_time:.2f}':>20} "
              f"{f'{realtime_result.total_time - rest_result.total_time:+.2f}':>15}")
        
        print(f"{'Среднее время/чанк (сек)':<30} {f'{rest_result.avg_time_per_chunk:.3f}':>20} "
              f"{f'{realtime_result.avg_time_per_chunk:.3f}':>20} "
              f"{f'{realtime_result.avg_time_per_chunk - rest_result.avg_time_per_chunk:+.3f}':>15}")
        
        print(f"{'Мин. время/чанк (сек)':<30} {f'{rest_result.min_time:.3f}':>20} "
              f"{f'{realtime_result.min_time:.3f}':>20} "
              f"{f'{realtime_result.min_time - rest_result.min_time:+.3f}':>15}")
        
        print(f"{'Макс. время/чанк (сек)':<30} {f'{rest_result.max_time:.3f}':>20} "
              f"{f'{realtime_result.max_time:.3f}':>20} "
              f"{f'{realtime_result.max_time - rest_result.max_time:+.3f}':>15}")
        
        # Производительность
        speedup = rest_result.avg_time_per_chunk / realtime_result.avg_time_per_chunk if realtime_result.avg_time_per_chunk > 0 else 0
        print(f"\n{'Ускорение':<30} {f'{speedup:.2f}x быстрее Realtime API':>55}")
        
        # Рекомендации
        print("\n" + "="*80)
        print("💡 РЕКОМЕНДАЦИИ:")
        print("="*80)
        
        if realtime_result.successful >= rest_result.successful and speedup > 1.2:
            print("✅ Realtime API показывает ЛУЧШУЮ производительность:")
            print(f"   - В {speedup:.1f} раз быстрее")
            print(f"   - Точность {realtime_result.accuracy:.1f}% vs {rest_result.accuracy:.1f}%")
            print("   - Рекомендуется для пакетной обработки больших объемов")
        elif rest_result.successful > realtime_result.successful * 1.1:
            print("✅ REST API показывает ЛУЧШУЮ надежность:")
            print(f"   - Больше успешных запросов: {rest_result.successful} vs {realtime_result.successful}")
            print("   - Проще в использовании")
            print("   - Рекомендуется для критически важных задач")
        else:
            print("⚖️  Оба метода показывают СОПОСТАВИМЫЕ результаты:")
            print("   - REST API: проще, надежнее, стабильнее")
            print("   - Realtime API: быстрее для больших объемов, требует настройки")
            print("   - Выбор зависит от конкретной задачи")
        
        # Сохраняем результаты
        self._save_results(rest_result, realtime_result)
    
    def _save_results(self, rest_result: TestResult, realtime_result: TestResult):
        """Сохраняем результаты в файл"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"performance_comparison_{timestamp}.json"
        
        results = {
            "timestamp": timestamp,
            "topic": self.topic,
            "total_chunks": rest_result.total_chunks,
            "rest_api": {
                "successful": rest_result.successful,
                "failed": rest_result.failed,
                "total_time": rest_result.total_time,
                "avg_time_per_chunk": rest_result.avg_time_per_chunk,
                "accuracy": rest_result.accuracy
            },
            "realtime_api": {
                "successful": realtime_result.successful,
                "failed": realtime_result.failed,
                "total_time": realtime_result.total_time,
                "avg_time_per_chunk": realtime_result.avg_time_per_chunk,
                "accuracy": realtime_result.accuracy
            },
            "speedup": rest_result.avg_time_per_chunk / realtime_result.avg_time_per_chunk if realtime_result.avg_time_per_chunk > 0 else 0
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"\n📄 Результаты сохранены в: {filename}")

async def main():
    """Основная функция"""
    print("🚀 СРАВНИТЕЛЬНЫЙ ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ: REST API vs REALTIME API")
    print("="*80)
    print("Тестируем на 30 чанках с разными семантическими ролями")
    print("="*80)
    
    comparator = PerformanceComparator(topic="Искусственный интеллект и технологии")
    
    # Тестируем оба API
    rest_result = await comparator.test_rest_api()
    await asyncio.sleep(2)  # Пауза между тестами
    realtime_result = await comparator.test_realtime_api()
    
    # Выводим результаты
    comparator.print_results(rest_result, realtime_result)

if __name__ == "__main__":
    asyncio.run(main()) 
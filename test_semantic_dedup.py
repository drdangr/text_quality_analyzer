#!/usr/bin/env python3
"""
Тестовый скрипт для проверки дедупликации семантических функций
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from analysis.semantic_function import _parse_single_chunk_response

def test_deduplication():
    """Тестирует дедупликацию семантических функций"""
    test_cases = [
        # (входная строка, ожидаемый результат)
        ("юмор или ирония или сарказм / юмор или ирония или сарказм / юмор или ирония или сарказм", 
         "юмор или ирония или сарказм"),
        
        ("раскрытие темы / раскрытие темы", 
         "раскрытие темы"),
        
        ("метафора или аналогия / юмор или ирония или сарказм", 
         "метафора или аналогия / юмор или ирония или сарказм"),
        
        ("шум / шум / раскрытие темы", 
         "шум / раскрытие темы"),
        
        ("метафора или аналогия / метафора или аналогия / ключевой тезис", 
         "метафора или аналогия / ключевой тезис"),
         
        ("раскрытие темы / пояснение на примере / лирическое отступление", 
         "раскрытие темы / пояснение на примере"),  # Должно оставить только 2
         
        ("неизвестная метка", 
         "parsing_error"),
    ]
    
    print("=== ТЕСТ ДЕДУПЛИКАЦИИ СЕМАНТИЧЕСКИХ ФУНКЦИЙ ===\n")
    
    passed = 0
    failed = 0
    
    for i, (input_text, expected) in enumerate(test_cases, 1):
        result = _parse_single_chunk_response(input_text)
        
        if result == expected:
            print(f"✅ Тест {i} ПРОЙДЕН:")
            print(f"   Вход: '{input_text}'")
            print(f"   Результат: '{result}'")
            passed += 1
        else:
            print(f"❌ Тест {i} ПРОВАЛЕН:")
            print(f"   Вход: '{input_text}'")
            print(f"   Ожидалось: '{expected}'")
            print(f"   Получено: '{result}'")
            failed += 1
        print()
    
    print(f"\n=== ИТОГИ ===")
    print(f"Пройдено: {passed}")
    print(f"Провалено: {failed}")
    print(f"Всего: {passed + failed}")
    
    return failed == 0

if __name__ == "__main__":
    success = test_deduplication()
    sys.exit(0 if success else 1) 
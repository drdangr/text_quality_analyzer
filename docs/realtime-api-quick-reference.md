# OpenAI Realtime API: Краткая справка

## 🚀 Быстрый старт

### Минимальная рабочая конфигурация

```python
from analysis.semantic_function_realtime import SemanticRealtimeAnalyzer, RealtimeSessionConfig

# Инициализация
analyzer = SemanticRealtimeAnalyzer(api_key="your-api-key")

# Конфигурация сессии
config = RealtimeSessionConfig(
    topic="Ваша тема",
    temperature=0.6  # Минимум!
)

# Подключение и анализ
await analyzer.connect()
await analyzer.initialize_session(config)
result = await analyzer.analyze_chunk("id", "текст для анализа")
await analyzer.close()
```

## ⚠️ Критически важные моменты

### 1. Параметры, которые ОБЯЗАТЕЛЬНЫ

```python
{
    "temperature": 0.6,  # НЕ МЕНЬШЕ!
    "turn_detection": {
        "type": "server_vad",  # НЕ "none"!
        "create_response": False  # Для ручного управления
    },
    "modalities": ["text"],  # НЕ ["text", "audio"]!
    "input_audio_format": "pcm16",  # Даже для текста!
    "output_audio_format": "pcm16"  # Даже для текста!
}
```

### 2. Правильный формат сообщений

```python
# ✅ ПРАВИЛЬНО
{
    "type": "conversation.item.create",  # НЕ "message.create"!
    "item": {
        "type": "message",
        "role": "user",
        "content": [{
            "type": "input_text",
            "text": "текст"
        }]
    }
}

# Затем обязательно:
{
    "type": "response.create"
}
```

### 3. Обработка параллельных запросов

```python
# ОБЯЗАТЕЛЬНАЯ пауза между запросами!
await asyncio.sleep(0.5)  # Минимум!
```

## 📊 Результаты тестирования

### Файлы с результатами
- [performance_comparison_20250531_041236.json](../performance_comparison_20250531_041236.json)
- [performance_comparison_20250531_040704.json](../performance_comparison_20250531_040704.json)

### Краткие итоги
- **Скорость**: Realtime API в 4.4x быстрее на малых объемах
- **Надежность**: REST API стабильнее на больших объемах
- **Рекомендация**: REST API для production, Realtime для экспериментов

## 🔧 Тестовые модули

### Проверка доступности
```bash
python test_realtime_availability.py
```

### Тест конфигураций
```bash
python test_modalities_config.py
```

### Простой тест
```bash
python test_realtime_simple.py
```

### Сравнение производительности
```bash
python test_performance_comparison.py
```

## 🚨 Частые ошибки

### Ошибка: "session.create not supported"
**Решение**: Используйте `session.update`

### Ошибка: "temperature below minimum value"
**Решение**: Установите `temperature >= 0.6`

### Ошибка: "Invalid modalities ['text', 'audio']"
**Решение**: Используйте `["text"]` или `["audio", "text"]`

### Ошибка: "Conversation already has an active response"
**Решение**: Добавьте паузы между запросами

## 🎯 Гибридный подход (РЕКОМЕНДУЕТСЯ!)

### Автоматический fallback от Realtime к REST API

```python
from analysis.semantic_function_hybrid import HybridSemanticAnalyzer

# Создание анализатора с автоматическим fallback
analyzer = HybridSemanticAnalyzer(api_key="your-api-key")

# Анализ с автоматическим выбором API
result = await analyzer.analyze_chunk(
    chunk_id="1", 
    chunk_text="текст",
    topic="тема"
)

# Пакетная обработка с адаптивной стратегией
results = await analyzer.analyze_batch(
    chunks=chunks_list,
    topic="тема",
    adaptive_batching=True  # Умное распределение между API
)
```

### Преимущества гибридного подхода
- ⚡ **Скорость**: 4x ускорение где возможно
- 🛡️ **Надежность**: 100% успешность с fallback
- 🧠 **Интеллект**: Автоматическое переключение при ошибках
- 📈 **Адаптивность**: Оптимальная стратегия для любого объема

### Тест гибридного подхода
```bash
python test_hybrid_semantic.py
```

## 📁 Структура файлов

```
text_quality_analyzer2/
├── analysis/
│   ├── semantic_function_realtime.py    # Основной модуль
│   └── semantic_function.py             # REST API версия
├── test_*.py                            # Тестовые модули
├── docs/
│   ├── realtime-api-research.md        # Полная документация
│   └── realtime-api-quick-reference.md # Эта справка
└── performance_comparison_*.json        # Результаты тестов
```

## 🔗 Полезные ссылки

- [Полная документация исследования](./realtime-api-research.md)
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/api-reference/realtime)
- [Основной модуль](../analysis/semantic_function_realtime.py)

---

*Версия: 1.0 | Дата: 31.05.2025* 
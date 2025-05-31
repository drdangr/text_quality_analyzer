"""
Оптимизированный модуль семантического анализа.
Анализирует все чанки документа за один запрос к модели.
"""

import asyncio
import json
from typing import List, Dict, Any, Tuple
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class OptimizedSemanticAnalyzer:
    """
    Оптимизированный анализатор семантических функций.
    Анализирует все чанки документа за один запрос.
    """
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        
        # Определения семантических функций
        self.semantic_functions = {
            "раскрытие темы": "Основная информация по теме, детали, факты, определения",
            "ключевой тезис": "Центральная идея или главное утверждение текста",
            "пояснение на примере": "Конкретные примеры, иллюстрирующие основную мысль",
            "вспомогательная информация": "Дополнительные детали, контекст, фоновая информация",
            "метафора или аналогия": "Сравнения для лучшего понимания",
            "причинно-следственная связь": "Объяснение причин и последствий",
            "противопоставление": "Контрасты, противоположные точки зрения",
            "обобщение или вывод": "Итоги, заключения, резюме",
            "риторический вопрос": "Вопросы для привлечения внимания или размышления",
            "эмоциональный акцент": "Эмоционально окрашенные высказывания",
            "ссылка на авторитет": "Цитаты, мнения экспертов",
            "статистика или факты": "Числовые данные, проверяемые факты",
            "временная последовательность": "Хронология событий",
            "пространственное описание": "Описание места, расположения",
            "диалог или цитата": "Прямая речь, цитирование",
            "юмор или ирония или сарказм": "Шутки, ирония, сарказм",
            "призыв к действию": "Побуждение читателя к конкретным действиям",
            "уточнение или оговорка": "Дополнительные условия, исключения",
            "связующий переход": "Связки между частями текста",
            "личное мнение автора": "Субъективная оценка автора",
            "предположение или гипотеза": "Возможные варианты, догадки",
            "критика или опровержение": "Несогласие, критический анализ",
            "историческая справка": "Информация о прошлых событиях",
            "прогноз или предсказание": "Взгляд в будущее",
            "технические детали": "Специфическая техническая информация",
            "художественный образ": "Литературные, поэтические образы",
            "научное объяснение": "Академическое, научное изложение",
            "бытовое описание": "Повседневные, обыденные детали",
            "философское размышление": "Глубокие мысли о жизни, бытии",
            "шум": "Малозначимый, нерелевантный фрагмент"
        }
    
    async def analyze_batch_optimized(
        self,
        full_text: str,
        chunk_boundaries: List[Tuple[int, int]],
        chunk_ids: List[str],
        topic: str,
        max_chunks_per_request: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Анализирует все чанки документа за минимальное количество запросов.
        
        Args:
            full_text: Полный текст документа
            chunk_boundaries: Список границ чанков [(start1, end1), (start2, end2), ...]
            chunk_ids: Список ID чанков в том же порядке
            topic: Тема документа
            max_chunks_per_request: Максимум чанков в одном запросе
            
        Returns:
            Список результатов для каждого чанка
        """
        if len(chunk_boundaries) != len(chunk_ids):
            raise ValueError("Количество границ должно совпадать с количеством ID")
        
        results = []
        
        # Разбиваем на батчи если слишком много чанков
        for batch_start in range(0, len(chunk_boundaries), max_chunks_per_request):
            batch_end = min(batch_start + max_chunks_per_request, len(chunk_boundaries))
            batch_boundaries = chunk_boundaries[batch_start:batch_end]
            batch_ids = chunk_ids[batch_start:batch_end]
            
            logger.info(f"[OptimizedSemantic] Анализ батча {batch_start}-{batch_end} из {len(chunk_boundaries)} чанков")
            
            try:
                batch_results = await self._analyze_single_batch(
                    full_text, 
                    batch_boundaries, 
                    batch_ids, 
                    topic
                )
                results.extend(batch_results)
            except Exception as e:
                logger.error(f"[OptimizedSemantic] Ошибка анализа батча: {e}")
                # Добавляем результаты с ошибками для этого батча
                for chunk_id in batch_ids:
                    results.append({
                        "chunk_id": chunk_id,
                        "semantic_function": "error_api_call",
                        "semantic_error": str(e)[:150]
                    })
        
        return results
    
    async def _analyze_single_batch(
        self,
        full_text: str,
        chunk_boundaries: List[Tuple[int, int]],
        chunk_ids: List[str],
        topic: str
    ) -> List[Dict[str, Any]]:
        """Анализирует один батч чанков за один запрос к модели"""
        
        # Формируем список диапазонов для анализа
        ranges_description = []
        for i, (start, end) in enumerate(chunk_boundaries):
            # Добавляем preview текста для контекста
            preview = full_text[start:min(start+50, end)].replace('\n', ' ')
            if len(preview) == 50 and end > start + 50:
                preview += "..."
            ranges_description.append(
                f"{i+1}. Символы {start}-{end}: \"{preview}\""
            )
        
        # Формируем промпт
        prompt = f"""Проанализируй текст на тему "{topic}" и определи семантическую функцию для каждого указанного диапазона.

ТЕКСТ ДЛЯ АНАЛИЗА:
{full_text}

ДИАПАЗОНЫ ДЛЯ АНАЛИЗА:
{chr(10).join(ranges_description)}

ДОСТУПНЫЕ СЕМАНТИЧЕСКИЕ ФУНКЦИИ:
{json.dumps(self.semantic_functions, ensure_ascii=False, indent=2)}

ИНСТРУКЦИИ:
1. Для каждого диапазона определи ОДНУ основную семантическую функцию
2. Если фрагмент может выполнять несколько функций, выбери наиболее важную
3. НЕ используй дубли или повторы (например, "юмор / юмор / юмор")
4. Если нужно указать две функции, используй формат "функция1 / функция2"

ФОРМАТ ОТВЕТА:
Верни JSON массив в формате:
[
  {{"range": 1, "function": "название функции"}},
  {{"range": 2, "function": "название функции"}},
  ...
]

Отвечай ТОЛЬКО валидным JSON массивом, без дополнительного текста."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "Ты эксперт по анализу структуры текста. Отвечай только в формате JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Пустой ответ от модели")
            
            # Пытаемся распарсить JSON
            try:
                # Убираем возможные markdown блоки кода
                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                content = content.strip()
                
                parsed_results = json.loads(content)
                
                if not isinstance(parsed_results, list):
                    raise ValueError("Ответ не является массивом")
                
                # Преобразуем результаты
                results = []
                for i, item in enumerate(parsed_results):
                    if i < len(chunk_ids):
                        results.append({
                            "chunk_id": chunk_ids[i],
                            "semantic_function": self._normalize_function(item.get("function", "шум")),
                            "semantic_method": "optimized_batch"
                        })
                
                # Добавляем результаты для чанков, которые модель пропустила
                for i in range(len(results), len(chunk_ids)):
                    results.append({
                        "chunk_id": chunk_ids[i],
                        "semantic_function": "шум",
                        "semantic_method": "optimized_batch",
                        "semantic_error": "Не получен результат от модели"
                    })
                
                logger.info(f"[OptimizedSemantic] Успешно проанализировано {len(results)} чанков за один запрос")
                return results
                
            except json.JSONDecodeError as e:
                logger.error(f"[OptimizedSemantic] Ошибка парсинга JSON: {e}")
                logger.error(f"Ответ модели: {content[:500]}...")
                raise ValueError(f"Некорректный JSON от модели: {e}")
                
        except Exception as e:
            logger.error(f"[OptimizedSemantic] Ошибка запроса к OpenAI: {e}")
            raise
    
    async def analyze_single_chunk(
        self,
        chunk_id: str,
        chunk_text: str,
        full_text: str,
        topic: str
    ) -> Dict[str, Any]:
        """
        Анализирует один чанк (для локальных обновлений).
        
        Args:
            chunk_id: ID чанка
            chunk_text: Текст чанка  
            full_text: Полный текст документа
            topic: Тема документа
            
        Returns:
            Результат анализа чанка
        """
        prompt = f"""Определи семантическую функцию фрагмента в контексте текста на тему "{topic}".

ПОЛНЫЙ ТЕКСТ:
{full_text}

АНАЛИЗИРУЕМЫЙ ФРАГМЕНТ:
{chunk_text}

ДОСТУПНЫЕ ФУНКЦИИ:
{json.dumps(list(self.semantic_functions.keys()), ensure_ascii=False, indent=2)}

Выбери ОДНУ наиболее подходящую функцию. Если фрагмент может выполнять несколько функций, можешь указать максимум ДВЕ через " / ".

Отвечай ТОЛЬКО названием функции, без объяснений."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "Ты эксперт по анализу структуры текста."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=50
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Пустой ответ от модели")
            
            semantic_function = self._normalize_function(content.strip())
            
            logger.info(f"[OptimizedSemantic] Чанк {chunk_id}: '{semantic_function}'")
            
            return {
                "chunk_id": chunk_id,
                "semantic_function": semantic_function,
                "semantic_method": "optimized_single"
            }
            
        except Exception as e:
            logger.error(f"[OptimizedSemantic] Ошибка анализа чанка {chunk_id}: {e}")
            return {
                "chunk_id": chunk_id,
                "semantic_function": "error_api_call",
                "semantic_error": str(e)[:150],
                "semantic_method": "optimized_single"
            }
    
    def _normalize_function(self, function: str) -> str:
        """Нормализует и дедуплицирует семантическую функцию"""
        if not function:
            return "шум"
        
        # Убираем лишние пробелы
        function = function.strip().lower()
        
        # Убираем кавычки если есть
        function = function.strip('"\'')
        
        # Разбиваем по разделителям и убираем дубли
        parts = [p.strip() for p in function.split('/')]
        unique_parts = []
        seen = set()
        
        for part in parts:
            if part and part not in seen:
                seen.add(part)
                unique_parts.append(part)
        
        # Ограничиваем до 2 функций
        if len(unique_parts) > 2:
            unique_parts = unique_parts[:2]
        
        # Проверяем что функции существуют
        valid_functions = {k.lower(): k for k in self.semantic_functions.keys()}
        validated_parts = []
        
        for part in unique_parts:
            if part in valid_functions:
                validated_parts.append(valid_functions[part])
            else:
                # Пытаемся найти частичное совпадение
                for valid_key, valid_name in valid_functions.items():
                    if part in valid_key or valid_key in part:
                        validated_parts.append(valid_name)
                        break
        
        if not validated_parts:
            return "шум"
        
        return " / ".join(validated_parts) 
// Утилиты для работы с чанками

import { v4 as uuidv4 } from 'uuid';
import type { 
  Chunk, 
  DocumentState, 
  ChangeInfo, 
  ChunkMetrics
} from '../types/chunks';
import { DEFAULT_CHUNK_METRICS, CHUNK_SEPARATOR_REGEX } from '../types/chunks';

/**
 * Создает чанки из текста при первоначальной загрузке
 */
export function createChunksFromText(text: string): Chunk[] {
  console.log('🚨🚨🚨 ФУНКЦИЯ createChunksFromText ВЫЗВАНА! 🚨🚨🚨');
  console.log('📏 Длина переданного текста:', text.length);
  console.log('📝 Переданный текст:', JSON.stringify(text));
  
  if (!text.trim()) {
    console.log('❌ Пустой текст - возвращаем пустой массив');
    return [];
  }

  console.log('🔧 Используемая регулярка:', CHUNK_SEPARATOR_REGEX.source);

  // Детальная диагностика каждого символа
  console.log('🔬 ДЕТАЛЬНАЯ ДИАГНОСТИКА КАЖДОГО СИМВОЛА:');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    const name = code === 10 ? 'LF' : code === 13 ? 'CR' : code === 32 ? 'SPACE' : char;
    console.log(`  [${i}]: "${char}" → код ${code} (${name})`);
  }

  // Проверяем регулярку на всем тексте
  const separatorRegex = new RegExp(CHUNK_SEPARATOR_REGEX.source, 'g');
  console.log('🔧 Созданная регулярка:', separatorRegex);
  
  // Ищем все совпадения
  const separatorMatches = Array.from(text.matchAll(new RegExp(CHUNK_SEPARATOR_REGEX.source, 'g')));
  
  console.log('🔍 Найденные разделители (всего:', separatorMatches.length, '):');
  if (separatorMatches.length === 0) {
    console.log('  ✅ НЕТ РАЗДЕЛИТЕЛЕЙ - будет создан 1 чанк');
  } else {
    separatorMatches.forEach((match, i) => {
      const separatorStart = match.index!;
      const separatorEnd = separatorStart + match[0].length;
      console.log(`  ✅ НАЙДЕН разделитель ${i + 1}: позиция ${separatorStart}-${separatorEnd}, текст: ${JSON.stringify(match[0])}`);
    });
    console.log(`  📊 Будет создано ${separatorMatches.length + 1} чанков`);
  }

  const chunks: Chunk[] = [];
  
  let currentStart = 0;

  // Создаем чанки между разделителями
  for (let i = 0; i <= separatorMatches.length; i++) {
    let chunkEnd: number;
    let nextChunkStart: number;
    
    if (i < separatorMatches.length) {
      // Текущий чанк заканчивается ДО разделителя (исключая \n\n)
      const separatorStart = separatorMatches[i].index!;
      const separatorLength = separatorMatches[i][0].length;
      chunkEnd = separatorStart; // Заканчиваем ДО разделителя
      nextChunkStart = separatorStart + separatorLength; // Следующий чанк после разделителя
    } else {
      // Последний чанк - до конца текста
      chunkEnd = text.length;
      nextChunkStart = text.length; // Не используется для последнего чанка
    }
    
    const chunkText = text.slice(currentStart, chunkEnd);
    
    // Создаем чанк только если есть содержательный текст
    if (chunkText.trim().length > 0) {
      chunks.push({
        id: uuidv4(),
        start: currentStart,
        end: chunkEnd,
        metrics: { ...DEFAULT_CHUNK_METRICS }
      });
      
      console.log(`✅ Создан чанк ${chunks.length}: [${currentStart}-${chunkEnd-1}], текст: ${JSON.stringify(chunkText.slice(0, 50))}`);
    }

    // Следующий чанк начинается после разделителя (или в конце)
    currentStart = i < separatorMatches.length ? nextChunkStart : text.length;
  }

  console.log(`✅ Создано ${chunks.length} чанков`);
  
  return chunks;
}

/**
 * Обновляет позиции чанков после изменения текста
 */
export function updateChunkPositions(
  chunks: Chunk[],
  change: ChangeInfo
): Chunk[] {
  const { start: changeStart, end: changeEnd, newText } = change;
  const delta = newText.length - (changeEnd - changeStart);

  console.log('📍 updateChunkPositions ВЫЗВАНА с параметрами:', {
    chunksCount: chunks.length,
    changeStart,
    changeEnd,
    delta,
    newTextLength: newText.length,
    oldTextLength: changeEnd - changeStart,
    newText: JSON.stringify(newText),
    oldText: JSON.stringify(change.oldText)
  });

  const result = chunks.map((chunk, index) => {
    console.log(`🔍 Обработка чанка ${index + 1} [${chunk.start}-${chunk.end-1}]:`, {
      chunkId: chunk.id.slice(0,8),
      chunkStart: chunk.start,
      chunkEnd: chunk.end,
      changeStart,
      changeEnd,
      condition: chunk.end <= changeStart ? 'до изменения' :
                chunk.start >= changeEnd ? 'после изменения' :
                'пересекается с изменением'
    });

    if (chunk.end <= changeStart) {
      // Чанк полностью до изменения - не трогаем
      console.log(`  ✅ Чанк ${index + 1} до изменения - не трогаем`);
      return chunk;
    } else if (chunk.start >= changeEnd) {
      // Чанк полностью после изменения - сдвигаем
      const newStart = chunk.start + delta;
      const newEnd = chunk.end + delta;
      console.log(`  ↗️ Чанк ${index + 1} после изменения - сдвигаем на ${delta}: [${chunk.start}-${chunk.end-1}] → [${newStart}-${newEnd-1}]`);
      return {
        ...chunk,
        start: newStart,
        end: newEnd,
        metrics: {
          ...chunk.metrics,
          isStale: true // Помечаем как требующий обновления
        }
      };
    } else {
      // Чанк пересекается с изменением
      console.log(`  🔄 Чанк ${index + 1} пересекается с изменением`);
      
      // Особый случай: если изменение происходит точно в конце чанка (вставка)
      if (changeStart === chunk.end && changeEnd === changeStart) {
        // Это вставка в конце чанка - расширяем чанк
        const newEnd = chunk.end + delta;
        console.log(`  📝 Расширяем чанк ${index + 1} с ${chunk.end} до ${newEnd} (вставка в конце)`);
        return {
          ...chunk,
          end: newEnd,
          metrics: {
            ...chunk.metrics,
            isStale: true
          }
        };
      } else {
        // Изменение внутри чанка - помечаем как требующий полного пересчета
        console.log(`  ⚠️ Изменение внутри чанка ${index + 1} - требует пересчета`);
        
        // ИСПРАВЛЕНИЕ: корректируем end позицию чанка если изменение внутри
        let newEnd = chunk.end;
        if (changeEnd <= chunk.end) {
          // Если изменение полностью внутри чанка, корректируем end
          newEnd = chunk.end + delta;
          console.log(`  🔧 Корректируем end позицию чанка ${index + 1}: ${chunk.end} → ${newEnd} (delta: ${delta})`);
        }
        
        return {
          ...chunk,
          end: newEnd,
          metrics: {
            ...chunk.metrics,
            isStale: true
          }
        };
      }
    }
  }).filter((chunk, index) => {
    // Удаляем чанки, которые полностью попали в область изменения
    const shouldRemove = chunk.start >= changeStart && chunk.end <= changeEnd;
    if (shouldRemove) {
      console.log(`🗑️ Удаляем чанк ${index + 1} [${chunk.start}-${chunk.end-1}] - полностью в области изменения`);
    }
    return !shouldRemove;
  });

  console.log('📊 updateChunkPositions РЕЗУЛЬТАТ:', {
    oldChunksCount: chunks.length,
    newChunksCount: result.length,
    resultChunks: result.map((c, i) => ({
      index: i + 1,
      id: c.id.slice(0,8),
      start: c.start,
      end: c.end,
      isStale: c.metrics.isStale
    }))
  });

  return result;
}

/**
 * Пересчитывает все чанки для нового текста, сохраняя ID где возможно
 */
export function recalculateAllChunks(
  newText: string, 
  oldChunks: Chunk[] = []
): Chunk[] {
  const newChunks = createChunksFromText(newText);
  
  console.log('🔄 Пересчет чанков:', {
    oldChunksCount: oldChunks.length,
    newChunksCount: newChunks.length
  });
  
  // Пытаемся сопоставить новые чанки со старыми по содержимому и позициям
  const usedOldChunkIds = new Set<string>(); // Отслеживаем уже использованные ID
  
  return newChunks.map((newChunk, index) => {
    const chunkText = newText.slice(newChunk.start, newChunk.end);
    
    // Сначала пытаемся найти чанк с тем же индексом
    if (oldChunks[index] && !usedOldChunkIds.has(oldChunks[index].id)) {
      const oldChunkText = oldChunks[index] ? 
        // Если у нас есть старый текст, используем его для сравнения
        (oldChunks[index].start !== undefined && oldChunks[index].end !== undefined) ? 
          newText.slice(oldChunks[index].start, oldChunks[index].end) : 
          chunkText
        : chunkText;
      
      // Если текст совпадает или очень похож, сохраняем ID
      if (chunkText.trim() === oldChunkText.trim() || 
          chunkText.includes(oldChunkText.trim()) || 
          oldChunkText.includes(chunkText.trim())) {
        console.log(`✅ Сохраняем ID чанка ${index + 1}: ${oldChunks[index].id.slice(0, 8)}`);
        usedOldChunkIds.add(oldChunks[index].id);
        return {
          ...newChunk,
          id: oldChunks[index].id,
          metrics: {
            ...oldChunks[index].metrics,
            isStale: true // Помечаем как требующий проверки
          }
        };
      }
    }
    
    // Если не нашли по индексу, ищем по содержимому среди неиспользованных
    // TODO: Реализовать правильное сравнение по содержимому когда будет доступ к старому тексту
    // Пока отключено чтобы избежать дублирования ID
    /*
    const matchingOldChunk = oldChunks.find(oldChunk => {
      if (usedOldChunkIds.has(oldChunk.id)) {
        return false; // Уже использован
      }
      
      // Простое сравнение по первым/последним словам
      const currentWords = chunkText.trim().split(/\s+/);
      const oldChunkTextApprox = chunkText; // Упрощение, так как нет доступа к старому тексту
      const oldWords = oldChunkTextApprox.trim().split(/\s+/);
      
      if (currentWords.length < 3 || oldWords.length < 3) {
        return false; // Слишком короткий для надежного сравнения
      }
      
      // Проверяем совпадение первых и последних слов
      return currentWords[0] === oldWords[0] && 
             currentWords[currentWords.length - 1] === oldWords[oldWords.length - 1];
    });

    if (matchingOldChunk) {
      console.log(`✅ Найден совпадающий чанк для ${index + 1}: ${matchingOldChunk.id.slice(0, 8)}`);
      usedOldChunkIds.add(matchingOldChunk.id);
      return {
        ...newChunk,
        id: matchingOldChunk.id,
        metrics: {
          ...matchingOldChunk.metrics,
          isStale: true
        }
      };
    }
    */

    console.log(`🆕 Создаем новый чанк ${index + 1}: ${newChunk.id.slice(0, 8)}`);
    return newChunk;
  });
}

/**
 * Получает текст чанка из документа
 */
export function getChunkText(document: DocumentState, chunkId: string): string {
  const chunk = document.chunks.find(c => c.id === chunkId);
  if (!chunk) return '';
  
  return document.text.slice(chunk.start, chunk.end);
}

/**
 * Получает все тексты чанков
 */
export function getAllChunkTexts(document: DocumentState): Array<{id: string, text: string}> {
  return document.chunks.map(chunk => ({
    id: chunk.id,
    text: document.text.slice(chunk.start, chunk.end)
  }));
}

/**
 * Проверяет, нужно ли создать новые чанки (при появлении разделителей)
 */
export function shouldCreateNewChunks(
  text: string,
  change: ChangeInfo
): boolean {
  console.log('🤔 shouldCreateNewChunks ВЫЗВАНА с параметрами:', {
    textLength: text.length,
    changeStart: change.start,
    changeEnd: change.end,
    oldText: JSON.stringify(change.oldText),
    newText: JSON.stringify(change.newText)
  });

  // Универсальная функция проверки наличия разделителей
  const hasLineSeparators = (text: string): boolean => {
    return new RegExp(CHUNK_SEPARATOR_REGEX.source).test(text);
  };

  // Функция подсчета разделителей
  const countSeparators = (text: string): number => {
    const matches = text.match(new RegExp(CHUNK_SEPARATOR_REGEX.source, 'g'));
    return matches ? matches.length : 0;
  };
  
  // 1. Если добавляется текст с разделителями - нужно пересчитать
  if (hasLineSeparators(change.newText)) {
    console.log('✅ РЕШЕНИЕ: Найден разделитель в добавляемом тексте - ПЕРЕСЧИТЫВАЕМ чанки');
    return true;
  }

  // 2. Если удаляется текст с разделителями - нужно пересчитать  
  if (change.oldText && hasLineSeparators(change.oldText)) {
    console.log('✅ РЕШЕНИЕ: Найден разделитель в удаляемом тексте - ПЕРЕСЧИТЫВАЕМ чанки');
    return true;
  }

  // 3. Проверяем контекст вокруг изменения - может образоваться/исчезнуть разделитель
  const contextBefore = text.slice(Math.max(0, change.start - 5), change.start);
  const contextAfter = text.slice(change.end, Math.min(text.length, change.end + 5));
  const fullContext = contextBefore + change.newText + contextAfter;
  
  console.log('🔍 Анализ контекста:', {
    contextBefore: JSON.stringify(contextBefore),
    newText: JSON.stringify(change.newText),
    contextAfter: JSON.stringify(contextAfter),
    fullContext: JSON.stringify(fullContext)
  });

  // 4. НОВАЯ ПРОВЕРКА: сравниваем количество разделителей до и после
  const separatorsInNewText = countSeparators(text);
  
  // Воссоздаем старый текст для подсчета разделителей
  const oldText = text.slice(0, change.start) + change.oldText + text.slice(change.end);
  const separatorsInOldText = countSeparators(oldText);
  
  console.log('🔢 Сравнение количества разделителей:', {
    oldText: JSON.stringify(oldText),
    newText: JSON.stringify(text),
    separatorsInOldText,
    separatorsInNewText,
    difference: separatorsInNewText - separatorsInOldText
  });

  if (separatorsInOldText !== separatorsInNewText) {
    console.log('✅ РЕШЕНИЕ: Изменилось количество разделителей - ПЕРЕСЧИТЫВАЕМ чанки');
    return true;
  }

  // 5. Если в результирующем контексте есть разделители - возможно нужно пересчитать
  if (hasLineSeparators(fullContext)) {
    console.log('✅ РЕШЕНИЕ: Найден разделитель в контексте - ПЕРЕСЧИТЫВАЕМ чанки');
    return true;
  }

  console.log('❌ РЕШЕНИЕ: Разделители не изменились - ОБНОВЛЯЕМ только позиции');
  return false;
}

/**
 * Обновляет метрики чанка
 */
export function updateChunkMetrics(
  chunks: Chunk[],
  chunkId: string,
  metrics: Partial<ChunkMetrics>
): Chunk[] {
  return chunks.map(chunk => 
    chunk.id === chunkId 
      ? {
          ...chunk,
          metrics: {
            ...chunk.metrics,
            ...metrics,
            lastUpdated: Date.now(),
            isStale: false,
            isUpdating: false
          }
        }
      : chunk
  );
}

/**
 * Помечает чанк как обновляющийся
 */
export function markChunkAsUpdating(
  chunks: Chunk[],
  chunkId: string
): Chunk[] {
  return chunks.map(chunk =>
    chunk.id === chunkId
      ? {
          ...chunk,
          metrics: {
            ...chunk.metrics,
            isUpdating: true
          }
        }
      : chunk
  );
}

/**
 * Получает чанки, требующие обновления метрик
 */
export function getStaleChunks(chunks: Chunk[]): Chunk[] {
  return chunks.filter(chunk => chunk.metrics.isStale && !chunk.metrics.isUpdating);
}

/**
 * Валидирует корректность позиций чанков
 */
export function validateChunkPositions(
  chunks: Chunk[],
  textLength: number
): boolean {
  console.log('🔍 Валидация чанков:', { chunksCount: chunks.length, textLength });
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Проверяем границы
    if (chunk.start < 0 || chunk.end > textLength || chunk.start >= chunk.end) {
      console.error(`❌ Некорректные границы чанка ${chunk.id.slice(0, 8)}: start=${chunk.start}, end=${chunk.end}, textLength=${textLength}`);
      return false;
    }
    
    // Проверяем пересечения с другими чанками
    for (let j = i + 1; j < chunks.length; j++) {
      const otherChunk = chunks[j];
      if (!(chunk.end <= otherChunk.start || otherChunk.end <= chunk.start)) {
        console.error(`❌ Пересечение чанков ${chunk.id.slice(0, 8)} (${chunk.start}-${chunk.end-1}) и ${otherChunk.id.slice(0, 8)} (${otherChunk.start}-${otherChunk.end-1})`);
        return false;
      }
    }
    
    console.log(`✅ Чанк ${i + 1}: ${chunk.id.slice(0, 8)} (${chunk.start}-${chunk.end-1}) - OK`);
  }
  
  console.log('✅ Валидация чанков прошла успешно');
  return true;
}

/**
 * Перемещает чанк в новую позицию (для drag & drop)
 */
export function moveChunk(
  document: DocumentState,
  sourceChunkId: string,
  targetPosition: number
): DocumentState {
  const sourceChunk = document.chunks.find(c => c.id === sourceChunkId);
  if (!sourceChunk) {
    throw new Error(`Чанк ${sourceChunkId} не найден`);
  }

  // 1. Извлекаем текст перетаскиваемого чанка
  const chunkText = document.text.slice(sourceChunk.start, sourceChunk.end);
  
  // 2. Удаляем чанк из исходной позиции
  const textWithoutSource = 
    document.text.slice(0, sourceChunk.start) + 
    document.text.slice(sourceChunk.end);
  
  // 3. Корректируем целевую позицию если она после удаленного чанка
  let adjustedTargetPosition = targetPosition;
  if (targetPosition > sourceChunk.start) {
    adjustedTargetPosition -= (sourceChunk.end - sourceChunk.start);
  }
  
  // 4. Вставляем в новую позицию
  const newText = 
    textWithoutSource.slice(0, adjustedTargetPosition) + 
    chunkText + 
    textWithoutSource.slice(adjustedTargetPosition);
  
  // 5. Пересчитываем все чанки
  const newChunks = recalculateAllChunks(newText, document.chunks);
  
  return {
    ...document,
    text: newText,
    chunks: newChunks,
    version: document.version + 1,
    metadata: {
      ...document.metadata,
      last_modified: new Date().toISOString()
    }
  };
}

/**
 * Находит чанк, в котором находится указанная позиция
 */
export function findChunkAtPosition(
  chunks: Chunk[],
  position: number
): Chunk | null {
  return chunks.find(chunk => 
    position >= chunk.start && position <= chunk.end
  ) || null;
} 
# Полная документация по миграции на панельную архитектуру

## 🎯 Цель проекта

Преобразовать существующий Text Quality Analyzer из текущей архитектуры с переключением режимов (editor/cards) в современную 3-панельную систему по типу Obsidian/VS Code:

1. **Text Editor Panel** - редактирование с загрузкой файлов
2. **Card Deck Panel** - карточное представление (адаптация существующего)
3. **Semantic Map Panel** - заготовка под граф связанности

## 📊 Анализ текущей архитектуры

### **Что уже готово к использованию:**

✅ **API клиент** (`src/api/index.ts`) - все методы реализованы:

- `initializeAnalysis()` - полный анализ
- `fetchAnalysis()` - получение анализа по session_id
- `updateTextAndRestructureParagraph()` - обновление с разделением
- `refreshFullSemanticAnalysis()` - пересчет семантики
- `mergeParagraphs()`, `deleteParagraph()`, `reorderParagraphs()` и др.

✅ **Типы данных** (`src/components/CardView/types.ts`) - все интерфейсы готовы:

- `ParagraphData`, `AnalysisResponse`, `ParagraphMetrics` и др.

✅ **Компоненты карточек** - полностью функциональные:

- `Card.tsx` - отдельная карточка с редактированием
- `CardList.tsx` - список с фильтрами и сортировкой
- `DraggableCardList.tsx` - drag & drop функциональность
- `SemanticIcon.tsx` - иконки семантических функций

✅ **Текстовый редактор** (`FullTextEditor.tsx`) - загрузка файлов, paste, валидация

### **Что нужно создать:**

❌ **Zustand store** - централизованное управление состоянием ❌ **Базовый Panel компонент** - обертка для панелей в стиле Obsidian ❌ **Хуки синхронизации** - связь между панелями ❌ **Панельные обертки** - адаптеры для существующих компонентов ❌ **Новый App.tsx** - упрощенный управляющий компонент

---

## 🏗️ **АРХИТЕКТУРА ZUSTAND STORE**

### **Ответы на вопросы Copilot**

#### **1. Централизация состояния - что хранить в store**

**🟢 ЦЕНТРАЛИЗОВАТЬ (общее для всех панелей):**

```typescript
interface CentralizedState {
  // === ДАННЫЕ СЕССИИ ===
  session: AnalysisResponse | null           // Основные данные анализа
  sessionId: string | null                   // ID активной сессии
  loading: boolean                           // Глобальное состояние загрузки
  error: string | null                       // Глобальные ошибки
  
  // === СИНХРОНИЗАЦИЯ ПАНЕЛЕЙ ===
  selectedParagraphId: string | null         // Выбранный абзац (все панели)
  hoveredParagraphId: string | null          // Hover абзаца (все панели)
  
  // === ФИЛЬТРАЦИЯ И ПОИСК ===
  searchQuery: string                        // Поиск по тексту
  semanticFilter: string                     // Фильтр по семантике
  sortField: SortField                       // Поле сортировки
  sortDirection: SortDirection               // Направление сортировки
  
  // === СТАТУС АНАЛИЗА ===
  isSemanticAnalysisUpToDate: boolean        // Актуальность семантики
  isBackendReady: boolean                    // Статус бэкенда
}
```

**🟡 ЛОКАЛЬНОЕ СОСТОЯНИЕ (внутри панелей):**

```typescript
// В каждой панели - свое состояние для UI
interface LocalPanelState {
  // TextEditor Panel
  editorFullText: string                     // Черновик текста
  editorTopic: string                        // Черновик темы
  fileError: string | null                  // Ошибки файлов
  
  // CardDeck Panel  
  editingParagraphId: number | null          // ID редактируемой карточки
  editingText: string                        // Черновик редактирования
  isSaving: boolean                          // Статус сохранения
  
  // SemanticMap Panel
  mapSettings: MapSettings                   // Настройки визуализации
  selectedNodes: string[]                    // Выбранные узлы
}
```

**🔴 НЕ ЦЕНТРАЛИЗОВАТЬ:**

- Временные UI состояния (dropdown открыт/закрыт)
- Локальные ошибки валидации
- Промежуточные состояния drag&drop
- Позиции скролла панелей

#### **2. Обработка конфликтов при одновременном редактировании**

**Проблема:** Пользователь редактирует карточку + одновременно меняет текст в редакторе

**Решение - система блокировок:**

```typescript
interface EditingState {
  // Система взаимоисключающих блокировок
  currentEditMode: 'none' | 'text-editor' | 'card-editor'
  editingParagraphId: number | null
  editingStartTime: number | null
}

// В store
const useAppStore = create<AppState>((set, get) => ({
  // ... другие поля
  editingState: {
    currentEditMode: 'none',
    editingParagraphId: null,
    editingStartTime: null
  },

  // Попытка начать редактирование карточки
  startCardEditing: (paragraphId: number) => {
    const { editingState } = get()
    
    // Проверяем конфликты
    if (editingState.currentEditMode === 'text-editor') {
      return { 
        success: false, 
        error: 'Сначала завершите редактирование в текстовом редакторе' 
      }
    }
    
    if (editingState.editingParagraphId === paragraphId) {
      return { success: true } // Уже редактируем этот абзац
    }
    
    if (editingState.editingParagraphId !== null) {
      return { 
        success: false, 
        error: `Завершите редактирование абзаца ${editingState.editingParagraphId}` 
      }
    }
    
    // Разрешаем редактирование
    set({
      editingState: {
        currentEditMode: 'card-editor',
        editingParagraphId: paragraphId,
        editingStartTime: Date.now()
      }
    })
    
    return { success: true }
  },

  // Попытка начать редактирование в текстовом редакторе
  startTextEditing: () => {
    const { editingState } = get()
    
    if (editingState.currentEditMode === 'card-editor') {
      return { 
        success: false, 
        error: `Завершите редактирование карточки ${editingState.editingParagraphId}` 
      }
    }
    
    set({
      editingState: {
        currentEditMode: 'text-editor',
        editingParagraphId: null,
        editingStartTime: Date.now()
      }
    })
    
    return { success: true }
  },

  // Завершение редактирования
  finishEditing: () => {
    set({
      editingState: {
        currentEditMode: 'none',
        editingParagraphId: null,
        editingStartTime: null
      }
    })
  }
}))
```

**Визуальные индикаторы конфликтов:**

```typescript
// В TextEditorPanel
const TextEditorPanel = () => {
  const { editingState, startTextEditing } = useAppStore()
  const [localText, setLocalText] = useState('')
  
  const handleTextClick = () => {
    const result = startTextEditing()
    if (!result.success) {
      // Показываем предупреждение
      toast.warn(result.error)
      return
    }
    // Разрешаем редактирование
  }
  
  const isBlocked = editingState.currentEditMode === 'card-editor'
  
  return (
    <div className={isBlocked ? 'opacity-50 pointer-events-none' : ''}>
      {isBlocked && (
        <div className="absolute inset-0 bg-yellow-100 bg-opacity-75 flex items-center justify-center z-10">
          <div className="bg-white p-4 rounded shadow-lg">
            🔒 Завершите редактирование карточки {editingState.editingParagraphId}
          </div>
        </div>
      )}
      <textarea 
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onClick={handleTextClick}
        disabled={isBlocked}
      />
    </div>
  )
}
```

#### **3. Undo/Redo система**

**Да, нужна! Но с ограниченным scope:**

```typescript
interface HistoryState {
  past: AnalysisResponse[]                   // История изменений
  present: AnalysisResponse | null           // Текущее состояние
  future: AnalysisResponse[]                 // Отмененные изменения
  maxHistorySize: number                     // Лимит истории (10-20 записей)
}

// Middleware для undo/redo
const withHistory = <T extends object>(
  config: StateCreator<T>
): StateCreator<T & HistoryState> => (set, get, api) => ({
  ...config(set, get, api),
  
  // История
  past: [],
  present: null,
  future: [],
  maxHistorySize: 15,
  
  // Сохранить состояние в историю
  saveToHistory: () => {
    const { present, past, maxHistorySize } = get()
    if (!present) return
    
    const newPast = [...past, present].slice(-maxHistorySize)
    
    set({
      past: newPast,
      future: [] // Очищаем future при новом действии
    })
  },
  
  // Отменить последнее действие
  undo: () => {
    const { past, present, future } = get()
    if (past.length === 0) return false
    
    const previous = past[past.length - 1]
    const newPast = past.slice(0, -1)
    
    set({
      past: newPast,
      present: previous,
      future: present ? [present, ...future] : future,
      session: previous // Обновляем текущую сессию
    })
    
    return true
  },
  
  // Повторить отмененное действие
  redo: () => {
    const { past, present, future } = get()
    if (future.length === 0) return false
    
    const next = future[0]
    const newFuture = future.slice(1)
    
    set({
      past: present ? [...past, present] : past,
      present: next,
      future: newFuture,
      session: next // Обновляем текущую сессию
    })
    
    return true
  },
  
  // Проверка доступности undo/redo
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0
})

// Применяем middleware к store
export const useAppStore = create<AppState & HistoryState>()(
  devtools(
    subscribeWithSelector(
      withHistory((set, get) => ({
        // ... основная логика store
        
        // Обертка для API вызовов с сохранением истории
        handleAnalyzeText: async (text: string, topic: string) => {
          const { saveToHistory } = get()
          
          // Сохраняем текущее состояние перед анализом
          if (get().present) {
            saveToHistory()
          }
          
          try {
            const result = await api.initializeAnalysis(text, topic)
            
            set({ 
              session: result,
              present: result // Обновляем present для истории
            })
          } catch (error) {
            // При ошибке не сохраняем в историю
            throw error
          }
        },
        
        // Обертки для других операций изменения
        updateParagraphWithHistory: async (id: string, text: string) => {
          const { saveToHistory } = get()
          saveToHistory() // Сохраняем перед изменением
          
          // ... логика обновления
        }
      }))
    )
  )
)
```

**Горячие клавиши для undo/redo:**

```typescript
// В App.tsx - глобальные хоткеи
const App = () => {
  const { undo, redo, canUndo, canRedo } = useAppStore()
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) {
          undo()
          toast.success('Отменено')
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo()) {
          redo()
          toast.success('Повторено')
        }
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo])
  
  return (
    // ... компоненты
  )
}
```

**UI для undo/redo:**

```typescript
// Кнопки в header'е приложения
const UndoRedoControls = () => {
  const { undo, redo, canUndo, canRedo } = useAppStore()
  
  return (
    <div className="flex items-center space-x-1">
      <button
        onClick={undo}
        disabled={!canUndo()}
        className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
        title="Отменить (Ctrl+Z)"
      >
        ↶
      </button>
      <button
        onClick={redo}
        disabled={!canRedo()}
        className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
        title="Повторить (Ctrl+Y)"
      >
        ↷
      </button>
    </div>
  )
}
```

### **Полная схема state management**

```typescript
interface CompleteAppState {
  // === ОСНОВНЫЕ ДАННЫЕ ===
  session: AnalysisResponse | null
  loading: boolean
  error: string | null
  
  // === СИНХРОНИЗАЦИЯ ===
  selectedParagraphId: string | null
  hoveredParagraphId: string | null
  
  // === ФИЛЬТРАЦИЯ ===
  searchQuery: string
  semanticFilter: string
  sortField: SortField
  sortDirection: SortDirection
  
  // === СОСТОЯНИЕ РЕДАКТИРОВАНИЯ ===
  editingState: {
    currentEditMode: 'none' | 'text-editor' | 'card-editor'
    editingParagraphId: number | null
    editingStartTime: number | null
  }
  
  // === ИСТОРИЯ ===
  past: AnalysisResponse[]
  present: AnalysisResponse | null
  future: AnalysisResponse[]
  
  // === PERFORMANCE CACHE ===
  _cachedResults: Record<string, ParagraphData[]>
  _lastCacheUpdate: number
  
  // === ДЕЙСТВИЯ ===
  // Основные операции
  handleAnalyzeText: (text: string, topic: string) => Promise<void>
  updateParagraphWithHistory: (id: string, text: string) => Promise<void>
  
  // Управление редактированием  
  startCardEditing: (paragraphId: number) => { success: boolean; error?: string }
  startTextEditing: () => { success: boolean; error?: string }
  finishEditing: () => void
  
  // История
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  saveToHistory: () => void
  
  // Синхронизация
  setSelectedParagraph: (id: string | null) => void
  setHoveredParagraph: (id: string | null) => void
  
  // Кеш
  clearCache: () => void
  invalidateCache: (reason?: string) => void
}
```

### **Преимущества такой архитектуры:**

✅ **Четкое разделение ответственности** - что централизовать, а что держать локально ✅ **Предотвращение конфликтов** - система блокировок при редактировании  
✅ **Удобство использования** - Ctrl+Z/Ctrl+Y работает во всем приложении ✅ **Производительность** - кеширование дорогих вычислений ✅ **Отладка** - вся история изменений доступна в DevTools

### **Зависимости для реализации:**

```bash
# Для toast уведомлений
npm install react-hot-toast

# Для обработки горячих клавиш (если нужно больше возможностей)
npm install react-hotkeys-hook
```

---

## 🛡️ СИСТЕМА КОНТРОЛЬНЫХ ТОЧЕК И УПРАВЛЕНИЕ РИСКАМИ

### **ОСНОВНЫЕ РИСКИ:**

🚨 **Критический риск:** Потеря функционала (App.tsx содержит 900+ строк логики) ⚡ **Риск производительности:** 3 панели одновременно vs переключение режимов  
🏗️ **Архитектурный риск:** Сложная синхронизация refs между панелями

### **CHECKPOINT СИСТЕМА:**

**Принцип:** На каждой точке делаем Git commit + тестирование + план отката

#### **📍 CHECKPOINT 1: Инфраструктура (День 1)**

**Что делаем:**

- Создаем Zustand store
- Базовый компонент Panel
- Хуки синхронизации
- CSS для панелей

**Критерии успеха:**

- [ ] Store компилируется без ошибок
- [ ] Panel рендерится с mock данными
- [ ] CSS не ломает существующий дизайн
- [ ] Bundle size +50KB максимум

**План отката:** `git checkout checkpoint-0-baseline`

#### **📍 CHECKPOINT 2: Базовая интеграция (День 2)**

**Что делаем:**

- Интегрируем store с App.tsx
- Простейшая Text Editor Panel
- Показываем legacy + новую панель одновременно

**Критерии успеха:**

- [ ] Существующий функционал работает как раньше
- [ ] Новая панель показывает данные из store
- [ ] Performance деградация <20%

**⚠️ КРИТИЧЕСКИЙ РИСК:** Поломка существующего функционала **План отката:** `git checkout checkpoint-1-infrastructure`

#### **📍 CHECKPOINT 3: Card Deck Migration (День 3-4)**

**Что делаем:**

- Переносим CardList в панель
- Сохраняем все функции (editing, drag&drop)
- Убираем дублирование логики

**Критерии успеха:**

- [ ] Все функции карточек работают
- [ ] Drag & drop работает
- [ ] Синхронизация Editor ↔ Cards работает

**⚠️ ВЫСОКИЙ РИСК:** Поломка DraggableCardList логики **План отката:** `git checkout checkpoint-2-basic-panel`

#### **📍 CHECKPOINT 4: Полная замена App.tsx (День 5-6)**

**Что делаем:**

- Убираем переключение режимов
- 3 панели одновременно
- Упрощаем App.tsx до <200 строк

**Критерии успеха:**

- [ ] Все функции работают в панельном режиме
- [ ] App.tsx стал простым
- [ ] UX не хуже чем раньше

**⚠️ КРИТИЧЕСКИЙ РИСК:** Полная потеря функционала **План отката:** `git checkout checkpoint-3-cards-migration`

#### **📍 CHECKPOINT 5: Semantic Map заготовка (День 7-8)**

**Что делаем:**

- Пустая Semantic Map Panel
- Финальная полировка
- Подготовка к D3.js

**Критерии успеха:**

- [ ] 3 панели стабильно работают
- [ ] Готова архитектура для D3.js

---

## 🚀 ПЛАН РЕАЛИЗАЦИИ

### **ЭТАП 1: Создание Zustand Store (на основе App.tsx)**

**Файл:** `src/store/appStore.ts`

```typescript
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import * as api from '../api'
import type { AnalysisResponse, ParagraphData } from '../components/CardView/types'

interface AppState {
  // === ДАННЫЕ СЕССИИ (из App.tsx) ===
  session: AnalysisResponse | null
  loading: boolean
  error: string | null
  isSemanticAnalysisUpToDate: boolean
  isBackendReady: boolean
  backendError: string | null

  // === ТЕКСТОВЫЙ РЕДАКТОР ===
  editorFullText: string
  editorTopic: string

  // === НАСТРОЙКИ ПАНЕЛЕЙ (из App.tsx) ===
  fontSize: number
  fontFamily: string
  signalMinColor: string
  signalMaxColor: string
  complexityMinColor: string
  complexityMaxColor: string
  
  // === ФИЛЬТРАЦИЯ И СОРТИРОВКА ===
  sortField: 'id' | 'signal_strength' | 'complexity' | 'semantic_function'
  sortDirection: 'asc' | 'desc'
  semanticFilter: string
  searchQuery: string

  // === СИНХРОНИЗАЦИЯ ПАНЕЛЕЙ ===
  selectedParagraphId: string | null
  hoveredParagraphId: string | null

  // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
  handleAnalyzeText: (text: string, topic: string) => Promise<void>
  handleSemanticRefreshSuccess: (updatedSession: AnalysisResponse) => void
  markSemanticsAsStale: () => void
  
  // === СИНХРОНИЗАЦИЯ ===
  setSelectedParagraph: (id: string | null) => void
  setHoveredParagraph: (id: string | null) => void
  scrollToCard: (paragraphId: number) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Начальное состояние
      session: null,
      loading: false,
      error: null,
      isSemanticAnalysisUpToDate: true,
      isBackendReady: true,
      backendError: null,
      editorFullText: '',
      editorTopic: '',
      
      // Настройки из App.tsx константы
      fontSize: 12,
      fontFamily: "Arial, sans-serif",
      signalMinColor: "#FFFFFF",
      signalMaxColor: "#FFDB58",
      complexityMinColor: "#00FF00",
      complexityMaxColor: "#FF0000",
      
      sortField: 'id',
      sortDirection: 'asc',
      semanticFilter: 'all',
      searchQuery: '',
      
      selectedParagraphId: null,
      hoveredParagraphId: null,

      // Основные действия (адаптация из App.tsx)
      handleAnalyzeText: async (text: string, topic: string) => {
        set({ loading: true, error: null, isSemanticAnalysisUpToDate: false })
        
        try {
          const analysisSessionData = await api.initializeAnalysis(text, topic)
          
          set({
            session: analysisSessionData,
            editorFullText: text,
            editorTopic: analysisSessionData.metadata.topic,
            isSemanticAnalysisUpToDate: true,
            loading: false
          })

          document.title = analysisSessionData.metadata.topic || "Анализ текста"
          window.history.pushState({}, '', `?session_id=${analysisSessionData.metadata.session_id}`)

        } catch (err) {
          set({ 
            error: err instanceof Error ? err.message : 'Ошибка при анализе текста',
            loading: false 
          })
        }
      },

      handleSemanticRefreshSuccess: (updatedSession) => {
        set({
          session: updatedSession,
          isSemanticAnalysisUpToDate: true
        })
        document.title = updatedSession.metadata.topic || "Анализ текста (обновлено)"
      },

      markSemanticsAsStale: () => set({ isSemanticAnalysisUpToDate: false }),

      // Синхронизация панелей
      setSelectedParagraph: (id) => {
        set({ selectedParagraphId: id })
        
        // CSS синхронизация
        if (id) {
          const elements = document.querySelectorAll(`[data-paragraph-id="${id}"]`)
          elements.forEach(el => el.classList.add('selected-paragraph'))
          
          const allElements = document.querySelectorAll('[data-paragraph-id]')
          allElements.forEach(el => {
            if (el.getAttribute('data-paragraph-id') !== id) {
              el.classList.remove('selected-paragraph')
            }
          })
        }
      },

      setHoveredParagraph: (id) => {
        set({ hoveredParagraphId: id })
        
        const allElements = document.querySelectorAll('[data-paragraph-id]')
        allElements.forEach(el => el.classList.remove('hovered-paragraph'))
        
        if (id) {
          const elements = document.querySelectorAll(`[data-paragraph-id="${id}"]`)
          elements.forEach(el => el.classList.add('hovered-paragraph'))
        }
      },

      scrollToCard: (paragraphId: number) => {
        // Логика скролла из App.tsx
        const cardElement = document.querySelector(`[data-paragraph-id="${paragraphId}"]`)
        if (cardElement) {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          
          // Анимация "прыжка"
          cardElement.classList.add('card-jump')
          setTimeout(() => cardElement.classList.remove('card-jump'), 600)
        }
      }
    })),
    { name: 'text-analyzer-store' }
  )
)

// Селектор для отфильтрованных параграфов (логика из App.tsx)
export const useSortedAndFilteredParagraphs = () => {
  return useAppStore((state) => {
    if (!state.session) return []
    
    let result = [...state.session.paragraphs]
    
    // Фильтрация
    if (state.semanticFilter !== 'all') {
      result = result.filter(p => 
        (p.metrics.semantic_function || 'Не определено') === state.semanticFilter
      )
    }
    
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase()
      result = result.filter(p => p.text.toLowerCase().includes(query))
    }
    
    // Сортировка
    result.sort((a, b) => {
      let aValue: any = state.sortField === 'id' ? a.id : 
        a.metrics[state.sortField as keyof ParagraphData["metrics"]] ?? 
        (state.sortField === 'semantic_function' ? 'Не определено' : 0)
      
      let bValue: any = state.sortField === 'id' ? b.id : 
        b.metrics[state.sortField as keyof ParagraphData["metrics"]] ?? 
        (state.sortField === 'semantic_function' ? 'Не определено' : 0)
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return state.sortDirection === 'asc' ? 
          aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      
      return state.sortDirection === 'asc' ? (aValue - bValue) : (bValue - aValue)
    })
    
    return result
  })
}
```

### **ЭТАП 2: Базовые компоненты**

**Файл:** `src/components/panels/Panel.tsx`

```typescript
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PanelProps {
  id: string
  title: string
  children: React.ReactNode
  headerControls?: React.ReactNode
  className?: string
}

export const Panel: React.FC<PanelProps> = ({
  id,
  title,
  children,
  headerControls,
  className = ''
}) => {
  const [isMinimized, setIsMinimized] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className={`flex flex-col h-full bg-gray-50 border border-gray-300 ${className}`}>
      {/* Sticky Header - стиль Obsidian */}
      <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-gray-200 rounded text-gray-600 text-sm"
            >
              {isMinimized ? '▼' : '▲'}
            </button>
            <h3 className="text-sm font-medium text-gray-800">{title}</h3>
          </div>
          
          {headerControls && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 hover:bg-gray-200 rounded text-gray-600 text-sm"
            >
              ⚙️
            </button>
          )}
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && headerControls && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2 p-2 bg-white border border-gray-200 rounded"
            >
              {headerControls}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden bg-white"
          >
            <div className="panel-content h-full overflow-auto">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

**Файл:** `src/hooks/usePanelSync.ts`

```typescript
import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export const usePanelSync = () => {
  const { 
    selectedParagraphId, 
    hoveredParagraphId, 
    setSelectedParagraph,
    setHoveredParagraph,
    scrollToCard
  } = useAppStore()

  return {
    selectedParagraphId,
    hoveredParagraphId,
    setSelectedParagraph,
    setHoveredParagraph,
    scrollToCard
  }
}

export const useClipboard = () => {
  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      return text
    } catch (error) {
      console.error('Failed to read clipboard:', error)
      return null
    }
  }, [])

  return { pasteFromClipboard }
}

export const useFileDrop = () => {
  const handleDrop = useCallback(async (files: FileList) => {
    const file = files[0]
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md'))) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsText(file)
      })
    }
    return null
  }, [])

  return { handleDrop }
}
```

### **ЭТАП 3: Создание панелей**

**Файл:** `src/components/panels/TextEditorPanel/index.tsx`

```typescript
import React, { useCallback, useRef, useState } from 'react'
import { Panel } from '../Panel'
import { useAppStore } from '../../../store/appStore'
import { useClipboard, useFileDrop } from '../../../hooks/usePanelSync'

export const TextEditorPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  
  const { 
    editorFullText,
    editorTopic,
    loading,
    error,
    isBackendReady,
    backendError,
    handleAnalyzeText
  } = useAppStore()
  
  const { pasteFromClipboard } = useClipboard()
  const { handleDrop } = useFileDrop()

  const handleFileLoad = useCallback(async (file: File) => {
    setFileError(null)
    
    if (!file.type.match('text.*') && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      setFileError('Пожалуйста, загрузите текстовый файл')
      return
    }
    
    if (file.size > 1024 * 1024) {
      setFileError('Размер файла не должен превышать 1MB')
      return
    }

    try {
      const text = await handleDrop([file] as any)
      if (text) {
        useAppStore.setState({ editorFullText: text })
      }
    } catch (error) {
      setFileError('Ошибка при чтении файла')
    }
  }, [handleDrop])

  const handlePaste = useCallback(async () => {
    const text = await pasteFromClipboard()
    if (text) {
      useAppStore.setState({ editorFullText: text })
    }
  }, [pasteFromClipboard])

  const handleAnalyze = useCallback(async () => {
    if (!editorFullText.trim() || !editorTopic.trim()) return
    
    try {
      await handleAnalyzeText(editorFullText, editorTopic)
    } catch (error) {
      console.error('Analysis failed:', error)
    }
  }, [editorFullText, editorTopic, handleAnalyzeText])

  const headerControls = (
    <div className="space-y-2">
      <div className="flex space-x-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || !isBackendReady}
          className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded disabled:opacity-50"
        >
          📁 Load File
        </button>
        <button
          onClick={handlePaste}
          disabled={loading || !isBackendReady}
          className="px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded disabled:opacity-50"
        >
          📋 Paste
        </button>
      </div>
      <button
        onClick={handleAnalyze}
        disabled={loading || !isBackendReady || !editorFullText.trim() || !editorTopic.trim()}
        className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm disabled:opacity-50 w-full"
      >
        ▶️ Analyze Text
      </button>
    </div>
  )

  return (
    <Panel
      id="editor"
      title="Text Editor"
      headerControls={headerControls}
    >
      <div className="h-full flex flex-col space-y-4 p-4">
        {/* Topic Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Topic
          </label>
          <input
            type="text"
            value={editorTopic}
            onChange={(e) => useAppStore.setState({ editorTopic: e.target.value })}
            disabled={loading}
            placeholder="Enter document topic..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          />
        </div>

        {/* Text Editor */}
        <div className="flex-1">
          <textarea
            value={editorFullText}
            onChange={(e) => useAppStore.setState({ editorFullText: e.target.value })}
            disabled={loading}
            placeholder="Enter or paste your text here, or drag & drop a .txt file..."
            className="w-full h-full p-4 resize-none border border-gray-300 rounded-lg outline-none disabled:bg-gray-50"
            style={{
              fontSize: '16px',
              fontFamily: 'Inter',
              lineHeight: 1.6
            }}
          />
        </div>

        {/* Error Messages */}
        {fileError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <strong>Файл:</strong> {fileError}
          </div>
        )}
        
        {!isBackendReady && backendError && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
            <strong>Сервер:</strong> {backendError}
          </div>
        )}
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <strong>Ошибка:</strong> {error}
          </div>
        )}
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileLoad(file)
        }}
        style={{ display: 'none' }}
      />
    </Panel>
  )
}
```

**Файл:** `src/components/panels/CardDeckPanel/index.tsx`

```typescript
import React from 'react'
import { Panel } from '../Panel'
import { useAppStore, useSortedAndFilteredParagraphs } from '../../../store/appStore'

// Импортируем существующий CardList (ВРЕМЕННО для checkpoint 2-3)
import CardList from '../../CardView/CardList'

export const CardDeckPanel: React.FC = () => {
  const { 
    session,
    isSemanticAnalysisUpToDate,
    markSemanticsAsStale,
    handleSemanticRefreshSuccess,
    fontSize,
    fontFamily,
    signalMinColor,
    signalMaxColor,
    complexityMinColor,
    complexityMaxColor
  } = useAppStore()
  
  const sortedAndFilteredParagraphs = useSortedAndFilteredParagraphs()

  // Заглушка для paragraphRefs - будет реализовано в checkpoint 3
  const paragraphRefs = { current: {} }

  // Расчет globalRanges (из App.tsx)
  const globalRanges = React.useMemo(() => {
    if (!session || session.paragraphs.length === 0) {
      return { signalRange: { min: 0, max: 1 }, complexityRange: { min: 0, max: 1 } }
    }

    const signals = session.paragraphs
      .map(p => p.metrics.signal_strength || 0)
      .filter(s => typeof s === 'number' && !isNaN(s))
    
    const complexities = session.paragraphs
      .map(p => p.metrics.complexity || 0)
      .filter(c => typeof c === 'number' && !isNaN(c))

    return {
      signalRange: {
        min: signals.length > 0 ? Math.min(...signals) : 0,
        max: signals.length > 0 ? Math.max(...signals) || 1 : 1
      },
      complexityRange: {
        min: complexities.length > 0 ? Math.min(...complexities) : 0,
        max: complexities.length > 0 ? Math.max(...complexities) || 1 : 1
      }
    }
  }, [session])

  if (!session) {
    return (
      <Panel
        id="cards"
        title="Card Deck"
      >
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <p className="text-lg mb-2">No analysis available</p>
            <p className="text-sm">Analyze some text first</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      id="cards"
      title={`Card Deck (${sortedAndFilteredParagraphs.length})`}
    >
      <div className="h-full">
        {/* ВРЕМЕННО используем существующий CardList */}
        <CardList 
          key={session.metadata.session_id} 
          sessionData={session} 
          isSemanticAnalysisUpToDate={isSemanticAnalysisUpToDate}
          markSemanticsAsStale={markSemanticsAsStale}
          onSessionUpdate={handleSemanticRefreshSuccess}
          fontSize={fontSize}
          fontFamily={fontFamily}
          signalMinColor={signalMinColor}
          signalMaxColor={signalMaxColor}
          complexityMinColor={complexityMinColor}
          complexityMaxColor={complexityMaxColor}
          paragraphsToRender={sortedAndFilteredParagraphs}
          globalSignalRange={globalRanges.signalRange}
          globalComplexityRange={globalRanges.complexityRange}
          paragraphRefs={paragraphRefs}
        />
      </div>
    </Panel>
  )
}
```

**Файл:** `src/components/panels/SemanticMapPanel/index.tsx`

```typescript
import React from 'react'
import { Panel } from '../Panel'
import { useAppStore } from '../../../store/appStore'

export const SemanticMapPanel: React.FC = () => {
  const { session, selectedParagraphId } = useAppStore()

  const headerControls = (
    <div className="space-y-2 text-xs">
      <p>Settings placeholder</p>
      <p>Node size, colors, etc.</p>
    </div>
  )

  if (!session) {
    return (
      <Panel
        id="semantic-map"
        title="Semantic Map"
        headerControls={headerControls}
      >
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <p className="text-2xl mb-2">🧠</p>
            <p className="text-sm">Semantic map will appear here</p>
            <p className="text-xs text-gray-400 mt-1">After text analysis</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      id="semantic-map"
      title="Semantic Map"
      headerControls={headerControls}
    >
      <div className="h-full flex flex-col p-4">
        <div className="flex-1 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">🚧 Under Construction</p>
            <p className="text-sm">Semantic Linking Map</p>
```
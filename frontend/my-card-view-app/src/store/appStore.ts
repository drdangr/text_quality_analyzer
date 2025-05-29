import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import * as api from '../api'
import type { AnalysisResponse, ParagraphData } from '../components/CardView/types'

export type SortField = 'id' | 'signal_strength' | 'complexity' | 'semantic_function'
export type SortDirection = 'asc' | 'desc'

interface AppState {
  // === ДАННЫЕ СЕССИИ ===
  session: AnalysisResponse | null
  loading: boolean
  error: string | null
  isSemanticAnalysisUpToDate: boolean
  isBackendReady: boolean
  backendError: string | null

  // === ТЕКСТОВЫЙ РЕДАКТОР ===
  editorTopic: string
  editorText: string
  
  // === НАСТРОЙКИ ПАНЕЛЕЙ ===
  fontSize: number
  fontFamily: string
  signalMinColor: string
  signalMaxColor: string
  complexityMinColor: string
  complexityMaxColor: string
  
  // === ФИЛЬТРАЦИЯ И СОРТИРОВКА ===
  sortField: SortField
  sortDirection: SortDirection
  semanticFilter: string
  searchQuery: string

  // === СИНХРОНИЗАЦИЯ ПАНЕЛЕЙ ===
  selectedParagraphId: string | null
  hoveredParagraphId: string | null

  // === ПРОСТЫЕ SETTER ФУНКЦИИ ===
  setSession: (session: AnalysisResponse | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setEditorTopic: (topic: string) => void
  setEditorText: (text: string) => void

  // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
  handleAnalyzeText: (text: string, topic: string) => Promise<void>
  handleSemanticRefreshSuccess: (updatedSession: AnalysisResponse) => void
  markSemanticsAsStale: () => void
  
  // === РАБОТА С АБЗАЦАМИ ===
  updateParagraph: (id: number, text: string) => void
  addParagraph: (text: string, afterId?: number) => void
  deleteParagraph: (id: number) => void
  updateParagraphsFromText: (text: string) => void
  getVirtualText: () => string
  
  // === СИНХРОНИЗАЦИЯ ===
  setSelectedParagraph: (id: string | null) => void
  setHoveredParagraph: (id: string | null) => void
  scrollToCard: (paragraphId: number) => void

  // === НАСТРОЙКИ ===
  updateSettings: (settings: Partial<Pick<AppState, 'fontSize' | 'fontFamily' | 'signalMinColor' | 'signalMaxColor' | 'complexityMinColor' | 'complexityMaxColor'>>) => void
  updateFilters: (filters: Partial<Pick<AppState, 'sortField' | 'sortDirection' | 'semanticFilter' | 'searchQuery'>>) => void

  // === ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ===
  showEditorSettings: boolean
  setShowEditorSettings: (show: boolean) => void

  // === АНАЛИЗ МЕТРИК ===
  analyzeParagraphMetrics: (paragraphId: number, text: string) => Promise<void>
  analyzeParagraphMetricsQuietly: (paragraphId: number, text: string) => Promise<void>
  updateParagraphMetricsQuietly: (paragraphId: number, metrics: any) => void
  analyzeFullText: (text?: string) => Promise<void>
}

// Константы по умолчанию
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"
const DEFAULT_COMPLEXITY_MIN_COLOR = "#00FF00"
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"
const DEFAULT_FONT_FAMILY = "Arial, sans-serif"

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      return {
        // === НАЧАЛЬНОЕ СОСТОЯНИЕ ===
        session: null,
        loading: false,
        error: null,
        isSemanticAnalysisUpToDate: true,
        isBackendReady: true,
        backendError: null,
        editorTopic: '',
        editorText: '',
        showEditorSettings: false,

        // Настройки по умолчанию
        fontSize: 12,
        fontFamily: DEFAULT_FONT_FAMILY,
        signalMinColor: DEFAULT_SIGNAL_MIN_COLOR,
        signalMaxColor: DEFAULT_SIGNAL_MAX_COLOR,
        complexityMinColor: DEFAULT_COMPLEXITY_MIN_COLOR,
        complexityMaxColor: DEFAULT_COMPLEXITY_MAX_COLOR,
        
        sortField: 'id',
        sortDirection: 'asc',
        semanticFilter: 'all',
        searchQuery: '',
        
        selectedParagraphId: null,
        hoveredParagraphId: null,

        // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
        handleAnalyzeText: async (text: string, topic: string) => {
          console.log('🔄 Store handleAnalyzeText started', { text: text.substring(0, 50) + '...', topic })
          set({ loading: true, error: null, isSemanticAnalysisUpToDate: false })
          
          try {
            console.log('📡 Calling api.initializeAnalysis...')
            const analysisSessionData = await api.initializeAnalysis(text, topic)
            console.log('📡 api.initializeAnalysis response:', analysisSessionData)
            
            set({
              session: analysisSessionData,
              editorTopic: analysisSessionData.metadata.topic,
              editorText: text,
              isSemanticAnalysisUpToDate: true,
              loading: false
            })

            document.title = analysisSessionData.metadata.topic || "Анализ текста"
            window.history.pushState({}, '', `?session_id=${analysisSessionData.metadata.session_id}`)
            console.log('✅ Store handleAnalyzeText completed successfully')

          } catch (err) {
            console.error('❌ Store handleAnalyzeText error:', err)
            set({ 
              error: err instanceof Error ? err.message : 'Ошибка при анализе текста',
              loading: false 
            })
          }
        },

        handleSemanticRefreshSuccess: (updatedSession) => {
          set({
            session: updatedSession,
            editorText: updatedSession.paragraphs.map(p => p.text).join('\n\n'),
            isSemanticAnalysisUpToDate: true
          })
          document.title = updatedSession.metadata.topic || "Анализ текста (обновлено)"
        },

        markSemanticsAsStale: () => set({ isSemanticAnalysisUpToDate: false }),

        // === РАБОТА С АБЗАЦАМИ ===
        updateParagraph: (id: number, text: string) => {
          const state = get()
          if (!state.session) return

          console.log('📝 Обновление абзаца:', { id, text: text.substring(0, 50) + '...' })
          
          const updatedParagraphs = state.session.paragraphs.map(p => 
            p.id === id ? { ...p, text } : p
          )

          const newSession = {
            ...state.session,
            paragraphs: updatedParagraphs
          }

          // Обновляем только сессию - editorText будет синхронизирован через getVirtualText()
          set({
            session: newSession
          })
        },

        addParagraph: (text: string, afterId?: number) => {
          const state = get()
          if (!state.session) return

          console.log('➕ Добавление абзаца:', { text: text.substring(0, 50) + '...', afterId })
          
          // Находим максимальный ID для нового абзаца
          const maxId = Math.max(...state.session.paragraphs.map(p => p.id), 0)
          const newParagraph: ParagraphData = {
            id: maxId + 1,
            text,
            metrics: {
              signal_strength: 0,
              complexity: 0,
              semantic_function: 'Не определено'
            }
          }

          let updatedParagraphs
          if (afterId !== undefined) {
            // Вставляем после указанного абзаца
            const insertIndex = state.session.paragraphs.findIndex(p => p.id === afterId) + 1
            updatedParagraphs = [
              ...state.session.paragraphs.slice(0, insertIndex),
              newParagraph,
              ...state.session.paragraphs.slice(insertIndex)
            ]
          } else {
            // Добавляем в конец
            updatedParagraphs = [...state.session.paragraphs, newParagraph]
          }

          const newSession = {
            ...state.session,
            paragraphs: updatedParagraphs
          }

          // Обновляем только сессию
          set({
            session: newSession
          })
        },

        deleteParagraph: (id: number) => {
          const state = get()
          if (!state.session) return

          console.log('🗑️ Удаление абзаца:', { id })
          
          const updatedParagraphs = state.session.paragraphs.filter(p => p.id !== id)

          const newSession = {
            ...state.session,
            paragraphs: updatedParagraphs
          }

          // Обновляем только сессию
          set({
            session: newSession
          })
        },

        updateParagraphsFromText: (text: string) => {
          const state = get()
          
          // Всегда обновляем editorText (очистка уже произошла в TextEditorPanel)
          set({ editorText: text })
          
          if (!state.session) {
            return
          }

          // Улучшенная логика разбиения текста
          // Разбиваем по двойным переводам строк, но сохраняем пустые строки как разделители
          const paragraphTexts = text.split(/\n\s*\n/).filter(t => t.replace(/^\s+/, '')) // Фильтруем по содержимому без начальных пробелов
          const currentParagraphs = state.session.paragraphs
          
          // Создаем новый массив абзацев
          const updatedParagraphs: ParagraphData[] = []
          
          paragraphTexts.forEach((paragraphText, index) => {
            // Убираем пробелы только в начале, но сохраняем в конце
            const cleanText = paragraphText.replace(/^\s+/, '') // Убираем пробелы только в начале
            if (!cleanText) return // Пропускаем пустые абзацы
            
            if (currentParagraphs[index]) {
              // Обновляем существующий абзац
              updatedParagraphs.push({
                ...currentParagraphs[index],
                text: cleanText
              })
            } else {
              // Добавляем новый абзац
              const maxId = Math.max(...currentParagraphs.map(p => p.id), 0, ...updatedParagraphs.map(p => p.id))
              updatedParagraphs.push({
                id: maxId + 1,
                text: cleanText,
                metrics: {
                  signal_strength: 0,
                  complexity: 0,
                  semantic_function: 'Не определено'
                }
              })
            }
          })

          // Если абзацев стало меньше, сохраняем только нужное количество
          const finalParagraphs = updatedParagraphs.slice(0, paragraphTexts.length)

          set({
            session: {
              ...state.session,
              paragraphs: finalParagraphs
            }
          })
        },

        getVirtualText: () => {
          const state = get()
          
          // Если нет сессии, возвращаем editorText
          if (!state.session || state.session.paragraphs.length === 0) {
            return state.editorText
          }
          
          // Если есть сессия и editorText пустой, возвращаем текст из абзацев
          if (!state.editorText.trim()) {
            return state.session.paragraphs
              .map(p => p.text)
              .join('\n\n')
          }
          
          // Во время редактирования возвращаем editorText (для предотвращения сброса курсора)
          return state.editorText
        },

        // === СИНХРОНИЗАЦИЯ ПАНЕЛЕЙ ===
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
        },

        // === НАСТРОЙКИ ===
        updateSettings: (settings) => {
          set((state) => ({ ...state, ...settings }))
        },

        updateFilters: (filters) => {
          set((state) => ({ ...state, ...filters }))
        },

        // === ПРОСТЫЕ SETTER ФУНКЦИИ ===
        setSession: (session) => set({ session }),
        setLoading: (loading) => set({ loading }),
        setError: (error) => set({ error }),
        setEditorTopic: (topic) => set({ editorTopic: topic }),
        setEditorText: (text: string) => set({ editorText: text }),

        // === ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ===
        setShowEditorSettings: (show: boolean) => set({ showEditorSettings: show }),

        // === АНАЛИЗ МЕТРИК ===
        analyzeParagraphMetrics: async (paragraphId: number, text: string) => {
          const state = get()
          if (!state.session) {
            console.warn('⚠️ Нет активной сессии для анализа абзаца')
            return
          }

          const startTime = performance.now()
          console.log(`🔄 Анализ метрик абзаца ${paragraphId} (${text.length} символов)`)
          console.log(`📝 Текст для анализа: "${text.substring(0, 100)}..."`)
          
          try {
            // Вызываем API для расчета метрик одного абзаца
            const metrics = await api.calculateParagraphMetrics(
              state.session.metadata.session_id,
              paragraphId,
              text
            )
            
            const endTime = performance.now()
            const duration = endTime - startTime
            console.log(`✅ Метрики абзаца ${paragraphId} получены за ${duration.toFixed(2)}мс:`, metrics)
            
            // Обновляем ТОЛЬКО метрики абзаца в сессии (НЕ текст!)
            const updatedParagraphs = state.session.paragraphs.map(p => 
              p.id === paragraphId 
                ? { ...p, metrics: { ...p.metrics, ...metrics } }  // Убрал text - обновляем только метрики
                : p
            )

            console.log(`🔄 Обновление метрик в store для абзаца ${paragraphId}`)
            console.log(`📊 Старые метрики:`, state.session.paragraphs.find(p => p.id === paragraphId)?.metrics)
            console.log(`📊 Новые метрики:`, metrics)

            set({
              session: {
                ...state.session,
                paragraphs: updatedParagraphs
              }
            })
            
            console.log(`✅ Метрики абзаца ${paragraphId} обновлены в store`)
            
          } catch (error) {
            const endTime = performance.now()
            const duration = endTime - startTime
            console.error(`❌ Ошибка при анализе метрик абзаца ${paragraphId} (${duration.toFixed(2)}мс):`, error)
            // Не показываем ошибку пользователю для фонового анализа
          }
        },

        analyzeParagraphMetricsQuietly: async (paragraphId: number, text: string) => {
          const state = get()
          if (!state.session) {
            console.warn('⚠️ Нет активной сессии для тихого анализа абзаца')
            return
          }

          const startTime = performance.now()
          console.log(`🔇 Тихий анализ метрик абзаца ${paragraphId} (${text.length} символов)`)
          
          try {
            // Вызываем API для расчета метрик одного абзаца
            const metrics = await api.calculateParagraphMetrics(
              state.session.metadata.session_id,
              paragraphId,
              text
            )
            
            const endTime = performance.now()
            const duration = endTime - startTime
            console.log(`✅ Тихие метрики абзаца ${paragraphId} получены за ${duration.toFixed(2)}мс:`, metrics)
            
            // Используем тихое обновление метрик (без перерендера textarea)
            state.updateParagraphMetricsQuietly(paragraphId, metrics)
            
          } catch (error) {
            const endTime = performance.now()
            const duration = endTime - startTime
            console.error(`❌ Ошибка при тихом анализе метрик абзаца ${paragraphId} (${duration.toFixed(2)}мс):`, error)
            // Не показываем ошибку пользователю для тихого анализа
          }
        },

        updateParagraphMetricsQuietly: (paragraphId: number, metrics: any) => {
          const state = get()
          if (!state.session) return

          console.log(`🔇 Тихое обновление метрик абзаца ${paragraphId}:`, metrics)
          
          // Находим абзац и обновляем только его метрики напрямую
          const paragraph = state.session.paragraphs.find(p => p.id === paragraphId)
          if (paragraph) {
            // Обновляем метрики напрямую в объекте (мутация)
            Object.assign(paragraph.metrics, metrics)
            
            // Принудительно обновляем только компоненты карточек, не textarea
            // Используем минимальное обновление состояния
            set((prevState) => ({
              ...prevState,
              // Создаем новую ссылку на сессию для React, но сохраняем ту же структуру
              session: { ...prevState.session! }
            }))
          }
        },

        analyzeFullText: async (text?: string) => {
          const state = get()
          
          // Используем переданный текст или получаем из виртуального редактора
          const textToAnalyze = text || state.getVirtualText()
          
          if (!textToAnalyze.trim() || !state.editorTopic.trim()) {
            console.warn('⚠️ Нет текста или темы для полного анализа')
            return
          }
          
          console.log('🔄 Полный анализ текста')
          
          try {
            // Используем существующую функцию полного анализа
            await state.handleAnalyzeText(textToAnalyze, state.editorTopic)
            console.log('✅ Полный анализ завершен')
          } catch (error) {
            console.error('❌ Ошибка при полном анализе:', error)
            set({ 
              error: error instanceof Error ? error.message : 'Ошибка при анализе текста'
            })
          }
        },
      }
    }),
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
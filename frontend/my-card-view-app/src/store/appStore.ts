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
  editorFullText: string
  editorTopic: string

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
  setEditorFullText: (text: string) => void
  setEditorTopic: (topic: string) => void

  // === ОСНОВНЫЕ ДЕЙСТВИЯ ===
  handleAnalyzeText: (text: string, topic: string) => Promise<void>
  handleSemanticRefreshSuccess: (updatedSession: AnalysisResponse) => void
  markSemanticsAsStale: () => void
  
  // === СИНХРОНИЗАЦИЯ ===
  setSelectedParagraph: (id: string | null) => void
  setHoveredParagraph: (id: string | null) => void
  scrollToCard: (paragraphId: number) => void

  // === НАСТРОЙКИ ===
  updateSettings: (settings: Partial<Pick<AppState, 'fontSize' | 'fontFamily' | 'signalMinColor' | 'signalMaxColor' | 'complexityMinColor' | 'complexityMaxColor'>>) => void
  updateFilters: (filters: Partial<Pick<AppState, 'sortField' | 'sortDirection' | 'semanticFilter' | 'searchQuery'>>) => void
}

// Константы по умолчанию
const DEFAULT_SIGNAL_MIN_COLOR = "#FFFFFF"
const DEFAULT_SIGNAL_MAX_COLOR = "#FFDB58"
const DEFAULT_COMPLEXITY_MIN_COLOR = "#00FF00"
const DEFAULT_COMPLEXITY_MAX_COLOR = "#FF0000"
const DEFAULT_FONT_FAMILY = "Arial, sans-serif"

// Вспомогательная функция для точного расчёта offsetTop относительно контейнера
function getRelativeOffsetTop(element: HTMLElement, container: HTMLElement): number {
  let offset = 0
  let el: HTMLElement | null = element
  while (el && el !== container) {
    offset += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  return offset
}

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set) => ({
      // === НАЧАЛЬНОЕ СОСТОЯНИЕ ===
      session: null,
      loading: false,
      error: null,
      isSemanticAnalysisUpToDate: true,
      isBackendReady: true,
      backendError: null,
      editorFullText: '',
      editorTopic: '',
      
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
            editorFullText: text,
            editorTopic: analysisSessionData.metadata.topic,
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
          isSemanticAnalysisUpToDate: true
        })
        document.title = updatedSession.metadata.topic || "Анализ текста (обновлено)"
      },

      markSemanticsAsStale: () => set({ isSemanticAnalysisUpToDate: false }),

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
      setEditorFullText: (text) => set({ editorFullText: text }),
      setEditorTopic: (topic) => set({ editorTopic: topic })
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
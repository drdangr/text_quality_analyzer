import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { TextEditorPanelV2 } from './components/panels/TextEditorPanel/TextEditorPanelV2'
import { CardDeckPanelV2 } from './components/panels/CardDeckPanel/CardDeckPanelV2'
import { SemanticMapPanel } from './components/panels/SemanticMapPanel'
import { PanelResizer } from './components/panels/PanelResizer'
import { TestChunks } from './components/TestChunks'
import { useDocumentStore } from './store/documentStore'
import './App.css'

// Константы для панелей
const PANEL_COUNT = 3
const COLLAPSED_PANEL_WIDTH = 48
const RESIZER_WIDTH = 4

function App() {
  // Проверяем URL для тестового режима
  const isTestMode = window.location.pathname === '/test-chunks' || window.location.search.includes('test=chunks');
  
  // Если тестовый режим, показываем соответствующий тестовый компонент
  if (isTestMode) {
    return <TestChunks />;
  }

  // Состояние flex-весов панелей (вместо абсолютных ширин)
  const [panelFlexWeights, setPanelFlexWeights] = useState({
    editor: 1,
    cards: 1,
    semantic: 1
  })

  // Состояние свернутых панелей
  const [collapsedPanels, setCollapsedPanels] = useState({
    editor: false,
    cards: false,
    semantic: false
  })

  // Сохраненные flex-веса панелей перед сворачиванием
  const [savedPanelFlexWeights, setSavedPanelFlexWeights] = useState({
    editor: 1,
    cards: 1,
    semantic: 1
  })

  const { 
    document,
    loading, 
    error
  } = useDocumentStore()

  // Функции для изменения размера панелей
  const handleEditorResize = (delta: number) => {
    // Конвертируем пиксельную дельту в относительное изменение flex-веса
    const containerWidth = window.innerWidth - (PANEL_COUNT - 1) * RESIZER_WIDTH
    const deltaRatio = delta / containerWidth * 2 // умножаем на 2 для более чувствительного изменения
    
    setPanelFlexWeights(prev => ({
      ...prev,
      editor: Math.max(0.2, prev.editor + deltaRatio),
      cards: Math.max(0.2, prev.cards - deltaRatio)
    }))
  }

  const handleCardsResize = (delta: number) => {
    // Конвертируем пиксельную дельту в относительное изменение flex-веса
    const containerWidth = window.innerWidth - (PANEL_COUNT - 1) * RESIZER_WIDTH
    const deltaRatio = delta / containerWidth * 2 // умножаем на 2 для более чувствительного изменения
    
    setPanelFlexWeights(prev => ({
      ...prev,
      cards: Math.max(0.2, prev.cards + deltaRatio),
      semantic: Math.max(0.2, prev.semantic - deltaRatio)
    }))
  }

  // Функции для переключения состояния панелей
  const togglePanel = (panelId: 'editor' | 'cards' | 'semantic') => {
    const isCurrentlyCollapsed = collapsedPanels[panelId]
    
    if (isCurrentlyCollapsed) {
      // Разворачиваем панель - восстанавливаем её сохраненный flex-вес
      setSavedPanelFlexWeights(prev => ({
        ...prev,
        [panelId]: savedPanelFlexWeights[panelId]
      }))
      
      setPanelFlexWeights(prev => ({
        ...prev,
        [panelId]: savedPanelFlexWeights[panelId]
      }))
    } else {
      // Сворачиваем панель - сохраняем её текущий flex-вес
      setSavedPanelFlexWeights(prev => ({
        ...prev,
        [panelId]: panelFlexWeights[panelId]
      }))
    }
    
    // Переключаем состояние панели
    setCollapsedPanels(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }))
  }

  // Универсальная функция для получения стилей панели
  const getPanelStyle = (panelKey: keyof typeof collapsedPanels) => {
    const isCollapsed = collapsedPanels[panelKey]
    
    const baseStyle = {
      display: 'flex',
      flexDirection: 'column' as const,
      transition: 'all 0.3s ease'
    }
    
    if (isCollapsed) {
      return {
        ...baseStyle,
        width: `${COLLAPSED_PANEL_WIDTH}px`,
        flex: 0,
        minWidth: `${COLLAPSED_PANEL_WIDTH}px`,
        maxWidth: `${COLLAPSED_PANEL_WIDTH}px`,
      }
    }
    
    // Для развернутых панелей используем flex-вес из состояния
    return {
      ...baseStyle,
      flex: panelFlexWeights[panelKey],
      minWidth: '200px',
      width: 'auto'
    }
  }

  // Пересчет при изменении размера окна (flex-веса остаются прежними)
  useEffect(() => {
    const handleResize = () => {
      // С flex-системой не нужно пересчитывать веса при изменении размера окна
      // Flex автоматически адаптируется к новому размеру контейнера
      console.log('🔄 Размер окна изменен, flex-веса остаются прежними')
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (loading && !document) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      height: '100vh', 
      backgroundColor: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column' 
    }}>
      {/* Global Header */}
      <header style={{
        backgroundColor: 'white',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 24px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ 
              fontSize: '1.25rem', 
              fontWeight: 600, 
              color: '#1f2937',
              margin: 0 
            }}>
              {document?.metadata.topic || 'Анализатор текста'}
            </h1>
            {document && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.875rem', color: '#6b7280' }}>
                <span style={{ 
                  padding: '2px 8px', 
                  backgroundColor: '#f3f4f6', 
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  🧩 {document.chunks.length} чанков
                </span>
                <span style={{ 
                  padding: '2px 8px', 
                  backgroundColor: '#f0f9ff', 
                  borderRadius: '4px',
                  color: '#0369a1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  📄 {document.text.length} символов
                </span>
                <span style={{ 
                  padding: '2px 8px', 
                  backgroundColor: '#f0fdf4', 
                  borderRadius: '4px',
                  color: '#16a34a'
                }}>
                  📊 V{document.version}
                </span>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {error && (
              <div style={{ 
                color: '#dc2626', 
                fontSize: '0.875rem', 
                maxWidth: '24rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                Ошибка: {error}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Panels Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        width: '100%',
        minHeight: 0,
        alignItems: 'stretch'
      }}>
        {/* Text Editor Panel */}
        <div style={getPanelStyle('editor')}>
          <TextEditorPanelV2 
            icon="🧩" 
            isExpanded={!collapsedPanels.editor}
            onToggleExpanded={() => togglePanel('editor')}
          />
        </div>

        {/* Resizer 1 - между editor и cards */}
        {!collapsedPanels.editor && !collapsedPanels.cards && (
          <PanelResizer onResize={handleEditorResize} />
        )}

        {/* Cards Panel */}
        <div style={getPanelStyle('cards')}>
          <CardDeckPanelV2 
            icon="🃏" 
            isExpanded={!collapsedPanels.cards}
            onToggleExpanded={() => togglePanel('cards')}
          />
        </div>

        {/* Resizer 2 - между cards и semantic */}
        {!collapsedPanels.cards && !collapsedPanels.semantic && (
          <PanelResizer onResize={handleCardsResize} />
        )}

        {/* Semantic Map Panel */}
        <div style={getPanelStyle('semantic')}>
          <SemanticMapPanel 
            icon="🧠" 
            isExpanded={!collapsedPanels.semantic}
            onToggleExpanded={() => togglePanel('semantic')}
          />
        </div>
      </div>

      {/* Toast Notifications */}
      <Toaster 
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: '14px',
          }
        }}
      />
    </div>
  )
}

export default App 
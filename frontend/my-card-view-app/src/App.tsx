import React from 'react';
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { TextEditorPanelV2 } from './components/panels/TextEditorPanel/TextEditorPanelV2'
import { CardDeckPanelV2 } from './components/panels/CardDeckPanel/CardDeckPanelV2'
import { SemanticMapPanel } from './components/panels/SemanticMapPanel'
import { PanelResizer } from './components/panels/PanelResizer'
import { TestChunks } from './components/TestChunks'
import { useDocumentStore } from './store/documentStore'
import './App.css'
import { SemanticUpdateType } from './types/chunks'
import type { SemanticAnalysisProgress } from './types/chunks'

// Константы для панелей
const PANEL_COUNT = 3
const COLLAPSED_PANEL_WIDTH = 48
const RESIZER_WIDTH = 4

// Компонент метрик документа для шапки
const DocumentMetrics: React.FC<{
  document: any
  progress?: SemanticAnalysisProgress
}> = ({ document, progress }) => {
  if (!document?.chunks) return null

  // Вычисляем средние значения метрик
  const chunks = document.chunks
  const validSignalChunks = chunks.filter((c: any) => c.metrics.signal_strength !== undefined && c.metrics.signal_strength !== null)
  const validComplexityChunks = chunks.filter((c: any) => c.metrics.complexity !== undefined && c.metrics.complexity !== null)
  
  const avgSignal = validSignalChunks.length > 0 
    ? validSignalChunks.reduce((sum: number, c: any) => sum + c.metrics.signal_strength, 0) / validSignalChunks.length
    : 0

  const avgComplexity = validComplexityChunks.length > 0
    ? validComplexityChunks.reduce((sum: number, c: any) => sum + c.metrics.complexity, 0) / validComplexityChunks.length
    : 0

  // Примерное время чтения (средняя скорость чтения 200 слов в минуту)
  const wordCount = document.text.split(/\s+/).filter((word: string) => word.length > 0).length
  const readingTimeMinutes = Math.ceil(wordCount / 200)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '24px',
      fontSize: '13px',
      color: '#64748b'
    }}>
      {/* Основные метрики */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🎯</span>
          <span style={{ 
            fontWeight: '600',
            color: avgSignal > 0.7 ? '#059669' : avgSignal > 0.5 ? '#d97706' : '#dc2626'
          }}>
            {avgSignal.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🧠</span>
          <span style={{ 
            fontWeight: '600',
            color: avgComplexity < 0.3 ? '#059669' : avgComplexity < 0.7 ? '#d97706' : '#dc2626'
          }}>
            {avgComplexity.toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>⏱️</span>
          <span style={{ fontWeight: '600', color: '#1e40af' }}>
            ~{readingTimeMinutes} мин
          </span>
        </div>
      </div>

      {/* Статистика документа */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>📝 {wordCount} слов</span>
        <span>🧩 {chunks.length} чанков</span>
        <span>📄 {document.text.length} символов</span>
      </div>
    </div>
  )
}

// Компонент прогресс-бара семантического анализа
const SemanticAnalysisProgressBar: React.FC<{
  progress: SemanticAnalysisProgress
}> = ({ progress }) => {
  console.log('🎨 SemanticAnalysisProgressBar render:', { 
    progress,
    isActive: progress?.isActive,
    processedChunks: progress?.processedChunks,
    totalChunks: progress?.totalChunks
  });

  if (!progress || !progress.isActive) {
    console.log('🎨 Прогресс-бар скрыт: progress =', progress);
    return null;
  }

  const percentage = progress.totalChunks > 0 
    ? Math.round((progress.processedChunks / progress.totalChunks) * 100)
    : 0

  const elapsedTime = Date.now() - progress.startTime
  const avgTimePerChunk = progress.processedChunks > 0 ? elapsedTime / progress.processedChunks : 0
  const remainingChunks = progress.totalChunks - progress.processedChunks
  const estimatedTimeRemaining = Math.round((remainingChunks * avgTimePerChunk) / 1000)

  const isGlobal = progress.type === SemanticUpdateType.GLOBAL

  console.log('🎨 Прогресс-бар отображается:', {
    percentage,
    isGlobal,
    processedChunks: progress.processedChunks,
    totalChunks: progress.totalChunks,
    estimatedTimeRemaining
  });

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '3px',
      backgroundColor: '#f1f5f9',
      borderRadius: '0 0 6px 6px',
      overflow: 'hidden'
    }}>
      <div style={{
        height: '100%',
        width: `${percentage}%`,
        backgroundColor: isGlobal ? '#ef4444' : '#3b82f6',
        transition: 'width 0.3s ease',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute',
          top: '-24px',
          right: '8px',
          fontSize: '11px',
          color: isGlobal ? '#dc2626' : '#1e40af',
          fontWeight: '600',
          backgroundColor: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          border: `1px solid ${isGlobal ? '#fecaca' : '#dbeafe'}`,
          whiteSpace: 'nowrap'
        }}>
          {isGlobal ? '🌍 Глобальный' : '🎯 Локальный'} анализ: {progress.processedChunks}/{progress.totalChunks}
          {estimatedTimeRemaining > 0 && ` • ~${estimatedTimeRemaining}с`}
        </div>
      </div>
    </div>
  )
}

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
    error, 
    semanticProgress
  } = useDocumentStore()

  // Отладка состояния semanticProgress
  console.log('🎯 App render - semanticProgress состояние:', {
    semanticProgress,
    hasProgress: !!semanticProgress,
    isActive: semanticProgress?.isActive,
    processedChunks: semanticProgress?.processedChunks,
    totalChunks: semanticProgress?.totalChunks
  });

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
        flexShrink: 0,
        position: 'relative'
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
            
            {/* Интегрированные метрики документа */}
            {document && (
              <DocumentMetrics 
                document={document}
              />
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
        
        {/* Прогресс-бар семантического анализа */}
        {semanticProgress && (
          <SemanticAnalysisProgressBar progress={semanticProgress} />
        )}
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
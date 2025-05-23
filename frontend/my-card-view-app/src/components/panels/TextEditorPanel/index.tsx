import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Panel } from '../Panel'
import { useAppStore } from '../../../store/appStore'
import { useClipboard, useFileDrop } from '../../../hooks/usePanelSync'

interface TextEditorPanelProps {
  icon?: string
  isExpanded?: boolean
  onToggleExpanded?: () => void
}

export const TextEditorPanel: React.FC<TextEditorPanelProps> = ({ 
  icon, 
  isExpanded, 
  onToggleExpanded 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [showTopicHint, setShowTopicHint] = useState<boolean>(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<number | null>(null)
  
  const { 
    editorFullText,
    editorTopic,
    loading,
    error,
    isBackendReady,
    backendError,
    handleAnalyzeText,
    setEditorFullText,
    setEditorTopic,
    editingState,
    startEditing,
    updateEditingText,
    finishEditing,
    showEditorSettings,
    setShowEditorSettings
  } = useAppStore()
  
  const { pasteFromClipboard } = useClipboard()
  const { handleDrop } = useFileDrop()

  useEffect(() => {
    if (editorFullText && editingState.mode === 'none') {
      startEditing('text-editor');
    }
  }, [editorFullText, editingState.mode, startEditing]);

  useEffect(() => {
    if (showEditorSettings && !isExpanded) {
      onToggleExpanded?.();
    }
  }, [showEditorSettings, isExpanded, onToggleExpanded]);

  const handleTextChange = useCallback((newText: string) => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
    
    if (editingState.mode === 'none') {
      startEditing('text-editor');
    }
    updateEditingText(newText);
  }, [editingState.mode, startEditing, updateEditingText]);

  useEffect(() => {
    if (textareaRef.current && cursorPosition !== null) {
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      setCursorPosition(null);
    }
  }, [editingState.text, cursorPosition]);

  const handleAnalyze = useCallback(async () => {
    if (!editingState.text.trim() || !editorTopic.trim()) {
      if (editingState.text.trim() && !editorTopic.trim()) {
        setShowTopicHint(true)
        setTimeout(() => setShowTopicHint(false), 3000)
      }
      return
    }
    
    try {
      await finishEditing();
      await handleAnalyzeText(editingState.text, editorTopic)
    } catch (error) {
      console.error('❌ Analysis failed:', error)
    }
  }, [editingState.text, editorTopic, finishEditing, handleAnalyzeText])

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
        handleTextChange(text)
      }
    } catch (error) {
      setFileError('Ошибка при чтении файла')
    }
  }, [handleDrop, handleTextChange])

  const handlePaste = useCallback(async () => {
    const text = await pasteFromClipboard()
    if (text) {
      handleTextChange(text)
    }
  }, [pasteFromClipboard, handleTextChange])

  const headerControls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || !isBackendReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: (loading || !isBackendReady) ? 0.5 : 1,
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={e => !loading && isBackendReady && ((e.target as HTMLButtonElement).style.backgroundColor = '#dbeafe')}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#eff6ff'}
        >
          📁 Загрузить файл
        </button>
        <button
          onClick={handlePaste}
          disabled={loading || !isBackendReady}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: '#f0fdf4',
            color: '#15803d',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: (loading || !isBackendReady) ? 0.5 : 1,
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={e => !loading && isBackendReady && ((e.target as HTMLButtonElement).style.backgroundColor = '#dcfce7')}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#f0fdf4'}
        >
          📋 Вставить
        </button>
      </div>
      <button
        onClick={handleAnalyze}
        disabled={loading || !isBackendReady || !editingState.text.trim()}
        style={{
          padding: '8px 16px',
          backgroundColor: '#7c3aed',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          width: '100%',
          opacity: (loading || !isBackendReady || !editingState.text.trim()) ? 0.5 : 1,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={e => {
          const disabled = loading || !isBackendReady || !editingState.text.trim()
          if (!disabled) (e.target as HTMLButtonElement).style.backgroundColor = '#6d28d9'
        }}
        onMouseLeave={e => (e.target as HTMLButtonElement).style.backgroundColor = '#7c3aed'}
      >
        {loading ? 'Анализ...' : '▶️ Анализировать текст'}
      </button>
    </div>
  )

  const headerButtons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          padding: '4px',
          backgroundColor: showSettings ? '#e0e7ff' : 'transparent',
          color: showSettings ? '#4338ca' : '#666',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => {
          if (!showSettings) e.currentTarget.style.backgroundColor = '#f5f5f5'
        }}
        onMouseOut={(e) => {
          if (!showSettings) e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title="Настройки"
      >
        ⚙️
      </button>
    </div>
  )

  return (
    <Panel
      id="editor"
      title="Текстовый редактор"
      headerControls={headerControls}
      headerButtons={headerButtons}
      icon={icon}
      isExpanded={isExpanded}
      onToggleExpanded={onToggleExpanded}
      showSettings={showEditorSettings}
      onToggleSettings={() => setShowEditorSettings(!showEditorSettings)}
    >
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '16px'
      }}>
        <div style={{ 
          flexShrink: 0,
          marginBottom: '16px',
          position: 'relative'
        }}>
          <label style={{ 
            display: 'block', 
            fontSize: '14px', 
            fontWeight: '500', 
            color: '#374151', 
            marginBottom: '4px' 
          }}>
            Тема
          </label>
          <input
            type="text"
            value={editorTopic}
            onChange={(e) => {
              setEditorTopic(e.target.value)
              if (showTopicHint) setShowTopicHint(false)
            }}
            disabled={loading}
            placeholder="Введите тему документа..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: showTopicHint ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
              backgroundColor: loading ? '#f9fafb' : 'white'
            }}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = showTopicHint ? '#ef4444' : '#d1d5db'}
          />
          
          {showTopicHint && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              right: '0',
              marginTop: '4px',
              padding: '8px 12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              animation: 'fadeInShake 0.5s ease-out',
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)'
            }}>
              <span>⚠️</span>
              <span>Пожалуйста, введите тему документа для анализа</span>
            </div>
          )}
        </div>

        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minHeight: '200px'
        }}>
          <textarea
            ref={textareaRef}
            value={editingState.mode === 'text-editor' ? editingState.text : editorFullText}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={loading}
            placeholder="Введите или вставьте текст здесь, или перетащите .txt файл..."
            style={{
              width: '100%',
              height: '100%',
              padding: '16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
              transition: 'border-color 0.2s',
              backgroundColor: loading ? '#f9fafb' : 'white',
              flex: 1,
              minHeight: 0
            }}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = '#d1d5db'}
          />
        </div>

        {fileError && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '6px', 
            color: '#dc2626',
            fontSize: '14px',
            flexShrink: 0,
            marginTop: '16px'
          }}>
            <strong>Файл:</strong> {fileError}
          </div>
        )}
        
        {!isBackendReady && backendError && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fffbeb', 
            border: '1px solid #fed7aa', 
            borderRadius: '6px', 
            color: '#d97706',
            fontSize: '14px',
            flexShrink: 0,
            marginTop: '16px'
          }}>
            <strong>Сервер:</strong> {backendError}
          </div>
        )}
        
        {error && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '6px', 
            color: '#dc2626',
            fontSize: '14px',
            flexShrink: 0,
            marginTop: '16px'
          }}>
            <strong>Ошибка:</strong> {error}
          </div>
        )}
      </div>
      
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
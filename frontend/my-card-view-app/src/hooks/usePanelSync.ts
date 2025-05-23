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
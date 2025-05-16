import type { Dispatch, SetStateAction } from 'react';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import DraggableCardList from './DraggableCardList';
import type { ParagraphData, AnalysisResponse } from './types';
import { 
    updateTextAndRestructureParagraph, 
    mergeParagraphs, 
    deleteParagraph 
} from '../../api';

export type SortField = 'id' | 'signal_strength' | 'complexity' | 'semantic_function';
export type SortDirection = 'asc' | 'desc';

// Константы для CardList больше не нужны здесь, они в App.tsx

export interface CardListProps { 
  // Данные сессии и для рендеринга списка
  sessionData: AnalysisResponse; // Приходит от App.tsx
  paragraphsToRender: ParagraphData[]; // Отсортированные/отфильтрованные параграфы из App.tsx
  paragraphRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>; // Ref для карточек из App.tsx
  
  // Функции обратного вызова для App.tsx
  onSessionUpdate: (updatedSession: AnalysisResponse) => void;
  markSemanticsAsStale: () => void; 

  // Пропсы UI, управляемые из App.tsx и передаваемые в Card/DraggableCardList
  fontSize: number;
  fontFamily: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  globalSignalRange: {min: number, max: number};
  globalComplexityRange: {min: number, max: number};
  isSemanticAnalysisUpToDate: boolean;
}

const CardList: React.FC<CardListProps> = ({ 
  sessionData, 
  paragraphsToRender,
  paragraphRefs,
  onSessionUpdate,
  markSemanticsAsStale, 
  fontSize,
  fontFamily,
  signalMinColor,
  signalMaxColor,
  complexityMinColor,
  complexityMaxColor,
  globalSignalRange,
  globalComplexityRange,
  isSemanticAnalysisUpToDate,
}) => {
  // Локальные состояния для взаимодействия с отдельными карточками
  const [editingParagraphId, setEditingParagraphId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [isMergingParagraphs, setIsMergingParagraphs] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const contentRef = useRef<HTMLDivElement>(null); 

  // Обработчики действий с карточками
  const handleStartEditing = (paragraph: ParagraphData) => {
    setEditingParagraphId(paragraph.id);
    setEditingText(paragraph.text);
    setCurrentError(null);
  };

  const handleCancelEditing = () => {
    setEditingParagraphId(null);
    setEditingText('');
  };

  const handleSaveEditing = async () => {
    if (editingParagraphId === null || !sessionData) return;
    setIsSaving(true);
    setCurrentError(null);
    try {
      const updatedApiSession = await updateTextAndRestructureParagraph(
        sessionData.metadata.session_id,
        editingParagraphId,
        editingText 
      );
      onSessionUpdate(updatedApiSession); 
      markSemanticsAsStale(); 
      setEditingParagraphId(null);
      setEditingText('');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при сохранении/удалении абзаца';
      setCurrentError(errorMsg);
      console.error('Save/Delete error:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMergeUp = async (index: number) => {
    if (index <= 0 || isMergingParagraphs || editingParagraphId !== null || !sessionData) return;
    const paragraphToMergeWith = paragraphsToRender[index - 1];
    const currentParagraph = paragraphsToRender[index];
    if (!paragraphToMergeWith || !currentParagraph) return; 
    setIsMergingParagraphs(true);
    setCurrentError(null);
    try {
      const updatedApiSession = await mergeParagraphs(
        sessionData.metadata.session_id,
        paragraphToMergeWith.id, 
        currentParagraph.id    
      );
      onSessionUpdate(updatedApiSession); 
      markSemanticsAsStale();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при слиянии абзацев';
      setCurrentError(errorMsg);
      console.error('Merge error:', e);
    } finally {
      setIsMergingParagraphs(false);
    }
  };

  const handleMergeDown = async (index: number) => {
    if (index >= paragraphsToRender.length - 1 || isMergingParagraphs || editingParagraphId !== null || !sessionData) return;
    const currentParagraph = paragraphsToRender[index];
    const nextParagraph = paragraphsToRender[index + 1];
    if (!currentParagraph || !nextParagraph) return;
    setIsMergingParagraphs(true);
    setCurrentError(null);
    try {
      const updatedApiSession = await mergeParagraphs(
        sessionData.metadata.session_id,
        currentParagraph.id, 
        nextParagraph.id 
      );
      onSessionUpdate(updatedApiSession);
      markSemanticsAsStale();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при слиянии абзацев';
      setCurrentError(errorMsg);
      console.error('Merge error:', e);
    } finally {
      setIsMergingParagraphs(false);
    }
  };

  const handleDeleteParagraph = async (paragraphId: number) => {
    if (!sessionData || isDeleting) return;
    const confirmDelete = window.confirm("Вы уверены, что хотите удалить этот абзац? Это действие необратимо.");
    if (!confirmDelete) return;
    setIsDeleting(true);
    setCurrentError(null);
    try {
      const updatedApiSession = await deleteParagraph(sessionData.metadata.session_id, paragraphId);
      onSessionUpdate(updatedApiSession);
      markSemanticsAsStale();
      if (editingParagraphId === paragraphId) {
        handleCancelEditing();
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ошибка при удалении абзаца';
      setCurrentError(errorMsg);
      console.error('Delete error:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // JSX панели управления, тепловой карты, строки статистики и поиска УДАЛЕНЫ

  return (
    // Обертка CardList теперь не нужна, если он только рендерит DraggableCardList
    // Но оставим ее для contentRef и возможного сообщения об ошибке
    <div ref={contentRef} style={{ paddingTop: '10px' }}>
      {currentError && (
        <div style={{ color: 'red', backgroundColor: '#ffe0e0', border: '1px solid red', padding: '10px', borderRadius: '4px', margin: '0 0 10px 0' }}>
          Ошибка: {currentError}
        </div>
      )}
      
      <DraggableCardList
        sessionData={sessionData} 
        paragraphsToRender={paragraphsToRender} 
        setParagraphsStateInCardList={(newParagraphsOrder) => {
          // Эта функция должна обновить порядок в session.paragraphs в App.tsx
          // Пока что это делается через onReorderComplete, который вызывает onSessionUpdate
          // Для чистого оптимистичного обновления нужно будет передать setSession из App.tsx или специфичный сеттер для paragraphs
          // Пока заглушка, т.к. основной ререндеринг произойдет после onReorderComplete
          console.log("DraggableCardList requests optimistic update (not fully implemented for direct paragraphs state change here yet)", newParagraphsOrder);
        }} 
        onReorderComplete={onSessionUpdate} 
        markSemanticsAsStale={markSemanticsAsStale}
        uiSignalMin={globalSignalRange.min}
        uiSignalMax={globalSignalRange.max}
        uiComplexityMin={globalComplexityRange.min}
        uiComplexityMax={globalComplexityRange.max}
        fontSize={`${fontSize}pt`}
        fontFamily={fontFamily}
        signalMinColor={signalMinColor}
        signalMaxColor={signalMaxColor}
        complexityMinColor={complexityMinColor}
        complexityMaxColor={complexityMaxColor}
        editingParagraphId={editingParagraphId}
        editingText={editingText}
        setEditingText={setEditingText}
        handleStartEditing={handleStartEditing}
        handleSaveEditing={handleSaveEditing} 
        handleCancelEditing={handleCancelEditing}
        isSaving={isSaving}
        handleMergeDown={handleMergeDown}
        onDeleteRequest={handleDeleteParagraph}
        paragraphRefs={paragraphRefs}
      />
    </div>
  );
};

export default CardList;
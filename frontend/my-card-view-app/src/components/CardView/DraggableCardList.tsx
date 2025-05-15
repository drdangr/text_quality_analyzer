import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Card from './Card';
import type { ParagraphData, AnalysisResponse } from './types';
import { reorderParagraphs, fetchAnalysis } from '../../api';

interface SortableCardProps {
  paragraph: ParagraphData;
  minSignal: number;
  maxSignal: number;
  minComplexity: number;
  maxComplexity: number;
  fontSize: string;
  fontFamily: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  isEditing: boolean;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEditing: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMergeDown: () => void;
  onDeleteRequest: (paragraphId: number) => void;
  paragraphRefs?: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
}

const SortableCard: React.FC<SortableCardProps> = ({ paragraph, onDeleteRequest, onSave, fontFamily, ...rest }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: paragraph.id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Создаем хук, чтобы перехватить onClick верхнего заголовка
  const dragHandleRef = React.useRef<HTMLDivElement>(null);

  // Записываем ссылку на DOM-элемент для скролла, если есть paragraphRefs
  const setCardRef = (element: HTMLDivElement) => {
    if (rest.paragraphRefs) {
      rest.paragraphRefs.current[paragraph.id] = element;
    }
    // Также устанавливаем ref для DnD
    setNodeRef(element);
  };

  return (
    <div ref={setCardRef} style={style} {...attributes}>
      <div style={{ position: 'relative', marginBottom: '1px' }}>
        <Card paragraph={paragraph} onDeleteRequest={onDeleteRequest} onSave={onSave} fontFamily={fontFamily} {...rest} />
        
        {/* Невидимая область для перетаскивания, покрывающая верхний заголовок */}
        <div 
          ref={dragHandleRef}
          {...listeners} 
          style={{ 
            position: 'absolute', 
            top: '0', 
            left: '0',
            right: '0',
            height: '28px', // Уменьшаем высоту в соответствии с высотой заголовка
            cursor: 'grab',
            zIndex: 10,
            pointerEvents: 'auto',
            opacity: 0 // Делаем область невидимой
          }}
        />

        {/* Видимая иконка перетаскивания, чтобы пользователь понимал, что можно перетаскивать */}
        <div 
          style={{ 
            position: 'absolute', 
            top: '8px', 
            left: '12px', 
            fontSize: '14px',
            lineHeight: '1',
            color: '#999',
            zIndex: 11, // На уровень выше, чем вся область, чтобы был виден
            pointerEvents: 'none', // Чтобы можно было кликать через иконку
            display: 'flex',
            alignItems: 'center',
            height: '14px'
          }}
        >
          ⋮⋮
        </div>
      </div>
    </div>
  );
};

interface DraggableCardListProps {
  sessionData: AnalysisResponse;
  paragraphs: ParagraphData[];
  setParagraphs: React.Dispatch<React.SetStateAction<ParagraphData[]>>;
  setSessionData: React.Dispatch<React.SetStateAction<AnalysisResponse>>;
  markSemanticsAsStale: () => void;
  // UI controls props
  uiSignalMin: number;
  uiSignalMax: number;
  uiComplexityMin: number;
  uiComplexityMax: number;
  fontSize: string;
  fontFamily: string;
  signalMinColor: string;
  signalMaxColor: string;
  complexityMinColor: string;
  complexityMaxColor: string;
  // editing props
  editingParagraphId: number | null;
  editingText: string;
  setEditingText: React.Dispatch<React.SetStateAction<string>>;
  handleStartEditing: (paragraph: ParagraphData) => void;
  handleSaveEditing: () => Promise<void>;
  handleCancelEditing: () => void;
  isSaving: boolean;
  // API callbacks for other operations
  handleMergeDown: (index: number) => Promise<void>;
  onDeleteRequest: (paragraphId: number) => void;
  // Other props
  sortedAndFilteredParagraphs: ParagraphData[];
  // Ref для элементов карточек для скролла
  paragraphRefs?: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
}

const DraggableCardList: React.FC<DraggableCardListProps> = ({
  sessionData,
  paragraphs,
  setParagraphs,
  setSessionData,
  markSemanticsAsStale,
  uiSignalMin,
  uiSignalMax,
  uiComplexityMin,
  uiComplexityMax,
  fontSize,
  fontFamily,
  signalMinColor,
  signalMaxColor,
  complexityMinColor,
  complexityMaxColor,
  editingParagraphId,
  editingText,
  setEditingText,
  handleStartEditing,
  handleSaveEditing,
  handleCancelEditing,
  isSaving,
  handleMergeDown,
  onDeleteRequest,
  sortedAndFilteredParagraphs,
  paragraphRefs,
}) => {
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState<boolean>(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Найдем индексы в отсортированном массиве
      const oldIndex = sortedAndFilteredParagraphs.findIndex(p => p.id.toString() === active.id);
      const newIndex = sortedAndFilteredParagraphs.findIndex(p => p.id.toString() === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        // Локально обновляем состояние для мгновенного отклика UI (временная визуализация)
        const newArray = arrayMove(sortedAndFilteredParagraphs, oldIndex, newIndex);
        
        // Отправляем запрос на бэкенд
        try {
          setIsReordering(true);
          // Создаем массив ID всех абзацев в новом порядке
          const newOrder = newArray.map(p => p.id);
          
          console.log("Отправка нового порядка на сервер:", newOrder);
          
          // Вызываем API для сохранения нового порядка
          const updatedSession = await reorderParagraphs(
            sessionData.metadata.session_id,
            newOrder
          );
          
          console.log("Получены обновленные данные с сервера:", updatedSession);
          
          // Обновляем данные сессии после успешного запроса
          setSessionData(updatedSession);
          
          // Важно! Полностью заменяем массив параграфов из обновленной сессии,
          // а не пытаемся обновлять существующий массив
          setParagraphs(updatedSession.paragraphs);
          
          markSemanticsAsStale();
          setCurrentError(null);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Ошибка при изменении порядка абзацев';
          setCurrentError(errorMsg);
          console.error('Reorder error:', e);
          
          // Восстанавливаем исходное состояние в случае ошибки
          // Запрашиваем актуальное состояние с сервера
          try {
            const refreshedSession = await fetchAnalysis(sessionData.metadata.session_id);
            setSessionData(refreshedSession);
            setParagraphs(refreshedSession.paragraphs);
          } catch (refreshError) {
            console.error('Error refreshing session data:', refreshError);
          }
        } finally {
          setIsReordering(false);
        }
      }
    }
  };

  return (
    <div>
      {currentError && (
        <div style={{ color: 'red', backgroundColor: '#ffe0e0', border: '1px solid red', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
          Ошибка: {currentError}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedAndFilteredParagraphs.map(p => p.id.toString())}
          strategy={verticalListSortingStrategy}
        >
          {sortedAndFilteredParagraphs.map((p, index) => (
            <SortableCard
              key={p.id}
              paragraph={p}
              minSignal={uiSignalMin}
              maxSignal={uiSignalMax}
              minComplexity={uiComplexityMin}
              maxComplexity={uiComplexityMax}
              fontSize={fontSize}
              fontFamily={fontFamily}
              signalMinColor={signalMinColor}
              signalMaxColor={signalMaxColor}
              complexityMinColor={complexityMinColor}
              complexityMaxColor={complexityMaxColor}
              isEditing={editingParagraphId === p.id}
              editingText={editingParagraphId === p.id ? editingText : ''}
              onEditingTextChange={setEditingText}
              onStartEditing={() => handleStartEditing(p)}
              onSave={handleSaveEditing}
              onCancel={handleCancelEditing}
              isSaving={isSaving}
              isFirst={index === 0}
              isLast={index === sortedAndFilteredParagraphs.length - 1}
              onMergeDown={() => handleMergeDown(index)}
              onDeleteRequest={onDeleteRequest}
              paragraphRefs={paragraphRefs}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default DraggableCardList; 
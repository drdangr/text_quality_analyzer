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

interface Item {
  id: string;
  content: string;
}

const SortableItem: React.FC<{ item: Item }> = ({ item }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: '1px solid #ccc',
    padding: '10px',
    margin: '10px 0',
    backgroundColor: 'white',
    borderRadius: '4px',
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {item.content}
    </div>
  );
};

export const DraggableExample: React.FC = () => {
  const [items, setItems] = useState<Item[]>([
    { id: '1', content: 'Параграф 1' },
    { id: '2', content: 'Параграф 2' },
    { id: '3', content: 'Параграф 3' },
    { id: '4', content: 'Параграф 4' },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div style={{ 
      width: '400px', 
      margin: '0 auto', 
      padding: '20px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px'
    }}>
      <h2>Пример перетаскивания с @dnd-kit</h2>
      <p>Перетащите параграфы для изменения их порядка</p>
      
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <SortableItem key={item.id} item={item} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default DraggableExample; 
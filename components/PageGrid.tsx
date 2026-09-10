import React, { useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { PDFPage, UploadedFile } from '../types';
import { usePdfStore } from '../store/usePdfStore';
import PageCard from './PageCard';

interface PageGridProps {
  pages: PDFPage[];
  fileMap: Map<string, UploadedFile>;
  selectedPageIds: Set<string>;
  onReorder: (newPages: PDFPage[]) => void;
  onRemovePage: (pageId: string) => void;
  onRotatePage: (pageId: string, direction: 'cw' | 'ccw') => void;
  onToggleSelect: (pageId: string, isMulti: boolean) => void;
  disabled?: boolean;
  selectionMode?: boolean;
}

const PageGrid: React.FC<PageGridProps> = ({ 
  pages, 
  fileMap, 
  selectedPageIds,
  onReorder, 
  onToggleSelect,
  disabled,
  selectionMode = false
}) => {
  const setPreviewPageId = usePdfStore(s => s.setPreviewPageId);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || disabled) return;

    const activeIndex = pages.findIndex(p => p.id === active.id);
    const overIndex = pages.findIndex(p => p.id === over.id);
    if (activeIndex === -1 || overIndex === -1) return;

    onReorder(arrayMove(pages, activeIndex, overIndex));
  }, [pages, onReorder, disabled]);

  const handleDragCancel = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handlePreview = useCallback((pageId: string) => {
    setPreviewPageId(pageId);
  }, [setPreviewPageId]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
        <div
          className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4 select-none rounded-md3 transition-colors duration-200 ${draggingId ? 'bg-primaryContainer/10' : ''}`}
        >
          {pages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              sourceFile={fileMap.get(page.fileId)}
              isSelected={selectedPageIds.has(page.id)}
              disabled={disabled}
              selectionMode={selectionMode}
              onToggleSelect={onToggleSelect}
              onPreview={handlePreview}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default React.memo(PageGrid);
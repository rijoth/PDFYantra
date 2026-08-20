import React, { useCallback } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
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

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(pages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onReorder(items);
  }, [pages, onReorder]);

  const handlePreview = useCallback((pageId: string) => {
    setPreviewPageId(pageId);
  }, [setPreviewPageId]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="pages-grid" direction="horizontal">
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4 select-none rounded-md3 transition-colors duration-200 ${snapshot.isDraggingOver ? 'bg-primaryContainer/10' : ''}`}
          >
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                sourceFile={fileMap.get(page.fileId)}
                isSelected={selectedPageIds.has(page.id)}
                disabled={disabled}
                selectionMode={selectionMode}
                onToggleSelect={onToggleSelect}
                onPreview={handlePreview}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default React.memo(PageGrid);
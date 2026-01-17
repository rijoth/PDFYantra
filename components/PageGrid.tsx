import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { PDFPage, UploadedFile } from '../types';
import { usePdfStore } from '../store/usePdfStore';

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
  const { setPreviewPageId } = usePdfStore();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(pages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onReorder(items);
  };

  return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="pages-grid" direction="horizontal">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4 select-none"
            >
              {pages.map((page, index) => {
                const sourceFile = fileMap.get(page.fileId);
                const isSelected = selectedPageIds.has(page.id);

                return (
                  <Draggable 
                    key={page.id} 
                    draggableId={page.id} 
                    index={index}
                    isDragDisabled={disabled}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={(e) => {
                            if (!disabled) {
                                // If selectionMode is strictly true, we force multi-select logic (toggle)
                                // Otherwise we check for modifier keys
                                const isMulti = selectionMode || e.shiftKey || e.metaKey || e.ctrlKey;
                                onToggleSelect(page.id, isMulti);
                            }
                        }}
                        className={`
                          relative group flex flex-col rounded-sm3 overflow-hidden transition-all duration-200 cursor-pointer
                          ${snapshot.isDragging ? 'shadow-elevation-3 scale-105 z-50' : ''}
                          ${isSelected ? 'ring-4 ring-secondaryContainer bg-secondaryContainer' : 'bg-surfaceVariant/20 border border-transparent'}
                        `}
                      >
                        {/* Selection Checkbox */}
                        <div 
                          className="absolute top-2 left-2 z-40 p-1 cursor-pointer hover:bg-black/10 rounded-full transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!disabled) onToggleSelect(page.id, true); // true = additive/toggle mode
                          }}
                        >
                           <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-primary border-primary scale-110' : 'bg-surface/60 border-onSurfaceVariant/40'}`}>
                             {isSelected && <i className="fa-solid fa-check text-onPrimary text-[10px]"></i>}
                           </div>
                        </div>

                        {/* Preview Button (Eye Icon) */}
                        <div 
                            className="absolute bottom-10 right-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPageId(page.id);
                            }}
                        >
                             <div className="w-8 h-8 rounded-full bg-surface/90 shadow-sm flex items-center justify-center text-onSurfaceVariant hover:text-primary hover:bg-white transition-colors" title="Quick Look">
                                <i className="fa-regular fa-eye"></i>
                             </div>
                        </div>

                        {/* Image Container */}
                        <div className={`aspect-[3/4] w-full relative overflow-hidden flex items-center justify-center p-3 transition-opacity ${isSelected ? 'opacity-80' : 'opacity-100'}`}>
                          <div 
                             className="relative w-full h-full flex items-center justify-center bg-white shadow-sm"
                             style={{ transform: `rotate(${page.rotation}deg)` }}
                          >
                            <img 
                                src={page.thumbnailUrl} 
                                alt={`Page ${page.pageNumber}`}
                                className="max-w-full max-h-full object-contain pointer-events-none"
                                loading="lazy"
                            />
                          </div>
                        </div>

                        {/* Page Number Label */}
                        <div className="py-2 text-center relative z-10 flex flex-col justify-center">
                            <span className={`text-xs font-medium ${isSelected ? 'text-onSecondaryContainer' : 'text-onSurfaceVariant'}`}>
                                {page.pageNumber}
                            </span>
                             {sourceFile && (
                                <div 
                                    className="absolute bottom-2 right-2 w-2 h-2 rounded-full"
                                    style={{ backgroundColor: sourceFile.color }}
                                ></div>
                            )}
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
  );
};

export default PageGrid;
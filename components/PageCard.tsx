import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PDFPage, UploadedFile } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faCheck } from '@fortawesome/free-solid-svg-icons';

interface PageCardProps {
  page: PDFPage;
  sourceFile?: UploadedFile;
  isSelected: boolean;
  disabled?: boolean;
  selectionMode?: boolean;
  onToggleSelect: (pageId: string, isMulti: boolean) => void;
  onPreview: (pageId: string) => void;
}

const PageCard: React.FC<PageCardProps> = ({
  page,
  sourceFile,
  isSelected,
  disabled,
  selectionMode,
  onToggleSelect,
  onPreview
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id, disabled });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform) ?? undefined,
        transition,
      }}
      onClick={(e) => {
        if (!disabled) {
          const isMulti = selectionMode || e.shiftKey || e.metaKey || e.ctrlKey;
          onToggleSelect(page.id, isMulti);
        }
      }}
      className={`relative group rounded-sm3 touch-manipulation ${isDragging ? 'z-50 cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div
        className={`
          relative flex flex-col rounded-sm3 overflow-hidden h-full
          transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out
          ${isDragging ? 'shadow-elevation-3 scale-[1.08] -rotate-[1.5deg]' : 'scale-100 rotate-0'}
          ${isSelected ? 'ring-4 ring-secondaryContainer bg-secondaryContainer' : 'bg-surfaceVariant/20 border border-transparent'}
        `}
      >
              {/* Selection Checkbox */}
              <div
                className="absolute top-2 left-2 z-40 p-1 cursor-pointer hover:bg-black/10 rounded-full transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onToggleSelect(page.id, true);
                }}
                aria-label={`Select page ${page.pageNumber}`}
                role="checkbox"
                aria-checked={isSelected}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    isSelected ? 'bg-primary border-primary scale-110' : 'bg-surface/60 border-onSurfaceVariant/40'
                  }`}
                >
                  {isSelected && <FontAwesomeIcon icon={faCheck} className="text-onPrimary text-[10px]" />}
                </div>
              </div>

              {/* Preview Button (Eye Icon) */}
              <div
                className="absolute bottom-10 right-2 z-40 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(page.id);
                }}
              >
                <button
                  type="button"
                  aria-label={`Quick look page ${page.pageNumber}`}
                  className="w-8 h-8 rounded-full bg-surface/90 shadow-sm flex items-center justify-center text-onSurfaceVariant hover:text-primary hover:bg-white transition-colors"
                  title="Quick Look"
                >
                  <FontAwesomeIcon icon={faEye} />
                </button>
              </div>

              {/* Image Container */}
              <div
                className={`aspect-[3/4] w-full relative overflow-hidden flex items-center justify-center p-3 transition-opacity ${
                  isSelected ? 'opacity-80' : 'opacity-100'
                }`}
              >
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
                <span
                  className={`text-xs font-medium ${
                    isSelected ? 'text-onSecondaryContainer' : 'text-onSurfaceVariant'
                  }`}
                >
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
          </div>
  );
};

export default React.memo(PageCard);

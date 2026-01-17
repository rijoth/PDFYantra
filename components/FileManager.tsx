import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { usePdfStore } from '../store/usePdfStore';
import { formatFileSize } from '../services/pdfService';

interface FileManagerProps {
    onClose: () => void;
}

const FileManager: React.FC<FileManagerProps> = ({ onClose }) => {
    const { files, pages, sortPagesByFileOrder, removeFile } = usePdfStore();
    const [fileOrder, setFileOrder] = useState<string[]>([]);

    useEffect(() => {
        setFileOrder(Array.from(files.keys()));
    }, [files]);

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(fileOrder);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setFileOrder(items);
    };

    const handleApply = () => {
        sortPagesByFileOrder(fileOrder);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-surface rounded-md3 shadow-elevation-3 w-full max-w-md relative z-10 flex flex-col max-h-[80vh] animate-scale-in overflow-hidden">
                <div className="p-6 border-b border-surfaceVariant flex justify-between items-center bg-surface">
                    <h3 className="text-xl font-display text-onSurfaceVariant">Manage Files</h3>
                     <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surfaceVariant flex items-center justify-center text-onSurfaceVariant">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 bg-surface">
                    <p className="text-sm text-secondary mb-4">
                        Drag to reorder files. This will regroup all pages in the workspace based on this order.
                    </p>
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="file-list">
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                    {fileOrder.map((fileId, index) => {
                                        const file = files.get(fileId);
                                        if (!file) return null;
                                        const pageCount = pages.filter(p => p.fileId === fileId).length;

                                        return (
                                            <Draggable key={fileId} draggableId={fileId} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className={`p-3 rounded-xl border flex items-center gap-3 bg-surface transition-colors ${snapshot.isDragging ? 'shadow-lg border-primary z-50' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}
                                                    >
                                                        <div className="cursor-grab text-secondary hover:text-onSurfaceVariant px-1">
                                                            <i className="fa-solid fa-grip-vertical"></i>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ backgroundColor: file.color }}>
                                                            PDF
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="truncate font-medium text-sm text-onSurfaceVariant">{file.name}</div>
                                                            <div className="text-xs text-secondary">{formatFileSize(file.size)} • {pageCount} pages</div>
                                                        </div>
                                                        <button 
                                                            onClick={() => removeFile(fileId)}
                                                            className="w-8 h-8 flex items-center justify-center text-secondary hover:text-error hover:bg-error/10 rounded-full transition-colors"
                                                            title="Remove File"
                                                        >
                                                            <i className="fa-regular fa-trash-can"></i>
                                                        </button>
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
                    
                    {fileOrder.length === 0 && (
                         <div className="text-center py-8 text-secondary italic">No files loaded</div>
                    )}
                </div>

                <div className="p-4 border-t border-surfaceVariant flex justify-end gap-3 bg-surface">
                    <button onClick={onClose} className="px-4 py-2 rounded-pill text-sm font-medium hover:bg-surfaceVariant/50 transition-colors text-onSurfaceVariant">
                        Cancel
                    </button>
                    <button onClick={handleApply} className="px-6 py-2 rounded-pill bg-primary text-onPrimary text-sm font-medium hover:shadow-elevation-1 transition-all">
                        Apply Order
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FileManager;
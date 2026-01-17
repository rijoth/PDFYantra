import React, { useEffect, useState, useRef } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { renderPageHighRes } from '../services/pdfService';

const PagePreview: React.FC = () => {
  const { previewPageId, setPreviewPageId, pages, files } = usePdfStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPageIndex = pages.findIndex(p => p.id === previewPageId);
  const page = pages[currentPageIndex];

  useEffect(() => {
    const loadPreview = async () => {
      if (!page) return;
      
      const file = files.get(page.fileId);
      if (!file) return;

      setLoading(true);
      // Revoke previous URL to avoid memory leaks
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      
      try {
        // We pass the rotation stored in the page model to render it 'as is' in the workspace
        const url = await renderPageHighRes(file, page.pageIndex, page.rotation);
        setImageUrl(url);
        setRotation(page.rotation);
        setZoom(1); // Reset zoom on page change
      } catch (err) {
        console.error("Preview render failed", err);
      } finally {
        setLoading(false);
      }
    };

    if (previewPageId) {
      loadPreview();
    }
    
    // Cleanup on unmount
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPageId, page?.rotation]); // Reload if rotation changes in workspace

  if (!previewPageId || !page) return null;

  const handleClose = () => {
    setPreviewPageId(null);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPageIndex < pages.length - 1) {
      setPreviewPageId(pages[currentPageIndex + 1].id);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPageIndex > 0) {
      setPreviewPageId(pages[currentPageIndex - 1].id);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={handleClose}
      ></div>

      {/* Drawer / Sheet */}
      <div className={`
        relative w-full md:w-[600px] bg-surface h-full shadow-2xl flex flex-col
        animate-slide-up md:animate-none md:transition-transform md:translate-x-0
        rounded-t-[28px] md:rounded-l-[28px] md:rounded-tr-none
      `}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surfaceVariant/50">
           <div>
             <h3 className="text-lg font-display text-onSurfaceVariant">Page {page.pageNumber}</h3>
             <p className="text-xs text-secondary">
                {currentPageIndex + 1} of {pages.length} in Workspace
             </p>
           </div>
           
           <div className="flex items-center gap-2">
             <button 
                onClick={handleClose}
                className="w-10 h-10 rounded-full hover:bg-surfaceVariant flex items-center justify-center text-onSurfaceVariant transition-colors"
             >
                <i className="fa-solid fa-xmark text-lg"></i>
             </button>
           </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-surfaceVariant/20 border-b border-surfaceVariant/50">
             <div className="flex items-center gap-1">
                <button 
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-2 rounded-lg hover:bg-surfaceVariant text-secondary disabled:opacity-30"
                  title="Zoom Out"
                >
                  <i className="fa-solid fa-minus"></i>
                </button>
                <span className="text-xs font-mono w-12 text-center text-secondary">{Math.round(zoom * 100)}%</span>
                <button 
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="p-2 rounded-lg hover:bg-surfaceVariant text-secondary disabled:opacity-30"
                  title="Zoom In"
                >
                  <i className="fa-solid fa-plus"></i>
                </button>
             </div>

             <div className="flex items-center gap-2">
                <button 
                  onClick={handlePrev}
                  disabled={currentPageIndex === 0}
                  className="w-8 h-8 rounded-full border border-outline/30 flex items-center justify-center hover:bg-surfaceVariant disabled:opacity-30 text-onSurfaceVariant"
                >
                   <i className="fa-solid fa-chevron-left"></i>
                </button>
                <button 
                  onClick={handleNext}
                  disabled={currentPageIndex === pages.length - 1}
                  className="w-8 h-8 rounded-full border border-outline/30 flex items-center justify-center hover:bg-surfaceVariant disabled:opacity-30 text-onSurfaceVariant"
                >
                   <i className="fa-solid fa-chevron-right"></i>
                </button>
             </div>
        </div>

        {/* Content Area */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto flex items-center justify-center p-8 bg-surfaceVariant/10 relative"
        >
          {loading ? (
             <div className="flex flex-col items-center gap-3 text-primary">
                <i className="fa-solid fa-circle-notch fa-spin text-3xl"></i>
                <span className="text-sm font-medium">Rendering HD Preview...</span>
             </div>
          ) : imageUrl ? (
             <div 
                className="relative transition-transform duration-200 ease-out origin-center shadow-lg bg-white"
                style={{ 
                    transform: `scale(${zoom})`,
                    // Rotation is baked into the image render for previews to ensure wysiwyg
                    // But we can add extra transitions if needed
                }}
             >
                <img 
                   src={imageUrl} 
                   alt="Preview" 
                   className="max-w-none pointer-events-none select-none"
                   style={{
                     // Constrain initial size to fit container somewhat, then zoom scales it
                     maxHeight: '70vh',
                     maxWidth: '100%' 
                   }}
                />
             </div>
          ) : (
             <div className="text-error">Failed to load preview</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PagePreview;
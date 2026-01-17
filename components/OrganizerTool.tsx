import React, { useCallback, useState, useRef } from 'react';
import PageGrid from './PageGrid';
import FileManager from './FileManager';
import PagePreview from './PagePreview';
import { UploadedFile, AppStatus } from '../types';
import { generateThumbnails, mergePages, formatFileSize } from '../services/pdfService';
import { usePdfStore } from '../store/usePdfStore';

const FILE_COLORS = ['#0061A4', '#B3261E', '#2D6B28', '#E68619', '#6750A4'];

const OrganizerTool: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    files: fileMap,
    pages,
    selectedPageIds,
    status,
    errorMessage,
    downloadInfo,
    addFilesAndPages,
    removeFile,
    removePage,
    setPages, 
    toggleSelectPage,
    selectAllPages,
    deselectAllPages,
    rotatePage,
    rotateSelectedPages,
    deleteSelectedPages,
    clearWorkspace,
    setStatus,
    setError,
    setDownloadInfo,
    resetProcessing
  } = usePdfStore();

  const [parsingFile, setParsingFile] = useState<string | null>(null);
  const [showFileManager, setShowFileManager] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const handleFilesSelected = useCallback(async (rawFiles: File[]) => {
    const startColorIdx = fileMap.size % FILE_COLORS.length;
    const newUploadedFiles: UploadedFile[] = [];
    let allNewPages: any[] = [];

    for (let i = 0; i < rawFiles.length; i++) {
      const file = rawFiles[i];
      const fileId = Math.random().toString(36).substr(2, 9);
      setParsingFile(file.name);
      
      try {
        const uploadedFile: UploadedFile = {
          id: fileId,
          file,
          name: file.name,
          size: file.size,
          color: FILE_COLORS[(startColorIdx + i) % FILE_COLORS.length]
        };

        const extractedPages = await generateThumbnails(uploadedFile);
        newUploadedFiles.push(uploadedFile);
        allNewPages = [...allNewPages, ...extractedPages];

      } catch (err) {
        console.error("Error processing file", file.name, err);
        setError(`Failed to load ${file.name}.`);
        setParsingFile(null);
        return; 
      }
    }
    
    addFilesAndPages(newUploadedFiles, allNewPages);
    setParsingFile(null);
  }, [fileMap, addFilesAndPages, setError]);

  const handleMerge = async () => {
    if (pages.length < 1) return;
    setStatus(AppStatus.PROCESSING);
    
    setTimeout(async () => {
        try {
          const pagesToMerge = selectedPageIds.size > 0 
                ? pages.filter(p => selectedPageIds.has(p.id)) 
                : pages;

          const mergedPdfBytes = await mergePages(pagesToMerge, fileMap);
          const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setDownloadInfo({
            url,
            size: blob.size,
            filename: `merged_document_${new Date().getTime()}.pdf`
          });
          setStatus(AppStatus.SUCCESS);
        } catch (err: any) {
           setError(err.message);
        }
    }, 100);
  };

  const hasSelection = selectedPageIds.size > 0;

  if (status === AppStatus.SUCCESS && downloadInfo) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center animate-scale-in py-12">
            <div className="bg-surface rounded-md3 p-10 text-center max-w-sm w-full border border-surfaceVariant">
                <div className="w-20 h-20 bg-primaryContainer text-onPrimaryContainer rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
                    <i className="fa-solid fa-check"></i>
                </div>
                <h2 className="text-2xl font-normal text-onSurfaceVariant mb-2">Ready</h2>
                <p className="text-secondary mb-8">
                    {formatFileSize(downloadInfo.size)}
                </p>
                
                <div className="flex flex-col gap-3">
                    <a
                        href={downloadInfo.url}
                        download={downloadInfo.filename}
                        className="h-12 rounded-pill bg-primary text-onPrimary font-medium flex items-center justify-center gap-2 hover:shadow-elevation-1 transition-all ripple"
                    >
                        <i className="fa-solid fa-download"></i> Download
                    </a>
                    <button
                        onClick={resetProcessing}
                        className="h-12 rounded-pill text-primary font-medium hover:bg-primaryContainer/20 transition-all ripple"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Modals & Preview */}
      {showFileManager && <FileManager onClose={() => setShowFileManager(false)} />}
      <PagePreview />
      
      {/* Loading Dialog */}
      {parsingFile && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] flex items-center justify-center">
            <div className="bg-surface p-6 rounded-md3 shadow-elevation-3 flex items-center gap-4 animate-scale-in min-w-[300px]">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="font-medium text-onSurfaceVariant">Parsing {parsingFile}...</p>
            </div>
          </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
         <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
            {pages.length > 0 && (
                <>
                    <button 
                        onClick={() => setShowFileManager(true)}
                        className="h-9 px-4 rounded-lg text-sm font-medium border border-outline text-onSurfaceVariant hover:bg-surfaceVariant/30 flex items-center gap-2 whitespace-nowrap"
                    >
                        <i className="fa-solid fa-folder-tree"></i> Files
                    </button>
                    <div className="w-px h-6 bg-outline/20 mx-1"></div>
                    
                    {/* Multi-Select Toggle */}
                    <button
                        onClick={() => setIsSelectionMode(!isSelectionMode)}
                        className={`h-9 px-4 rounded-lg text-sm font-medium border flex items-center gap-2 whitespace-nowrap transition-colors ${
                            isSelectionMode 
                            ? 'bg-primaryContainer border-primaryContainer text-onPrimaryContainer' 
                            : 'border-outline text-onSurfaceVariant hover:bg-surfaceVariant/30'
                        }`}
                        title="Toggle Multi-Select Mode"
                    >
                        <i className={`fa-solid ${isSelectionMode ? 'fa-check-double' : 'fa-list-check'}`}></i>
                        <span className="hidden sm:inline">Select Mode</span>
                    </button>

                    <button 
                        onClick={selectAllPages}
                        className={`h-9 px-4 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${selectedPageIds.size === pages.length ? 'bg-secondaryContainer border-secondaryContainer text-onSecondaryContainer' : 'border-outline text-outline hover:bg-surfaceVariant/30'}`}
                    >
                        All
                    </button>
                    
                    {hasSelection && (
                        <button 
                            onClick={deselectAllPages}
                            className="h-9 px-4 rounded-lg text-sm font-medium border border-outline text-outline hover:bg-surfaceVariant/30 whitespace-nowrap"
                        >
                            Clear
                        </button>
                    )}
                </>
            )}
         </div>
         
         <div className="flex gap-2 ml-auto">
            {hasSelection && (
                <button
                    onClick={() => deleteSelectedPages()}
                    className="h-10 w-10 rounded-full flex items-center justify-center text-onSurfaceVariant hover:bg-surfaceVariant/50 transition-colors ripple"
                    title="Delete"
                >
                    <i className="fa-regular fa-trash-can"></i>
                </button>
            )}
             <button
                onClick={handleMerge}
                disabled={pages.length === 0}
                className={`
                    h-10 px-6 rounded-pill font-medium transition-all ripple text-sm flex items-center gap-2
                    ${pages.length === 0 
                        ? 'bg-surfaceVariant text-onSurfaceVariant/50 cursor-not-allowed' 
                        : 'bg-primary text-onPrimary hover:shadow-elevation-1'
                    }
                `}
             >
                {status === AppStatus.PROCESSING ? (
                    <><i className="fa-solid fa-circle-notch fa-spin"></i> Processing...</>
                ) : (
                    hasSelection ? `Export (${selectedPageIds.size})` : 'Export All'
                )}
             </button>
         </div>
      </div>

      {/* Main Grid Surface */}
      <div className={`flex-1 bg-surface rounded-md3 p-1 relative min-h-[500px] transition-colors ${isSelectionMode ? 'ring-2 ring-primaryContainer ring-inset' : ''}`}>
             {pages.length === 0 ? (
                 <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 m-4 border border-dashed border-outline rounded-xl flex flex-col items-center justify-center text-center cursor-pointer hover:bg-surfaceVariant/20 transition-colors"
                 >
                     <div className="w-16 h-16 bg-primaryContainer/50 rounded-2xl flex items-center justify-center text-primary mb-4">
                        <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>
                     </div>
                     <p className="text-onSurfaceVariant font-medium text-lg">Tap to add PDFs</p>
                 </div>
             ) : (
                <PageGrid 
                    pages={pages}
                    fileMap={fileMap}
                    selectedPageIds={selectedPageIds}
                    onReorder={setPages}
                    onRemovePage={removePage}
                    onRotatePage={rotatePage}
                    onToggleSelect={toggleSelectPage}
                    selectionMode={isSelectionMode}
                />
             )}
      </div>

      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-24 md:bottom-8 right-6 z-50">
        <button
            onClick={() => fileInputRef.current?.click()}
            className="w-14 h-14 bg-tertiaryContainer text-onTertiaryContainer rounded-fab shadow-elevation-3 hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center ripple"
        >
            <i className="fa-solid fa-plus text-2xl"></i>
        </button>
        <input
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFilesSelected(Array.from(e.target.files))}
        />
      </div>

      {/* Contextual Action Bar (Bottom Sheet style for Actions) */}
      <div className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${hasSelection ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
          <div className="bg-secondaryContainer text-onSecondaryContainer px-4 py-3 rounded-full shadow-elevation-3 flex items-center gap-4">
             <span className="text-sm font-bold pl-2">{selectedPageIds.size} selected</span>
             <div className="h-4 w-px bg-onSecondaryContainer/20"></div>
             
             <button onClick={() => rotateSelectedPages('ccw')} className="p-2 hover:bg-onSecondaryContainer/10 rounded-full transition-colors"><i className="fa-solid fa-rotate-left"></i></button>
             <button onClick={() => rotateSelectedPages('cw')} className="p-2 hover:bg-onSecondaryContainer/10 rounded-full transition-colors"><i className="fa-solid fa-rotate-right"></i></button>
             <button onClick={() => deleteSelectedPages()} className="p-2 hover:bg-onSecondaryContainer/10 rounded-full transition-colors"><i className="fa-solid fa-trash"></i></button>
          </div>
      </div>
    </div>
  );
};

export default OrganizerTool;
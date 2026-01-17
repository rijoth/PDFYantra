import React, { useCallback, useState, useRef } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { generateThumbnails } from '../services/pdfService';
import { ToolType, UploadedFile } from '../types';

const FILE_COLORS = ['#0061A4', '#B3261E', '#2D6B28', '#E68619', '#6750A4'];

interface LandingPageProps {
  onNavigate: (tool: ToolType) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { addFilesAndPages, setError, files } = usePdfStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (rawFiles: File[]) => {
    setIsProcessing(true);
    const startColorIdx = files.size % FILE_COLORS.length;
    const newUploadedFiles: UploadedFile[] = [];
    let allNewPages: any[] = [];

    const pdfFiles = rawFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
        setIsProcessing(false);
        if (rawFiles.length > 0) alert("Please upload PDF files only.");
        return;
    }

    try {
        for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i];
            const fileId = Math.random().toString(36).substr(2, 9);
            
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
        }

        addFilesAndPages(newUploadedFiles, allNewPages);
        onNavigate('merge'); 
    } catch (err: any) {
        console.error(err);
        setError("Failed to process files. Please try again.");
    } finally {
        setIsProcessing(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
        handleFiles(Array.from(e.dataTransfer.files));
    }
  }, [files, addFilesAndPages, onNavigate]);

  return (
    <div className="max-w-5xl mx-auto py-2">
      
      {/* Hero / Drop Zone */}
      <div 
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        className={`
            relative rounded-md3 transition-all duration-300 overflow-hidden mb-6
            ${isDragging ? 'bg-primaryContainer scale-[1.02]' : 'bg-surface'}
        `}
      >
        <div className="absolute inset-0 opacity-50 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-secondaryContainer/50 to-transparent"></div>
        
        <div className="relative z-10 p-10 md:p-16 flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-normal text-onSurfaceVariant mb-4 leading-tight">
                    Unified PDF <br/>
                    <span className="font-bold text-primary">Workspace</span>
                </h1>
                <p className="text-lg text-secondary mb-8 max-w-md">
                    Upload documents once. Organize, merge, and split them seamlessly in one flow-processed 100% locally in your browser.
                </p>
                
                <button 
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="h-14 px-8 rounded-pill bg-primary text-onPrimary font-medium text-lg hover:shadow-elevation-1 transition-all ripple flex items-center gap-3 mx-auto md:mx-0"
                >
                    {isProcessing ? (
                         <i className="fa-solid fa-circle-notch fa-spin"></i>
                    ) : (
                        <i className="fa-solid fa-plus"></i>
                    )}
                    {isProcessing ? 'Processing...' : 'Load Workspace'}
                </button>
                <input 
                    type="file" 
                    multiple 
                    accept=".pdf" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} 
                />
            </div>

            <div className={`
                w-64 h-64 bg-white rounded-[32px] shadow-sm flex items-center justify-center text-primaryContainer transition-all duration-500
                ${isDragging ? 'rotate-3 scale-110' : 'rotate-0'}
            `}>
                <i className="fa-solid fa-folder-open text-[8rem]"></i>
            </div>
        </div>
      </div>

      {/* Feature Explainer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div 
            className="bg-surface rounded-md3 p-8 border border-surfaceVariant/50 relative overflow-hidden"
          >
              <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-secondaryContainer text-onSecondaryContainer flex items-center justify-center mb-4 text-xl">
                      <i className="fa-solid fa-layer-group"></i>
                  </div>
                  <h3 className="text-xl font-medium text-onSurfaceVariant mb-2">Organizer Mode</h3>
                  <p className="text-secondary text-sm">Rearrange, rotate, and delete pages from multiple files in a single view.</p>
              </div>
          </div>

          <div 
            className="bg-surface rounded-md3 p-8 border border-surfaceVariant/50 relative overflow-hidden"
          >
               <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-tertiaryContainer text-onTertiaryContainer flex items-center justify-center mb-4 text-xl">
                      <i className="fa-solid fa-scissors"></i>
                  </div>
                  <h3 className="text-xl font-medium text-onSurfaceVariant mb-2">Workspace Splitter</h3>
                  <p className="text-secondary text-sm">Create new documents by slicing up your current workspace arrangement.</p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default LandingPage;
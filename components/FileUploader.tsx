import React, { useCallback, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp, faPlus } from '@fortawesome/free-solid-svg-icons';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  mini?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, disabled, mini = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pdfFiles = Array.from(e.dataTransfer.files).filter(
        (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfFiles.length > 0) onFilesSelected(pdfFiles);
    }
  }, [onFilesSelected, disabled]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const pdfFiles = Array.from(e.target.files);
      onFilesSelected(pdfFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (mini) {
    return (
        <button
            onClick={() => !disabled && fileInputRef.current?.click()}
            className="w-full h-12 rounded-pill bg-primaryContainer text-onPrimaryContainer font-medium hover:shadow-sm transition-all flex items-center justify-center gap-2 ripple"
            disabled={disabled}
        >
            <input
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                ref={fileInputRef}
                disabled={disabled}
                onChange={handleFileInputChange}
            />
            <FontAwesomeIcon icon={faPlus} /> Add PDF
        </button>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
      className={`
        relative group cursor-pointer rounded-xl border border-dashed transition-all duration-300 ease-out p-8 text-center
        ${disabled ? 'opacity-50 cursor-not-allowed bg-surfaceVariant' : ''}
        ${isDragging 
          ? 'border-primary bg-primaryContainer/30 scale-[1.01]' 
          : 'border-outline/50 bg-surface hover:bg-surfaceVariant/30'
        }
      `}
    >
      <input
        type="file"
        multiple
        accept=".pdf"
        className="hidden"
        ref={fileInputRef}
        disabled={disabled}
        onChange={handleFileInputChange}
      />
      
      <div className="flex flex-col items-center justify-center gap-4 py-4">
        <div className={`
          w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300
          ${isDragging ? 'bg-primaryContainer text-onPrimaryContainer' : 'bg-surfaceVariant text-onSurfaceVariant'}
        `}>
          <FontAwesomeIcon icon={faCloudArrowUp} className="text-2xl" />
        </div>
        
        <div className="space-y-1">
          <p className="font-medium text-onSurfaceVariant">
            {isDragging ? 'Drop PDFs here' : 'Click or drop PDFs'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FileUploader;
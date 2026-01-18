import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { AppStatus, ConvertFormat, UploadedFile } from '../types';
import { convertToPdf, convertFromPdf } from '../services/conversionService';
import { generateThumbnails, formatFileSize } from '../services/pdfService';
import { isValidRangeFormat, parsePageRange } from '../utils/pdfUtils';

const FILE_COLORS = ['#0061A4', '#B3261E', '#2D6B28', '#E68619', '#6750A4'];

const ConvertTool: React.FC = () => {
    const {
        pages,
        files,
        addFilesAndPages,
        status,
        setStatus,
        setError,
        downloadInfo,
        setDownloadInfo,
        resetProcessing
    } = usePdfStore();

    const [activeTab, setActiveTab] = useState<'to_pdf' | 'from_pdf'>('from_pdf');
    const [targetFormat, setTargetFormat] = useState<ConvertFormat>('jpg');

    // Export Configuration State
    const [sourceFileId, setSourceFileId] = useState<string>('all');
    const [exportMode, setExportMode] = useState<'all' | 'range'>('all');
    const [rangeInput, setRangeInput] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Local state for converted files (Convert to PDF tab)
    const [convertedFiles, setConvertedFiles] = useState<{
        id: string;
        name: string;
        url: string;
        size: number;
    }[]>([]);

    // Cleanup object URLs on unmount or change
    useEffect(() => {
        return () => {
            convertedFiles.forEach(f => URL.revokeObjectURL(f.url));
        };
    }, [convertedFiles]);

    // Determine available files that actually have pages in the workspace
    const availableFiles = useMemo(() => {
        const fileIdsInWorkspace = new Set(pages.map(p => p.fileId));
        return Array.from(files.values()).filter((f: UploadedFile) => fileIdsInWorkspace.has(f.id));
    }, [files, pages]);

    // Calculate pages based on scope (All Workspace vs Specific File)
    const targetPages = useMemo(() => {
        if (sourceFileId === 'all') return pages;
        return pages.filter(p => p.fileId === sourceFileId);
    }, [pages, sourceFileId]);

    // Filter based on range if needed
    const pagesToExport = useMemo(() => {
        if (exportMode === 'all') return targetPages;
        if (!rangeInput) return [];

        const indices = parsePageRange(rangeInput, targetPages.length);
        return indices.map(i => targetPages[i]).filter(Boolean);
    }, [targetPages, exportMode, rangeInput]);

    // Reset range when switching files
    useEffect(() => {
        setRangeInput('');
    }, [sourceFileId]);

    // --- Export Logic (PDF -> X) ---
    const handleExport = async () => {
        if (pagesToExport.length === 0) return;
        setStatus(AppStatus.PROCESSING);

        setTimeout(async () => {
            try {
                const result = await convertFromPdf(pagesToExport, files, targetFormat);
                const url = URL.createObjectURL(result.blob);
                setDownloadInfo({
                    url,
                    size: result.blob.size,
                    filename: result.filename,
                    isZip: result.isZip
                });
                setStatus(AppStatus.SUCCESS);
            } catch (err: any) {
                setError(err.message);
            }
        }, 100);
    };

    // --- Import Logic (X -> PDF) ---
    const handleImportFiles = async (rawFiles: File[]) => {
        setStatus(AppStatus.PROCESSING);
        setError(null);

        // Separate PDFs from other files
        const pdfFiles: File[] = [];
        const convertFiles: File[] = [];

        rawFiles.forEach(f => {
            if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
                pdfFiles.push(f);
            } else {
                convertFiles.push(f);
            }
        });

        try {
            const newUploadedFiles: UploadedFile[] = [];
            let allNewPages: any[] = [];
            let startColorIdx = files.size % FILE_COLORS.length;
            const newConvertedItems: typeof convertedFiles = [];

            // 1. Process Native PDFs
            for (const file of pdfFiles) {
                const fileId = Math.random().toString(36).substr(2, 9);
                const uFile: UploadedFile = {
                    id: fileId,
                    file,
                    name: file.name,
                    size: file.size,
                    color: FILE_COLORS[(startColorIdx++) % FILE_COLORS.length]
                };
                const extracted = await generateThumbnails(uFile);
                newUploadedFiles.push(uFile);
                allNewPages.push(...extracted);
            }

            // 2. Convert & Process Other Files
            if (convertFiles.length > 0) {
                const convertedResults = await convertToPdf(convertFiles);

                for (const res of convertedResults) {
                    const file = new File([res.pdfBytes as any], res.name, { type: 'application/pdf' });
                    const fileId = Math.random().toString(36).substr(2, 9);
                    const uFile: UploadedFile = {
                        id: fileId,
                        file,
                        name: res.name, // The new PDF name
                        size: file.size,
                        color: FILE_COLORS[(startColorIdx++) % FILE_COLORS.length]
                    };
                    const extracted = await generateThumbnails(uFile);
                    newUploadedFiles.push(uFile);
                    allNewPages.push(...extracted);

                    // Add to local list for download/preview
                    const blob = new Blob([res.pdfBytes as any], { type: 'application/pdf' });
                    newConvertedItems.push({
                        id: Math.random().toString(36).substr(2, 9),
                        name: res.name,
                        url: URL.createObjectURL(blob),
                        size: blob.size
                    });
                }
            }

            addFilesAndPages(newUploadedFiles, allNewPages);

            if (newConvertedItems.length > 0) {
                setConvertedFiles(prev => [...prev, ...newConvertedItems]);
            }

            // If we only added files (Convert To PDF), show success but stay or go to organizer
            setStatus(AppStatus.IDLE); // Reset status effectively

        } catch (err: any) {
            setError(err.message);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            handleImportFiles(Array.from(e.dataTransfer.files));
        }
    };

    const isExportValid = () => {
        if (pages.length === 0) return false;
        if (pagesToExport.length === 0) return false;
        if (exportMode === 'range' && !isValidRangeFormat(rangeInput)) return false;
        return true;
    };

    if (status === AppStatus.SUCCESS && downloadInfo) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center animate-scale-in py-12">
                <div className="bg-surface rounded-md3 p-10 text-center max-w-sm w-full border border-surfaceVariant">
                    <div className="w-20 h-20 bg-primaryContainer text-onPrimaryContainer rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
                        <i className="fa-solid fa-check"></i>
                    </div>
                    <h2 className="text-2xl font-normal text-onSurfaceVariant mb-2">Ready</h2>
                    <p className="text-secondary mb-8">
                        {downloadInfo.filename} ({formatFileSize(downloadInfo.size)})
                    </p>

                    <div className="flex flex-col gap-3">
                        <a
                            href={downloadInfo.url}
                            download={downloadInfo.filename}
                            className="h-12 rounded-pill bg-primary text-onPrimary font-medium flex items-center justify-center gap-2 hover:shadow-elevation-1 transition-all ripple"
                        >
                            <i className="fa-solid fa-download"></i> Download {downloadInfo.isZip ? 'ZIP' : 'File'}
                        </a>
                        <button
                            onClick={resetProcessing}
                            className="h-12 rounded-pill text-primary font-medium hover:bg-primaryContainer/20 transition-all ripple"
                        >
                            Convert Another
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto">

            {/* Tab Navigation */}
            <div className="flex gap-4 border-b border-surfaceVariant/50 mb-6">
                <button
                    onClick={() => setActiveTab('from_pdf')}
                    className={`px-4 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === 'from_pdf' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-onSurfaceVariant'}`}
                >
                    <i className="fa-solid fa-file-export mr-2"></i>
                    Export from PDF
                </button>
                <button
                    onClick={() => setActiveTab('to_pdf')}
                    className={`px-4 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === 'to_pdf' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-onSurfaceVariant'}`}
                >
                    <i className="fa-solid fa-file-import mr-2"></i>
                    Convert to PDF
                </button>
            </div>

            <div className="flex-1 pb-12">
                {activeTab === 'from_pdf' && (
                    <div className="animate-fade-in flex flex-col md:flex-row gap-8">
                        <div className="flex-1 bg-surface rounded-md3 p-8 border border-surfaceVariant shadow-sm">
                            <h3 className="text-xl font-display text-onSurfaceVariant mb-4">Export Configuration</h3>

                            {/* Source Selection */}
                            <div className="mb-6">
                                <label className="text-xs font-medium text-secondary uppercase tracking-wider mb-2 block">Source Document</label>
                                <div className="relative">
                                    <select
                                        value={sourceFileId}
                                        onChange={(e) => setSourceFileId(e.target.value)}
                                        className="w-full pl-3 pr-10 py-3 bg-surfaceVariant/30 border border-outline/20 rounded-xl appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm font-medium text-onSurfaceVariant truncate"
                                    >
                                        <option value="all">Entire Workspace ({pages.length} pages)</option>
                                        {/* Explicitly type file to avoid 'unknown' type error */}
                                        {availableFiles.map((file: UploadedFile) => {
                                            const count = pages.filter(p => p.fileId === file.id).length;
                                            return (
                                                <option key={file.id} value={file.id}>
                                                    {file.name} ({count} pages)
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-secondary">
                                        <i className="fa-solid fa-chevron-down text-xs"></i>
                                    </div>
                                </div>
                            </div>

                            {/* Page Selection */}
                            <div className="mb-8">
                                <label className="text-xs font-medium text-secondary uppercase tracking-wider mb-2 block">Pages to Export</label>

                                <div className="flex flex-col gap-3">
                                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${exportMode === 'all' ? 'bg-primaryContainer/30 border-primary' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}>
                                        <input
                                            type="radio"
                                            className="accent-primary"
                                            checked={exportMode === 'all'}
                                            onChange={() => setExportMode('all')}
                                        />
                                        <span className="text-sm font-medium text-onSurfaceVariant">All Pages ({targetPages.length})</span>
                                    </label>

                                    <label className={`flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${exportMode === 'range' ? 'bg-primaryContainer/30 border-primary' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="radio"
                                                className="accent-primary"
                                                checked={exportMode === 'range'}
                                                onChange={() => setExportMode('range')}
                                            />
                                            <span className="text-sm font-medium text-onSurfaceVariant">Custom Range</span>
                                        </div>

                                        {exportMode === 'range' && (
                                            <div className="ml-7 mt-1">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 1-3, 5"
                                                    value={rangeInput}
                                                    onChange={(e) => setRangeInput(e.target.value)}
                                                    className="w-full px-3 py-2 bg-surface border border-outline/30 rounded-lg text-sm focus:border-primary focus:outline-none"
                                                />
                                                <p className="text-xs text-secondary mt-1">
                                                    {rangeInput && !isValidRangeFormat(rangeInput) ? (
                                                        <span className="text-error">Invalid format</span>
                                                    ) : (
                                                        <span>Selected: {pagesToExport.length} pages</span>
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="text-xs font-medium text-secondary uppercase tracking-wider mb-2 block">Output Format</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { id: 'jpg', icon: 'fa-image', label: 'JPG Images', desc: 'Best for photos' },
                                        { id: 'png', icon: 'fa-image', label: 'PNG Images', desc: 'Lossless quality' },
                                        { id: 'text', icon: 'fa-file-lines', label: 'Plain Text', desc: 'Extract content' },
                                        { id: 'csv', icon: 'fa-table', label: 'CSV Data', desc: 'Raw data dump' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setTargetFormat(opt.id as ConvertFormat)}
                                            className={`p-3 rounded-xl border text-left transition-all ${targetFormat === opt.id ? 'bg-primaryContainer border-primaryContainer text-onPrimaryContainer' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <i className={`fa-regular ${opt.icon}`}></i>
                                                <span className="font-medium text-sm">{opt.label}</span>
                                            </div>
                                            <p className="text-[10px] opacity-70 ml-6 leading-tight">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleExport}
                                disabled={!isExportValid() || status === AppStatus.PROCESSING}
                                className="w-full h-12 rounded-pill bg-primary text-onPrimary font-medium flex items-center justify-center gap-2 hover:shadow-elevation-1 transition-all ripple disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                            >
                                {status === AppStatus.PROCESSING ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-bolt"></i>}
                                {pagesToExport.length > 0 ? `Export ${pagesToExport.length} Pages` : 'Export'}
                            </button>
                        </div>

                        <div className="w-full md:w-80 flex flex-col gap-4">
                            {/* Info Card */}
                            <div className="p-6 bg-surfaceVariant/30 rounded-md3 border border-surfaceVariant/50">
                                <h4 className="font-medium text-sm text-onSurfaceVariant mb-3"><i className="fa-solid fa-circle-info mr-2"></i>Format Guide</h4>
                                <ul className="space-y-3 text-xs text-secondary">
                                    <li className="flex gap-2">
                                        <span className="font-bold text-primary">•</span>
                                        <span><b>JPG/PNG:</b> Creates a ZIP file if multiple pages are exported. Great for slides.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="font-bold text-primary">•</span>
                                        <span><b>Text:</b> Creates a single text file with pages separated by delimiters.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="font-bold text-primary">•</span>
                                        <span><b>CSV:</b> Creates a single CSV file. Best for simple tabular data extraction.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'to_pdf' && (
                    <div className="animate-fade-in flex flex-col items-center">
                        <div
                            onDrop={onDrop}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                            w-full max-w-2xl min-h-[300px] border-2 border-dashed rounded-md3 flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all
                            ${isDragging ? 'border-primary bg-primaryContainer/20 scale-[1.01]' : 'border-outline/30 hover:bg-surfaceVariant/20'}
                        `}
                        >
                            <input
                                type="file"
                                multiple
                                ref={fileInputRef}
                                className="hidden"
                                onChange={(e) => e.target.files && handleImportFiles(Array.from(e.target.files))}
                                accept=".jpg,.jpeg,.png,.webp,.txt,.md,.html,.docx,.xlsx,.csv"
                            />

                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-colors ${isDragging ? 'bg-primaryContainer text-onPrimaryContainer' : 'bg-surfaceVariant text-onSurfaceVariant'}`}>
                                <i className="fa-solid fa-magic-wand-sparkles text-3xl"></i>
                            </div>

                            <h3 className="text-2xl font-display text-onSurfaceVariant mb-2">Convert to PDF</h3>
                            <p className="text-secondary mb-6 max-w-md">
                                Drag & Drop images, Office docs, or text files here.
                                They will be converted to PDF and added to your workspace.
                            </p>

                            <div className="flex flex-wrap justify-center gap-2 text-xs text-secondary opacity-70">
                                <span className="bg-surfaceVariant px-2 py-1 rounded">JPG/PNG</span>
                                <span className="bg-surfaceVariant px-2 py-1 rounded">DOCX</span>
                                <span className="bg-surfaceVariant px-2 py-1 rounded">XLSX</span>
                                <span className="bg-surfaceVariant px-2 py-1 rounded">HTML</span>
                                <span className="bg-surfaceVariant px-2 py-1 rounded">TXT</span>
                            </div>
                        </div>

                        <div className="mt-8 max-w-2xl w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex gap-3 text-yellow-800 text-sm">
                            <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                            <div>
                                <p className="font-bold mb-1">Conversion Fidelity Warning</p>
                                <p>
                                    Office documents (DOCX, XLSX) and HTML are converted to <b>Image-based PDFs</b> to preserve layout integrity in the browser. Text in the resulting PDF will not be selectable.
                                </p>
                            </div>
                        </div>

                        {/* Converted Files List with Download/Preview */}
                        {convertedFiles.length > 0 && (
                            <div className="w-full max-w-2xl mt-8 animate-slide-up">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-medium text-onSurfaceVariant">Converted Files</h3>
                                    <button
                                        onClick={() => setConvertedFiles([])}
                                        className="text-sm text-primary hover:text-primary/80 font-medium"
                                    >
                                        Clear List
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {convertedFiles.map((file) => (
                                        <div key={file.id} className="bg-surface p-4 rounded-xl border border-outline/20 flex items-center gap-4 shadow-sm">
                                            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xl">
                                                <i className="fa-regular fa-file-pdf"></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-onSurfaceVariant truncate" title={file.name}>{file.name}</div>
                                                <div className="text-xs text-secondary">{formatFileSize(file.size)}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:bg-surfaceVariant transition-colors"
                                                    title="Preview PDF"
                                                >
                                                    <i className="fa-regular fa-eye"></i>
                                                </a>
                                                <a
                                                    href={file.url}
                                                    download={file.name}
                                                    className="w-9 h-9 flex items-center justify-center rounded-full text-primary hover:bg-primaryContainer hover:text-onPrimaryContainer transition-colors"
                                                    title="Download PDF"
                                                >
                                                    <i className="fa-solid fa-download"></i>
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConvertTool;
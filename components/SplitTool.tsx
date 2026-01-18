import React, { useState, useEffect, useMemo } from 'react';
import { SplitConfig, AppStatus, UploadedFile } from '../types';
import { isValidRangeFormat, parsePageRange } from '../utils/pdfUtils';
import { usePdfStore } from '../store/usePdfStore';
import { splitWorkspace, formatFileSize } from '../services/pdfService';
import PagePreview from './PagePreview';

interface SplitToolProps {
    onSplit: (config: SplitConfig) => void;
    isProcessing: boolean;
}

const SplitTool: React.FC<SplitToolProps> = ({ onSplit, isProcessing }) => {
    const { pages, resetProcessing, setStatus, setDownloadInfo, setError, files, setPreviewPageId, status, downloadInfo } = usePdfStore();

    const [selectedFileId, setSelectedFileId] = useState<string>('all');
    const [config, setConfig] = useState<SplitConfig>({
        mode: 'extract_all',
        rangeInput: '',
        fixedCount: 1
    });

    // Calculate pages based on scope (All Workspace vs Specific File)
    const targetPages = useMemo(() => {
        if (selectedFileId === 'all') return pages;
        return pages.filter(p => p.fileId === selectedFileId);
    }, [pages, selectedFileId]);

    // Determine available files that actually have pages in the workspace
    const availableFiles = useMemo(() => {
        const fileIdsInWorkspace = new Set(pages.map(p => p.fileId));
        return Array.from(files.values()).filter((f: UploadedFile) => fileIdsInWorkspace.has(f.id));
    }, [files, pages]);

    // Reset range when switching files to avoid invalid ranges
    useEffect(() => {
        setConfig(prev => ({ ...prev, rangeInput: '' }));
    }, [selectedFileId]);

    // Handle local split execution
    const handleExecuteSplit = async () => {
        setStatus(AppStatus.PROCESSING);
        setError(null);
        try {
            setTimeout(async () => {
                try {
                    // We pass targetPages (subset) instead of all pages
                    const result = await splitWorkspace(targetPages, files, config);
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
        } catch (err: any) {
            setError(err.message);
        }
    };

    const isValid = () => {
        if (targetPages.length === 0) return false;
        if (config.mode === 'by_range') {
            if (!isValidRangeFormat(config.rangeInput)) return false;
            // Check if range actually selects something
            const indices = parsePageRange(config.rangeInput, targetPages.length);
            return indices.length > 0;
        }
        if (config.mode === 'fixed_number') return config.fixedCount > 0;
        return true;
    };

    const handleInspect = () => {
        if (targetPages.length > 0) {
            setPreviewPageId(targetPages[0].id);
        }
    };

    // Calculate preview pages for "By Range" mode
    const rangePreviewPages = useMemo(() => {
        if (config.mode !== 'by_range' || !config.rangeInput) return [];
        const indices = parsePageRange(config.rangeInput, targetPages.length);
        return indices.map(i => targetPages[i]).filter(Boolean);
    }, [config.mode, config.rangeInput, targetPages]);

    if (status === AppStatus.SUCCESS && downloadInfo) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center animate-scale-in py-12">
                <div className="bg-surface rounded-md3 p-10 text-center max-w-sm w-full border border-surfaceVariant">
                    <div className="w-20 h-20 bg-primaryContainer text-onPrimaryContainer rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
                        <i className="fa-solid fa-check"></i>
                    </div>
                    <h2 className="text-2xl font-normal text-onSurfaceVariant mb-2">Split Complete</h2>
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
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (pages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-8 animate-fade-in">
                <div className="w-20 h-20 bg-surfaceVariant rounded-full flex items-center justify-center text-secondary mb-4">
                    <i className="fa-solid fa-scissors text-3xl"></i>
                </div>
                <h2 className="text-2xl font-display text-onSurfaceVariant mb-2">Workspace is Empty</h2>
                <p className="text-secondary mb-6 max-w-md">
                    The Split tool operates on the documents in your workspace. Go to the Home or Organizer tab to upload PDFs first.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full pb-20 md:pb-0 relative">
            <PagePreview />

            {/* Visualization Area */}
            <div className="flex-1 bg-surface rounded-md3 p-6 md:p-10 border border-surfaceVariant flex flex-col items-center justify-center min-h-[400px]">
                <div className="text-center animate-scale-in max-w-lg">
                    <div className="w-24 h-24 bg-tertiaryContainer rounded-2xl mx-auto flex items-center justify-center text-4xl text-onTertiaryContainer mb-6 shadow-sm relative group cursor-pointer" onClick={handleInspect}>
                        <i className="fa-solid fa-layer-group group-hover:scale-110 transition-transform"></i>
                        <div className="absolute -right-2 -bottom-2 bg-onTertiaryContainer text-tertiaryContainer text-xs font-bold px-2 py-1 rounded-full">
                            {targetPages.length}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                            <i className="fa-regular fa-eye"></i>
                        </div>
                    </div>

                    <h3 className="text-2xl font-normal text-onSurfaceVariant mb-2">
                        {selectedFileId === 'all' ? 'Workspace Splitter' : 'File Splitter'}
                    </h3>
                    <p className="text-secondary mb-4">
                        You are about to split <b>{targetPages.length} pages</b>
                        {selectedFileId !== 'all' && ' from the selected file'}.
                    </p>

                    <button
                        onClick={handleInspect}
                        className="mb-8 text-sm font-medium text-primary hover:bg-primaryContainer/20 px-4 py-2 rounded-full transition-colors"
                    >
                        <i className="fa-regular fa-eye mr-2"></i>
                        Inspect Source Pages
                    </button>

                    {/* Visual Representation of Split Mode */}
                    <div className="flex justify-center gap-2 opacity-50">
                        {config.mode === 'extract_all' && (
                            <>
                                <i className="fa-regular fa-file-pdf fa-2x"></i>
                                <i className="fa-regular fa-file-pdf fa-2x"></i>
                                <i className="fa-regular fa-file-pdf fa-2x"></i>
                            </>
                        )}
                        {config.mode === 'fixed_number' && (
                            <>
                                <div className="flex items-center gap-1 border border-current rounded px-2 py-1"><i className="fa-regular fa-file-lines"></i> {config.fixedCount}</div>
                                <div className="flex items-center gap-1 border border-current rounded px-2 py-1"><i className="fa-regular fa-file-lines"></i> {config.fixedCount}</div>
                            </>
                        )}
                        {config.mode === 'by_range' && (
                            <div className="flex items-center gap-2 border border-current rounded px-3 py-2">
                                <i className="fa-solid fa-crop-simple"></i>
                                <span>{config.rangeInput || 'Define Range'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Configuration Drawer */}
            <div className={`
        lg:w-[360px] bg-surface rounded-md3 p-6 border border-surfaceVariant flex flex-col shadow-elevation-1 overflow-y-auto
      `}>
                <h3 className="text-lg font-medium text-onSurfaceVariant mb-4">Split Configuration</h3>

                {/* Source Selection Dropdown */}
                <div className="mb-6">
                    <label className="text-xs font-medium text-secondary uppercase tracking-wider mb-2 block">Source Document</label>
                    <div className="relative">
                        <select
                            value={selectedFileId}
                            onChange={(e) => setSelectedFileId(e.target.value)}
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

                <div className="space-y-4 flex-1">
                    {/* Option 1 */}
                    <label className={`
                flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ripple border
                ${config.mode === 'extract_all' ? 'bg-secondaryContainer border-secondaryContainer text-onSecondaryContainer' : 'border-outline/20 hover:bg-surfaceVariant/50 text-onSurfaceVariant'}
             `}>
                        <input
                            type="radio"
                            className="accent-primary w-5 h-5"
                            checked={config.mode === 'extract_all'}
                            onChange={() => setConfig({ ...config, mode: 'extract_all' })}
                        />
                        <div>
                            <div className="font-medium text-sm">Burst All Pages</div>
                            <div className="text-xs opacity-70">Save every page as a separate PDF</div>
                        </div>
                    </label>

                    {/* Option 2 */}
                    <div className={`p-4 rounded-xl transition-all border ${config.mode === 'by_range' ? 'bg-surface border-primary shadow-sm' : 'border-outline/20 hover:bg-surfaceVariant/50'}`}>
                        <label className="flex items-center gap-4 cursor-pointer mb-3">
                            <input
                                type="radio"
                                className="accent-primary w-5 h-5"
                                checked={config.mode === 'by_range'}
                                onChange={() => setConfig({ ...config, mode: 'by_range' })}
                            />
                            <div className="font-medium text-sm text-onSurfaceVariant">Custom Selection</div>
                        </label>

                        {config.mode === 'by_range' && (
                            <div className="animate-fade-in">
                                <div className="md3-text-field relative mt-2">
                                    <input
                                        type="text"
                                        id="range"
                                        placeholder=" "
                                        className="block px-4 pb-2.5 pt-5 w-full text-sm text-onSurfaceVariant bg-surfaceVariant/50 rounded-t-lg border-b-2 border-onSurfaceVariant appearance-none focus:outline-none focus:ring-0 focus:border-primary peer"
                                        value={config.rangeInput}
                                        onChange={(e) => setConfig({ ...config, rangeInput: e.target.value })}
                                    />
                                    <label htmlFor="range" className="absolute text-sm text-secondary duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4 peer-focus:text-primary">
                                        Pages (e.g. 1-3, 5)
                                    </label>
                                </div>
                                <p className="text-xs text-secondary mt-1 ml-1 mb-3">Refers to position in selected source.</p>

                                {/* Range Preview */}
                                {rangePreviewPages.length > 0 ? (
                                    <div className="mt-3">
                                        <div className="text-xs font-medium text-secondary mb-2">Preview ({rangePreviewPages.length} pages):</div>
                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                            {rangePreviewPages.map((p, idx) => (
                                                <div key={idx} className="flex-shrink-0 w-12 flex flex-col gap-1 items-center">
                                                    <div className="w-12 h-16 border border-outline/20 bg-white shadow-sm flex items-center justify-center overflow-hidden rounded-sm">
                                                        <img src={p.thumbnailUrl} className="max-w-full max-h-full opacity-80" alt="" />
                                                    </div>
                                                    <span className="text-[10px] text-secondary font-mono">{p.pageNumber}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : config.rangeInput && (
                                    <div className="mt-2 text-xs text-error">Invalid range or no pages found.</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Option 3 */}
                    <div className={`p-4 rounded-xl transition-all border ${config.mode === 'fixed_number' ? 'bg-surface border-primary shadow-sm' : 'border-outline/20 hover:bg-surfaceVariant/50'}`}>
                        <label className="flex items-center gap-4 cursor-pointer mb-3">
                            <input
                                type="radio"
                                className="accent-primary w-5 h-5"
                                checked={config.mode === 'fixed_number'}
                                onChange={() => setConfig({ ...config, mode: 'fixed_number' })}
                            />
                            <div className="font-medium text-sm text-onSurfaceVariant">Split by Count</div>
                        </label>

                        {config.mode === 'fixed_number' && (
                            <div className="flex items-center gap-3 mt-2 animate-fade-in">
                                <input
                                    type="number"
                                    min="1"
                                    max={targetPages.length}
                                    className="w-20 px-3 py-2 bg-surfaceVariant/50 border-b-2 border-onSurfaceVariant rounded-t-lg focus:border-primary outline-none"
                                    value={config.fixedCount}
                                    onChange={(e) => setConfig({ ...config, fixedCount: parseInt(e.target.value) || 1 })}
                                />
                                <span className="text-sm text-secondary">pages per file</span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleExecuteSplit}
                    disabled={!isValid() || isProcessing}
                    className={`
                mt-6 w-full h-12 rounded-pill font-medium transition-all ripple flex items-center justify-center gap-2
                ${!isValid() || isProcessing
                            ? 'bg-surfaceVariant text-onSurfaceVariant/50 cursor-not-allowed'
                            : 'bg-primary text-onPrimary hover:shadow-elevation-1'
                        }
            `}
                >
                    {isProcessing && <i className="fa-solid fa-circle-notch fa-spin"></i>}
                    {config.mode === 'extract_all' ? 'Extract Pages' : 'Split Pages'}
                </button>
            </div>
        </div>
    );
};

export default SplitTool;
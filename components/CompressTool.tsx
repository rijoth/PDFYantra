
import React, { useState, useMemo } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { formatFileSize, compressPdfFile, generateThumbnails } from '../services/pdfService';
import { CompressionSettings, CompressionResult, UploadedFile, AppStatus } from '../types';

const COMPRESSION_PROFILES: Record<string, CompressionSettings> = {
    low: { level: 'low', quality: 0.9, scale: 1.5 }, // Better Quality
    balanced: { level: 'balanced', quality: 0.75, scale: 1.0 }, // Standard 72DPI
    aggressive: { level: 'aggressive', quality: 0.5, scale: 0.8 }, // Max Compression
};

const CompressTool: React.FC = () => {
    const {
        files, pages, addFilesAndPages, replaceFileContent, setStatus,
        setError, status, setProcessingMessage, setProcessingProgress
    } = usePdfStore();

    // Selection State
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

    // Settings State
    const [profile, setProfile] = useState<string>('balanced');
    const [customSettings, setCustomSettings] = useState<CompressionSettings>({
        level: 'custom',
        quality: 0.7,
        scale: 1.0
    });

    // Processing State
    const [processingFileId, setProcessingFileId] = useState<string | null>(null);

    // Results State
    const [results, setResults] = useState<Map<string, CompressionResult>>(new Map());

    const downloadUrls = useMemo(() => {
        const map = new Map<string, string>();
        results.forEach((res, id) => {
            map.set(id, URL.createObjectURL(res.compressedBlob));
        });
        return map;
    }, [results]);

    React.useEffect(() => {
        return () => {
            downloadUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [downloadUrls]);

    const activeSettings = profile === 'custom' ? customSettings : COMPRESSION_PROFILES[profile];

    const filesArray = useMemo(() => Array.from(files.values()) as UploadedFile[], [files]);

    const toggleFile = (id: string) => {
        const next = new Set(selectedFileIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedFileIds(next);
    };

    const selectAll = () => {
        if (selectedFileIds.size === files.size) setSelectedFileIds(new Set());
        else setSelectedFileIds(new Set(files.keys()));
    };

    const handleCompress = async () => {
        if (selectedFileIds.size === 0) return;
        setStatus(AppStatus.PROCESSING);
        setError(null);
        setResults(new Map()); // Clear previous results

        try {
            const selectedFiles = filesArray.filter(f => selectedFileIds.has(f.id));
            const newResults = new Map<string, CompressionResult>();

            for (const file of selectedFiles) {
                setProcessingFileId(file.id);

                const result = await compressPdfFile(
                    file.file,
                    activeSettings.quality,
                    activeSettings.scale,
                    (curr, total) => {
                        setProcessingProgress(Math.round((curr / total) * 100));
                        setProcessingMessage(`Compressing ${file.name}... (Page ${curr}/${total})`);
                    }
                );

                newResults.set(file.id, {
                    originalFileId: file.id,
                    compressedBlob: result.blob,
                    filename: result.filename,
                    newSize: result.blob.size,
                    originalSize: file.size
                });
            }

            setResults(newResults);
            setStatus(AppStatus.SUCCESS);
            setProcessingMessage(null);
            setProcessingProgress(0);
        } catch (err: any) {
            console.error(err);
            setError("Compression failed. " + err.message);
            setProcessingMessage(null);
        } finally {
            setProcessingFileId(null);
        }
    };

    const handleReplace = async (result: CompressionResult) => {
        await replaceFileContent(result.originalFileId, result.compressedBlob, result.filename);
        // Remove from results to indicate action taken
        const nextResults = new Map(results);
        nextResults.delete(result.originalFileId);
        setResults(nextResults);
    };

    const handleAddAsNew = async (result: CompressionResult) => {
        const newFileObj = new File([result.compressedBlob], result.filename, { type: 'application/pdf' });
        const id = Math.random().toString(36).substr(2, 9);

        // We need a color, just pick one based on existing count
        const color = filesArray[0]?.color || '#0061A4';

        const newUploadedFile: UploadedFile = {
            id,
            file: newFileObj,
            name: result.filename,
            size: newFileObj.size,
            color
        };

        try {
            const extractedPages = await generateThumbnails(newUploadedFile);
            addFilesAndPages([newUploadedFile], extractedPages);

            const nextResults = new Map(results);
            nextResults.delete(result.originalFileId);
            setResults(nextResults);
        } catch (e) {
            console.error("Failed to add new file", e);
        }
    };

    if (files.size === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-8 animate-fade-in">
                <div className="w-20 h-20 bg-surfaceVariant rounded-full flex items-center justify-center text-secondary mb-4">
                    <i className="fa-solid fa-compress text-3xl"></i>
                </div>
                <h2 className="text-2xl font-display text-onSurfaceVariant mb-2">Compress PDF</h2>
                <p className="text-secondary mb-6 max-w-md">
                    Upload documents to your workspace first to use the compression tool.
                </p>
            </div>
        );
    }

    // --- Success View (Results) ---
    if (status === AppStatus.SUCCESS && results.size > 0) {
        return (
            <div className="max-w-4xl mx-auto h-full flex flex-col pb-20">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-2xl font-display text-onSurfaceVariant">Compression Results</h2>
                    <button
                        onClick={() => setStatus(AppStatus.IDLE)}
                        className="text-primary font-medium hover:bg-primaryContainer/20 px-4 py-2 rounded-full transition-colors"
                    >
                        Back to Selection
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {Array.from(results.values()).map((res: CompressionResult) => {
                        const savings = res.originalSize - res.newSize;
                        const pct = Math.round((savings / res.originalSize) * 100);
                        const isSmaller = savings > 0;

                        return (
                            <div key={res.originalFileId} className="bg-surface rounded-md3 p-6 border border-surfaceVariant shadow-sm flex flex-col md:flex-row items-center gap-6">
                                <div className="flex-1">
                                    <h3 className="font-medium text-lg text-onSurfaceVariant mb-1 truncate max-w-md" title={res.filename}>
                                        {res.filename}
                                    </h3>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-secondary line-through">{formatFileSize(res.originalSize)}</span>
                                        <i className="fa-solid fa-arrow-right text-secondary text-xs"></i>
                                        <span className={`font-bold ${isSmaller ? 'text-green-600' : 'text-onSurfaceVariant'}`}>
                                            {formatFileSize(res.newSize)}
                                        </span>
                                        {isSmaller && (
                                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">
                                                -{pct}%
                                            </span>
                                        )}
                                        {!isSmaller && <span className="text-orange-600 text-xs">Size increased (Try aggressive mode)</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <a
                                        href={downloadUrls.get(res.originalFileId)}
                                        download={res.filename}
                                        className="flex-1 md:flex-none h-10 px-4 rounded-full border border-outline/30 text-onSurfaceVariant hover:bg-surfaceVariant flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <i className="fa-solid fa-download"></i> Save
                                    </a>
                                    <button
                                        onClick={() => handleAddAsNew(res)}
                                        className="flex-1 md:flex-none h-10 px-4 rounded-full border border-outline/30 text-onSurfaceVariant hover:bg-surfaceVariant transition-colors"
                                    >
                                        Add as New
                                    </button>
                                    <button
                                        onClick={() => handleReplace(res)}
                                        className="flex-1 md:flex-none h-10 px-6 rounded-full bg-primary text-onPrimary hover:shadow-elevation-1 transition-all"
                                    >
                                        Replace
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    const pageCountByFile = useMemo(() => {
        const counts = new Map<string, number>();
        pages.forEach(p => counts.set(p.fileId, (counts.get(p.fileId) ?? 0) + 1));
        return counts;
    }, [pages]);

    // --- Main View ---
    return (
        <div className="flex flex-col lg:flex-row gap-8 min-h-full pb-12">
            {/* Left: File Selection */}
            <div className="flex-1 bg-surface rounded-md3 border border-surfaceVariant flex flex-col overflow-hidden min-h-[400px] max-h-[60vh] lg:max-h-none">
                <div className="p-4 border-b border-surfaceVariant bg-surfaceVariant/10 flex items-center justify-between">
                    <h3 className="font-medium text-onSurfaceVariant">Select Files to Compress</h3>
                    <button onClick={selectAll} className="text-sm text-primary font-medium hover:underline">
                        {selectedFileIds.size === files.size ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {filesArray.map(file => {
                        const pageCount = pageCountByFile.get(file.id) ?? 0;
                        const isSelected = selectedFileIds.has(file.id);
                        const isProcessing = processingFileId === file.id;

                        return (
                            <div
                                key={file.id}
                                onClick={() => !status.includes('processing') && toggleFile(file.id)}
                                className={`
                                group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border mb-2
                                ${isSelected ? 'bg-primaryContainer/20 border-primary' : 'border-transparent hover:bg-surfaceVariant/30'}
                                ${isProcessing ? 'opacity-70 pointer-events-none' : ''}
                            `}
                            >
                                <div className={`
                                w-5 h-5 rounded border flex items-center justify-center transition-colors
                                ${isSelected ? 'bg-primary border-primary text-onPrimary' : 'border-outline/40 bg-white group-hover:border-primary'}
                            `}>
                                    {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                                </div>

                                <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
                                    {isProcessing ? (
                                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                                    ) : (
                                        <i className="fa-regular fa-file-pdf"></i>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-onSurfaceVariant truncate">{file.name}</div>
                                    <div className="text-xs text-secondary flex items-center gap-2">
                                        <span>{formatFileSize(file.size)}</span>
                                        <span>•</span>
                                        <span>{pageCount} pages</span>
                                    </div>
                                    {isProcessing && (
                                        <div className="w-full h-1 bg-surfaceVariant rounded-full mt-2 overflow-hidden">
                                            {/* Progress bar removed since we use global overlay for better blocking */}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right: Settings */}
            <div className="w-full lg:w-[320px] flex flex-col gap-6">
                <div className="bg-surface rounded-md3 p-6 border border-surfaceVariant">
                    <h3 className="text-lg font-display text-onSurfaceVariant mb-4">Compression Settings</h3>

                    <div className="space-y-3 mb-6">
                        <label className="text-xs font-medium text-secondary uppercase tracking-wider">Profile</label>
                        {['low', 'balanced', 'aggressive'].map(key => (
                            <button
                                key={key}
                                onClick={() => setProfile(key)}
                                className={`w-full p-3 rounded-xl border text-left transition-all ${profile === key ? 'bg-secondaryContainer border-secondaryContainer text-onSecondaryContainer' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}
                            >
                                <div className="font-medium capitalize text-sm">{key} Compression</div>
                                <div className="text-xs opacity-70">
                                    {key === 'low' && 'Best quality, minor reduction'}
                                    {key === 'balanced' && 'Good trade-off for sharing'}
                                    {key === 'aggressive' && 'Max reduction, lower quality'}
                                </div>
                            </button>
                        ))}
                        <button
                            onClick={() => setProfile('custom')}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${profile === 'custom' ? 'bg-secondaryContainer border-secondaryContainer text-onSecondaryContainer' : 'border-outline/20 hover:bg-surfaceVariant/30'}`}
                        >
                            <div className="font-medium text-sm">Custom</div>
                        </button>
                    </div>

                    {profile === 'custom' && (
                        <div className="space-y-4 animate-fade-in mb-6 p-4 bg-surfaceVariant/20 rounded-xl">
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span>Image Quality</span>
                                    <span>{Math.round(customSettings.quality * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="10" max="100"
                                    value={customSettings.quality * 100}
                                    onChange={(e) => setCustomSettings({ ...customSettings, quality: Number(e.target.value) / 100 })}
                                    className="w-full accent-primary h-1 bg-outline/20 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span>Resolution Scale</span>
                                    <span>{customSettings.scale.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="5" max="20"
                                    value={customSettings.scale * 10}
                                    onChange={(e) => setCustomSettings({ ...customSettings, scale: Number(e.target.value) / 10 })}
                                    className="w-full accent-primary h-1 bg-outline/20 rounded-lg appearance-none cursor-pointer"
                                />
                                <p className="text-[10px] text-secondary mt-1">Lower scale = smaller file size (pixelation risk)</p>
                            </div>
                        </div>
                    )}

                    <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl mb-6">
                        <p className="text-xs text-yellow-800">
                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                            Files will be rasterized. Text selection and links will be removed to maximize compression.
                        </p>
                    </div>

                    <button
                        onClick={handleCompress}
                        disabled={selectedFileIds.size === 0 || status === AppStatus.PROCESSING}
                        className="w-full h-12 rounded-pill bg-primary text-onPrimary font-medium flex items-center justify-center gap-2 hover:shadow-elevation-1 transition-all ripple disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {status === AppStatus.PROCESSING ? (
                            <>Processing...</>
                        ) : (
                            <>Compress {selectedFileIds.size > 0 && `(${selectedFileIds.size})`}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompressTool;

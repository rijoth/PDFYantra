
import React, { useCallback, useState, useRef, useEffect } from 'react';
import PageGrid from './PageGrid';
import FileManager from './FileManager';
import PagePreview from './PagePreview';
import { UploadedFile, AppStatus } from '../types';
import { generateThumbnails, mergePages, formatFileSize } from '../services/pdfService';
import { usePdfStore } from '../store/usePdfStore';

const FILE_COLORS = ['#0061A4', '#B3261E', '#2D6B28', '#E68619', '#6750A4'];

// Internal component for highlighting search terms
const HighlightedText = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight) return <span>{text}</span>;
    const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 text-onSurface rounded-sm px-0.5 font-medium">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
};

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
        resetProcessing,
        // Search Props
        searchQuery,
        performSearch,
        searchResults,
        isSearching,
        searchProgress,
        clearSearch,
        setPreviewPageId
    } = usePdfStore();

    const [parsingFile, setParsingFile] = useState<string | null>(null);
    const [showFileManager, setShowFileManager] = useState(false);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [showSearchInput, setShowSearchInput] = useState(false);
    const [localQuery, setLocalQuery] = useState(searchQuery);

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localQuery !== searchQuery) {
                performSearch(localQuery);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [localQuery, performSearch, searchQuery]);

    // Sync local query if store updates
    useEffect(() => {
        setLocalQuery(searchQuery);
        if (searchQuery) setShowSearchInput(true);
    }, [searchQuery]);

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
                const blob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                setDownloadInfo({
                    url,
                    size: blob.size,
                    filename: `merged_document_${new Date().getTime()}.pdf`,
                    isZip: false
                });
                setStatus(AppStatus.SUCCESS);
            } catch (err: any) {
                setError(err.message);
            }
        }, 100);
    };

    const hasSelection = selectedPageIds.size > 0;
    const isSearchActive = !!searchQuery;

    // Render Search Results View
    const renderSearchResults = () => {
        const totalMatches = searchResults.reduce((acc, res) => acc + res.matches.length, 0);

        return (
            <div className="flex-1 overflow-y-auto space-y-4 animate-fade-in p-4">
                {/* Status / Progress */}
                {isSearching && (
                    <div className="flex items-center gap-3 bg-surfaceVariant/30 p-3 rounded-lg mb-4">
                        <div className="flex-1 h-1 bg-surfaceVariant rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${searchProgress}%` }}
                            ></div>
                        </div>
                        <span className="text-xs text-secondary font-medium min-w-[3rem] text-right">{searchProgress}%</span>
                    </div>
                )}

                {!isSearching && totalMatches === 0 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-surfaceVariant/50 rounded-full flex items-center justify-center mx-auto mb-4 text-secondary">
                            <i className="fa-regular fa-face-frown text-2xl"></i>
                        </div>
                        <h3 className="text-lg font-medium text-onSurfaceVariant">No matches found</h3>
                        <p className="text-secondary text-sm">Try checking your spelling.</p>
                    </div>
                )}

                {searchResults.map((result) => (
                    <div key={result.fileId} className="bg-surface rounded-md3 border border-surfaceVariant overflow-hidden shadow-sm animate-slide-up">
                        <div className="bg-surfaceVariant/30 px-4 py-2 border-b border-surfaceVariant/50 flex items-center gap-3">
                            <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style={{ backgroundColor: result.fileColor }}>
                                PDF
                            </div>
                            <h3 className="font-medium text-sm text-onSurfaceVariant truncate">{result.fileName}</h3>
                            <span className="ml-auto bg-surface px-2 py-0.5 rounded-full text-[10px] font-medium text-secondary border border-outline/20">
                                {result.matches.length} matches
                            </span>
                        </div>

                        <div className="divide-y divide-surfaceVariant/50">
                            {result.matches.map((match, idx) => (
                                <div
                                    key={`${match.pageId}-${idx}`}
                                    className="p-3 hover:bg-primaryContainer/5 transition-colors cursor-pointer group"
                                    onClick={() => setPreviewPageId(match.pageId)}
                                >
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-12 flex flex-col items-center justify-center pt-1 border-r border-surfaceVariant/50 pr-2">
                                            <span className="text-[9px] text-secondary uppercase tracking-wider font-bold">Page</span>
                                            <span className="text-lg font-display font-bold text-onSurfaceVariant group-hover:text-primary transition-colors">{match.pageNumber}</span>
                                        </div>
                                        <div className="flex-1 text-sm text-secondary leading-relaxed self-center">
                                            <HighlightedText text={match.snippet} highlight={localQuery} />
                                        </div>
                                        <div className="flex items-center text-outline/30 group-hover:text-primary transition-colors px-2">
                                            <i className="fa-regular fa-eye"></i>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
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
        <div className="relative min-h-[500px] flex flex-col">
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
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center flex-1 min-w-0">
                    {pages.length > 0 && !isSearchActive && (
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
                                className={`h-9 px-4 rounded-lg text-sm font-medium border flex items-center gap-2 whitespace-nowrap transition-colors ${isSelectionMode
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

                    {/* Search Input Area */}
                    {pages.length > 0 && (
                        <div className={`flex items-center transition-all duration-300 ${showSearchInput || isSearchActive ? 'flex-1 ml-0' : 'ml-0'}`}>
                            {!showSearchInput && !isSearchActive ? (
                                <button
                                    onClick={() => { setShowSearchInput(true); }}
                                    className="h-9 px-4 rounded-lg text-sm font-medium border border-outline text-onSurfaceVariant hover:bg-surfaceVariant/30 flex items-center gap-2 whitespace-nowrap ml-2"
                                >
                                    <i className="fa-solid fa-magnifying-glass"></i> Search
                                </button>
                            ) : (
                                <div className="relative w-full max-w-md animate-scale-in">
                                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-xs"></i>
                                    <input
                                        type="text"
                                        placeholder="Search text..."
                                        autoFocus
                                        className="w-full h-9 pl-9 pr-8 bg-surfaceVariant/30 border border-outline/20 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-onSurfaceVariant placeholder:text-secondary"
                                        value={localQuery}
                                        onChange={(e) => setLocalQuery(e.target.value)}
                                    />
                                    <button
                                        onClick={() => {
                                            setLocalQuery('');
                                            clearSearch();
                                            setShowSearchInput(false);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-secondary hover:bg-surfaceVariant transition-colors"
                                    >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex gap-2 ml-auto">
                    {hasSelection && !isSearchActive && (
                        <button
                            onClick={() => deleteSelectedPages()}
                            className="h-10 w-10 rounded-full flex items-center justify-center text-onSurfaceVariant hover:bg-surfaceVariant/50 transition-colors ripple"
                            title="Delete"
                        >
                            <i className="fa-regular fa-trash-can"></i>
                        </button>
                    )}

                    {!isSearchActive && (
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
                    )}
                </div>
            </div>

            {/* Main Content Surface */}
            <div className={`flex-1 bg-surface rounded-md3 p-1 relative min-h-[500px] transition-colors flex flex-col ${isSelectionMode && !isSearchActive ? 'ring-2 ring-primaryContainer ring-inset' : ''}`}>
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
                    isSearchActive ? (
                        renderSearchResults()
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
                    )
                )}
            </div>

            {/* Floating Action Button (FAB) - Hidden during Search */}
            {!isSearchActive && (
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
            )}

            {/* Contextual Action Bar (Bottom Sheet style for Actions) */}
            <div className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${hasSelection && !isSearchActive ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
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

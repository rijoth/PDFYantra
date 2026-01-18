
import React, { useEffect, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import PagePreview from './PagePreview';

const SearchTool: React.FC = () => {
  const { 
    searchQuery, 
    performSearch, 
    searchResults, 
    isSearching, 
    searchProgress,
    files, 
    pages, 
    setPreviewPageId 
  } = usePdfStore();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  // Debounce input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(localQuery);
    }, 500);

    return () => clearTimeout(handler);
  }, [localQuery]);

  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery !== searchQuery) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery, performSearch, searchQuery]);

  // Synchronize local state if store updates externally
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const totalMatches = searchResults.reduce((acc, res) => acc + res.matches.length, 0);

  // Helper to highlight the snippet text
  const HighlightedText = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight) return <span>{text}</span>;
    
    // Escape regex characters
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

  if (pages.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center p-8 animate-fade-in">
            <div className="w-20 h-20 bg-surfaceVariant rounded-full flex items-center justify-center text-secondary mb-4">
                <i className="fa-solid fa-magnifying-glass text-3xl"></i>
            </div>
            <h2 className="text-2xl font-display text-onSurfaceVariant mb-2">Search Workspace</h2>
            <p className="text-secondary mb-6 max-w-md">
                Upload documents to enable full-text search across your workspace.
            </p>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto pb-12 relative">
      <PagePreview />
      
      {/* Search Header */}
      <div className="bg-surface rounded-md3 p-6 border border-surfaceVariant shadow-sm mb-6">
         <div className="relative">
             <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-secondary"></i>
             <input 
                type="text" 
                placeholder="Search text across all files..." 
                className="w-full h-12 pl-12 pr-4 bg-surfaceVariant/30 border border-outline/20 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-onSurfaceVariant placeholder:text-secondary"
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                autoFocus
             />
             {localQuery && (
                 <button 
                    onClick={() => setLocalQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-secondary hover:bg-surfaceVariant transition-colors"
                 >
                     <i className="fa-solid fa-xmark"></i>
                 </button>
             )}
         </div>

         {/* Status / Progress */}
         {isSearching && (
             <div className="mt-4 flex items-center gap-3">
                 <div className="flex-1 h-1 bg-surfaceVariant rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${searchProgress}%` }}
                     ></div>
                 </div>
                 <span className="text-xs text-secondary font-medium min-w-[3rem] text-right">{searchProgress}%</span>
             </div>
         )}
         
         {!isSearching && debouncedQuery && (
             <div className="mt-3 text-sm text-secondary flex items-center gap-2">
                 <span>Found {totalMatches} results in {searchResults.length} files.</span>
                 <span className="w-1 h-1 bg-outline/40 rounded-full"></span>
                 <span>Searched {files.size} documents.</span>
             </div>
         )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto space-y-4 animate-fade-in">
          {!isSearching && debouncedQuery && totalMatches === 0 && (
              <div className="text-center py-12">
                  <div className="w-16 h-16 bg-surfaceVariant/50 rounded-full flex items-center justify-center mx-auto mb-4 text-secondary">
                      <i className="fa-regular fa-face-frown text-2xl"></i>
                  </div>
                  <h3 className="text-lg font-medium text-onSurfaceVariant">No matches found</h3>
                  <p className="text-secondary text-sm">Try checking your spelling or using a different keyword.</p>
              </div>
          )}

          {searchResults.map((result) => (
              <div key={result.fileId} className="bg-surface rounded-md3 border border-surfaceVariant overflow-hidden shadow-sm animate-slide-up">
                  {/* File Header */}
                  <div className="bg-surfaceVariant/30 px-6 py-3 border-b border-surfaceVariant/50 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ backgroundColor: result.fileColor }}>
                          PDF
                      </div>
                      <h3 className="font-medium text-onSurfaceVariant truncate">{result.fileName}</h3>
                      <span className="ml-auto bg-surface px-2 py-0.5 rounded-full text-xs font-medium text-secondary border border-outline/20">
                          {result.matches.length} matches
                      </span>
                  </div>
                  
                  {/* Matches */}
                  <div className="divide-y divide-surfaceVariant/50">
                      {result.matches.map((match, idx) => (
                          <div 
                              key={`${match.pageId}-${idx}`} 
                              className="p-4 hover:bg-primaryContainer/5 transition-colors cursor-pointer group"
                              onClick={() => setPreviewPageId(match.pageId)}
                          >
                              <div className="flex gap-4">
                                  {/* Page Number Indicator */}
                                  <div className="flex-shrink-0 w-16 flex flex-col items-center justify-center pt-1">
                                      <span className="text-[10px] text-secondary uppercase tracking-wider font-bold mb-1">Page</span>
                                      <span className="text-xl font-display font-bold text-onSurfaceVariant group-hover:text-primary transition-colors">{match.pageNumber}</span>
                                  </div>
                                  
                                  {/* Text Snippet */}
                                  <div className="flex-1 text-sm text-secondary leading-relaxed">
                                      <HighlightedText text={match.snippet} highlight={debouncedQuery} />
                                  </div>

                                  {/* Action Arrow */}
                                  <div className="flex items-center text-outline/30 group-hover:text-primary transition-colors">
                                      <i className="fa-solid fa-chevron-right"></i>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          ))}
      </div>
    </div>
  );
};

export default SearchTool;

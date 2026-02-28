import React, { useEffect, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';

const TopAppBar: React.FC = () => {
  const { files, pages, clearWorkspace } = usePdfStore();
  const fileCount = files.size;
  const pageCount = pages.length;

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initialize state based on current DOM class (set by index.html script)
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDark(true);
    }
  };

  return (
    <header className="h-[72px] flex items-center px-4 md:px-8 bg-surface/80 backdrop-blur-md transition-colors sticky top-0 z-40 gap-4 border-b border-surfaceVariant/20">
      <div className="flex-1 flex items-center min-w-0">
        {/* Brand Logo Component */}
        <div className="flex items-center gap-3 group cursor-default select-none">
          {/* Animated Icon Mark */}
          <div className="relative w-9 h-9 flex-shrink-0 perspective-1000">
            <svg viewBox="0 0 32 32" className="w-full h-full overflow-visible" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.1" />
                </filter>
              </defs>

              {/* Back Layer (Ghost Page) */}
              <rect
                x="6" y="8" width="16" height="20" rx="2"
                className="fill-surfaceVariant stroke-outline/20 stroke-1 transition-transform duration-500 ease-out origin-bottom-left group-hover:-translate-x-1 group-hover:rotate-[-6deg]"
              />

              {/* Front Layer (Primary Page) */}
              <rect
                x="10" y="4" width="16" height="20" rx="2"
                className="fill-primary stroke-primaryContainer stroke-1 transition-transform duration-500 ease-out origin-bottom-left group-hover:translate-x-1 group-hover:rotate-[4deg]"
                filter="url(#shadow-sm)"
              />

              {/* Technical Lines / Content */}
              <path
                d="M14 10H22"
                className="stroke-onPrimary stroke-[2] stroke-linecap-round opacity-90"
              />
              <path
                d="M14 14H22"
                className="stroke-onPrimary stroke-[2] stroke-linecap-round opacity-60"
              />
              <path
                d="M14 18H19"
                className="stroke-onPrimary stroke-[2] stroke-linecap-round opacity-80"
              />

              {/* Accent Dot */}
              <circle cx="21" cy="18" r="1.5" className="fill-primaryContainer animate-pulse" />
            </svg>
          </div>

          {/* Typographic Lockup */}
          <div className="flex flex-col justify-center relative">
            <h1 className="flex items-baseline leading-none text-[22px]">
              <span className="font-display font-bold text-onSurfaceVariant tracking-tight transition-colors duration-300 group-hover:text-primary">PDF</span>
              <span className="font-sans font-medium text-secondary tracking-wide ml-0.5">Yantra</span>
            </h1>
            {/* Active Indicator Line */}
            <span className="absolute -bottom-1 left-0 h-[2.5px] w-0 bg-gradient-to-r from-primary to-transparent rounded-full transition-all duration-500 ease-out group-hover:w-full opacity-0 group-hover:opacity-100"></span>
          </div>
        </div>
      </div>

      {/* Workspace Summary Indicator & History Controls */}
      {fileCount > 0 && (
        <div className="hidden md:flex items-center mr-4 animate-fade-in flex-shrink-0 gap-3">
          <div className="flex items-center bg-surfaceVariant/30 rounded-full p-1 border border-outline/10">
            <button
              onClick={() => usePdfStore.getState().undo()}
              disabled={usePdfStore.getState().past.length === 0 || usePdfStore.getState().isHistoryLocked}
              className="w-8 h-8 rounded-full flex items-center justify-center text-onSurfaceVariant hover:bg-surfaceVariant disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Undo (Ctrl+Z)"
            >
              <i className="fa-solid fa-rotate-left text-sm"></i>
            </button>
            <button
              onClick={() => usePdfStore.getState().redo()}
              disabled={usePdfStore.getState().future.length === 0 || usePdfStore.getState().isHistoryLocked}
              className="w-8 h-8 rounded-full flex items-center justify-center text-onSurfaceVariant hover:bg-surfaceVariant disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Redo (Ctrl+Y)"
            >
              <i className="fa-solid fa-rotate-right text-sm"></i>
            </button>
          </div>

          <div className="bg-surfaceVariant/50 border border-outline/20 rounded-full px-4 py-1.5 flex items-center gap-3 text-xs font-medium text-onSurfaceVariant transition-all hover:bg-surfaceVariant">
            <span className="flex items-center gap-1.5">
              <i className="fa-regular fa-file-pdf text-primary"></i>
              {fileCount} {fileCount === 1 ? 'File' : 'Files'}
            </span>
            <span className="w-1 h-1 rounded-full bg-outline/40"></span>
            <span className="flex items-center gap-1.5">
              <i className="fa-regular fa-copy text-primary"></i>
              {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}
            </span>
            <button
              onClick={clearWorkspace}
              className="ml-2 w-5 h-5 rounded-full hover:bg-error/10 hover:text-red-600 flex items-center justify-center transition-colors"
              title="Clear Workspace"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full hover:bg-surfaceVariant/50 flex items-center justify-center text-onSurfaceVariant transition-colors ripple"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          <i className={`fa-solid ${isDark ? 'fa-sun text-yellow-400' : 'fa-moon text-secondary'} text-lg transition-transform duration-300 ${isDark ? 'rotate-180' : 'rotate-0'}`}></i>
        </button>

        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-primaryContainer/30 rounded-pill border border-transparent hover:border-primaryContainer/50 transition-colors cursor-help" title="All processing happens in your browser">
          <i className="fa-solid fa-shield-halved text-primary text-sm"></i>
          <span className="text-xs font-medium text-onSurfaceVariant">Local Engine</span>
        </div>
      </div>
    </header>
  );
};

export default TopAppBar;
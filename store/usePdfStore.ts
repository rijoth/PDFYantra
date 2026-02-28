

import { create } from 'zustand';
import { AppStatus, PDFPage, ProcessingResult, ToolType, UploadedFile, SearchResult, HistoryEntry } from '../types';
import { clearSession } from '../services/storageService';
import { generateThumbnails } from '../services/pdfService';
import { searchWorkspace, clearSearchCache } from '../services/searchService';

interface PdfState {
  // --- Workspace Data ---
  activeTool: ToolType;
  files: Map<string, UploadedFile>;
  pages: PDFPage[];
  selectedPageIds: Set<string>;

  // --- UI/Processing State ---
  status: AppStatus;
  errorMessage: string | null;
  downloadInfo: ProcessingResult | null;
  isInitialized: boolean;
  previewPageId: string | null;
  hasRecoveredSession: boolean;

  // --- History State ---
  past: HistoryEntry[];
  future: HistoryEntry[];
  isHistoryLocked: boolean;

  // --- Search State ---
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  searchProgress: number;

  // --- Global Processing State ---
  processingProgress: number; // 0-100
  processingMessage: string | null;

  // --- Actions ---
  setActiveTool: (tool: ToolType) => void;
  setInitialized: (val: boolean) => void;
  restoreSession: (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType) => void;
  setHasRecoveredSession: (val: boolean) => void;
  dismissRecoveryIndication: () => void;

  // File & Page Management
  addFilesAndPages: (newFiles: UploadedFile[], newPages: PDFPage[]) => void;
  replaceFileContent: (fileId: string, newBlob: Blob, newFilename: string) => Promise<void>;
  removeFile: (fileId: string) => void;
  removePage: (pageId: string) => void;
  setPages: (pages: PDFPage[]) => void; // For reordering
  sortPagesByFileOrder: (orderedFileIds: string[]) => void;
  clearWorkspace: () => void;

  // Selection
  toggleSelectPage: (pageId: string, isMulti: boolean) => void;
  selectAllPages: () => void;
  deselectAllPages: () => void;

  // Manipulation
  rotatePage: (pageId: string, direction: 'cw' | 'ccw') => void;
  rotateSelectedPages: (direction: 'cw' | 'ccw') => void;
  deleteSelectedPages: () => void;

  // Processing Flow
  setStatus: (status: AppStatus) => void;
  setError: (msg: string | null) => void;
  setDownloadInfo: (info: ProcessingResult | null) => void;
  resetProcessing: () => void;

  // Preview
  setPreviewPageId: (id: string | null) => void;

  // Search
  performSearch: (query: string) => Promise<void>;
  clearSearch: () => void;

  // Global Processing Actions
  setProcessingProgress: (progress: number) => void;
  setProcessingMessage: (message: string | null) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  pushToHistory: () => void;
  lockHistory: () => void;
  unlockHistory: () => void;

  // Duplication
  duplicateSelectedPages: () => void;

  // --- Password Prompt State ---
  passwordPrompt: { filename: string; isRetry: boolean; resolve: (pwd: string | null) => void } | null;
  promptForPassword: (filename: string, isRetry: boolean) => Promise<string | null>;
  resolvePasswordPrompt: (password: string | null) => void;
}

export const usePdfStore = create<PdfState>((set, get) => ({
  // Initial State
  activeTool: 'home',
  files: new Map(),
  pages: [],
  selectedPageIds: new Set(),
  status: AppStatus.IDLE,
  errorMessage: null,
  downloadInfo: null,
  isInitialized: false,
  previewPageId: null,
  hasRecoveredSession: false,

  // Search Initial State
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchProgress: 0,

  // Global Processing Initial State
  processingProgress: 0,
  processingMessage: null,

  // History Initial State
  past: [],
  future: [],
  isHistoryLocked: false,

  // Password Prompt Initial State
  passwordPrompt: null,

  // --- Actions ---

  pushToHistory: () => {
    const { pages, selectedPageIds, isHistoryLocked } = get();
    if (isHistoryLocked) return;

    set((state) => ({
      past: [
        ...state.past,
        {
          pages: [...state.pages], // Shallow copy is enough as objects are treated as immutable
          selectedPageIds: new Set(state.selectedPageIds),
          timestamp: Date.now()
        }
      ].slice(-50), // Keep last 50 actions
      future: [] // New action clears future
    }));
  },

  undo: () => {
    const { past, pages, selectedPageIds, isHistoryLocked } = get();
    if (isHistoryLocked || past.length === 0) return;

    const previous = past[past.length - 1];
    const remainingPast = past.slice(0, past.length - 1);

    set({
      pages: previous.pages,
      selectedPageIds: previous.selectedPageIds,
      past: remainingPast,
      future: [
        {
          pages: [...pages],
          selectedPageIds: new Set(selectedPageIds),
          timestamp: Date.now()
        },
        ...get().future
      ]
    });
  },

  redo: () => {
    const { future, pages, selectedPageIds, isHistoryLocked } = get();
    if (isHistoryLocked || future.length === 0) return;

    const next = future[0];
    const remainingFuture = future.slice(1);

    set({
      pages: next.pages,
      selectedPageIds: next.selectedPageIds,
      future: remainingFuture,
      past: [
        ...get().past,
        {
          pages: [...pages],
          selectedPageIds: new Set(selectedPageIds),
          timestamp: Date.now()
        }
      ]
    });
  },

  lockHistory: () => set({ isHistoryLocked: true }),
  unlockHistory: () => set({ isHistoryLocked: false }),

  setActiveTool: (tool) => set({
    activeTool: tool,
    status: AppStatus.IDLE,
    errorMessage: null,
    downloadInfo: null,
    // Clear search results when switching tools if desired, or keep them. 
    // Keeping them allows switching back to results.
  }),

  setInitialized: (val) => set({ isInitialized: val }),

  restoreSession: (files, pages, activeTool) => set({
    files,
    pages,
    status: AppStatus.IDLE,
    activeTool: activeTool || (pages.length > 0 ? 'merge' : 'home')
  }),

  setHasRecoveredSession: (val) => set({ hasRecoveredSession: val }),

  dismissRecoveryIndication: () => set({ hasRecoveredSession: false }),

  addFilesAndPages: (newFiles, newPages) => {
    get().pushToHistory();
    set((state) => {
      const nextFiles = new Map(state.files);
      newFiles.forEach(f => nextFiles.set(f.id, f));

      return {
        files: nextFiles,
        pages: [...state.pages, ...newPages],
        status: state.status === AppStatus.SUCCESS ? AppStatus.IDLE : state.status,
        downloadInfo: state.status === AppStatus.SUCCESS ? null : state.downloadInfo
      };
    });
  },

  replaceFileContent: async (fileId, newBlob, newFilename) => {
    const state = get();
    const existingFile = state.files.get(fileId);

    if (!existingFile) return;

    get().pushToHistory();
    // 1. Create new File object
    const newFileObj = new File([newBlob], newFilename, { type: 'application/pdf' });

    const updatedUploadedFile: UploadedFile = {
      ...existingFile,
      file: newFileObj,
      name: newFilename,
      size: newFileObj.size
    };

    // 2. Generate new thumbnails
    // Note: This is an async operation inside a store action. 
    // Ideally, thumbnails generation should happen in a service, but here we need to sync state.
    const newPages = await generateThumbnails(updatedUploadedFile);

    // Clear search cache because content changed
    clearSearchCache();

    // 3. Update Store
    set((currentState) => {
      const nextFiles = new Map(currentState.files);
      nextFiles.set(fileId, updatedUploadedFile);

      // Update pages: We need to preserve the relative order/position of the pages
      // belonging to this file, but their content has changed.
      // Since compression preserves page count usually, we can map 1:1.

      const nextAllPages = currentState.pages.map(p => {
        if (p.fileId === fileId) {
          // Find corresponding new page by index
          const match = newPages.find(np => np.pageIndex === p.pageIndex);
          if (match) {
            return {
              ...p,
              thumbnailUrl: match.thumbnailUrl
              // We preserve ID and rotation from the workspace
            };
          }
        }
        return p;
      });

      return {
        files: nextFiles,
        pages: nextAllPages
      };
    });
  },

  removeFile: (fileId) => {
    get().pushToHistory();
    set((state) => {
      const nextFiles = new Map(state.files);
      nextFiles.delete(fileId);

      const nextPages = state.pages.filter(p => p.fileId !== fileId);

      const nextSelected = new Set(state.selectedPageIds);
      state.pages
        .filter(p => p.fileId === fileId)
        .forEach(p => nextSelected.delete(p.id));

      return {
        files: nextFiles,
        pages: nextPages,
        selectedPageIds: nextSelected
      };
    });
  },

  removePage: (pageId) => {
    get().pushToHistory();
    set((state) => {
      const nextSelected = new Set(state.selectedPageIds);
      nextSelected.delete(pageId);
      return {
        pages: state.pages.filter(p => p.id !== pageId),
        selectedPageIds: nextSelected
      };
    });
  },

  setPages: (newPages) => {
    // Only push to history if order actually changed
    const currentPages = get().pages;
    const changed = currentPages.length !== newPages.length ||
      currentPages.some((p, i) => p.id !== newPages[i].id);

    if (changed) {
      get().pushToHistory();
    }
    set({ pages: newPages });
  },

  duplicateSelectedPages: () => {
    const { pages, selectedPageIds } = get();
    if (selectedPageIds.size === 0) return;

    get().pushToHistory();

    const newPages: PDFPage[] = [];
    pages.forEach(p => {
      newPages.push(p);
      if (selectedPageIds.has(p.id)) {
        newPages.push({
          ...p,
          id: Math.random().toString(36).substr(2, 9),
          // Copying same fileId and thumbnail
        });
      }
    });

    set({ pages: newPages });
  },

  sortPagesByFileOrder: (orderedFileIds) => set((state) => {
    const newPages: PDFPage[] = [];
    const currentPages = [...state.pages];

    orderedFileIds.forEach(fileId => {
      const filePages = currentPages.filter(p => p.fileId === fileId);
      newPages.push(...filePages);
    });

    return { pages: newPages };
  }),

  clearWorkspace: () => {
    const { downloadInfo } = get();
    if (downloadInfo?.url) {
      URL.revokeObjectURL(downloadInfo.url);
    }

    // Also clear the persistent storage
    clearSession();
    clearSearchCache();

    set({
      files: new Map(),
      pages: [],
      selectedPageIds: new Set(),
      status: AppStatus.IDLE,
      errorMessage: null,
      downloadInfo: null,
      previewPageId: null,
      searchQuery: '',
      searchResults: []
    });
  },

  // --- Selection Logic ---

  toggleSelectPage: (pageId, isMulti) => set((state) => {
    const nextSelected = new Set(isMulti ? state.selectedPageIds : []);
    if (nextSelected.has(pageId) && isMulti) {
      nextSelected.delete(pageId);
    } else {
      nextSelected.add(pageId);
    }
    return { selectedPageIds: nextSelected };
  }),

  selectAllPages: () => set((state) => {
    // Toggle: if all selected, deselect all. Otherwise select all.
    if (state.selectedPageIds.size === state.pages.length) {
      return { selectedPageIds: new Set() };
    }
    return { selectedPageIds: new Set(state.pages.map(p => p.id)) };
  }),

  deselectAllPages: () => set({ selectedPageIds: new Set() }),

  // --- Manipulation Logic ---

  rotatePage: (pageId, direction) => {
    get().pushToHistory();
    set((state) => ({
      pages: state.pages.map(p => {
        if (p.id === pageId) {
          const delta = direction === 'cw' ? 90 : -90;
          let newRot = (p.rotation + delta) % 360;
          if (newRot < 0) newRot += 360;
          return { ...p, rotation: newRot };
        }
        return p;
      })
    }));
  },

  rotateSelectedPages: (direction) => {
    const { selectedPageIds } = get();
    if (selectedPageIds.size === 0) return;

    get().pushToHistory();
    set((state) => {
      return {
        pages: state.pages.map(p => {
          if (state.selectedPageIds.has(p.id)) {
            const delta = direction === 'cw' ? 90 : -90;
            let newRot = (p.rotation + delta) % 360;
            if (newRot < 0) newRot += 360;
            return { ...p, rotation: newRot };
          }
          return p;
        })
      };
    });
  },

  deleteSelectedPages: () => {
    const { selectedPageIds } = get();
    if (selectedPageIds.size === 0) return;

    get().pushToHistory();
    set((state) => {
      return {
        pages: state.pages.filter(p => !state.selectedPageIds.has(p.id)),
        selectedPageIds: new Set()
      };
    });
  },

  // --- Processing UI ---

  setStatus: (status) => set({ status }),
  setError: (errorMessage) => set({ errorMessage, status: AppStatus.ERROR }),
  setDownloadInfo: (downloadInfo) => set({ downloadInfo }),

  resetProcessing: () => {
    const { downloadInfo } = get();
    if (downloadInfo?.url) {
      URL.revokeObjectURL(downloadInfo.url);
    }
    set({
      status: AppStatus.IDLE,
      errorMessage: null,
      downloadInfo: null
    });
  },

  setPreviewPageId: (id) => set({ previewPageId: id }),

  // --- Search Logic ---

  performSearch: async (query: string) => {
    set({ searchQuery: query });

    if (!query.trim()) {
      set({ searchResults: [], isSearching: false, searchProgress: 0 });
      return;
    }

    set({ isSearching: true, searchProgress: 0 });
    const { files, pages } = get();

    try {
      const results = await searchWorkspace(
        query,
        files,
        pages,
        (curr, total) => set({ searchProgress: Math.round((curr / total) * 100) })
      );
      set({ searchResults: results, isSearching: false });
    } catch (err) {
      console.error(err);
      set({ isSearching: false, errorMessage: "Search failed" });
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [], searchProgress: 0 }),

  setProcessingProgress: (progress) => set({ processingProgress: progress }),
  setProcessingMessage: (message) => set({ processingMessage: message }),

  promptForPassword: (filename, isRetry) => {
    const { passwordPrompt } = get();
    if (passwordPrompt) {
      passwordPrompt.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      set({ passwordPrompt: { filename, isRetry, resolve } });
    });
  },

  resolvePasswordPrompt: (password) => {
    const { passwordPrompt } = get();
    if (passwordPrompt) {
      passwordPrompt.resolve(password);
      set({ passwordPrompt: null });
    }
  },
}));

// Automatic sync with IndexedDB
let saveTimer: ReturnType<typeof setTimeout> | null = null;

usePdfStore.subscribe(
  (state, prevState) => {
    // Only save if files, pages, or activeTool changed
    if (
      state.files !== prevState.files ||
      state.pages !== prevState.pages ||
      state.activeTool !== prevState.activeTool
    ) {
      if (!state.isInitialized) return;

      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        import('../services/storageService').then(({ saveSession }) => {
          saveSession(state.files, state.pages, state.activeTool);
        });
      }, 400);
    }
  }
);



import { create } from 'zustand';
import { AppStatus, PDFPage, ProcessingResult, ToolType, UploadedFile, SearchResult } from '../types';
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
  
  // --- Search State ---
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  searchProgress: number;

  // --- Actions ---
  setActiveTool: (tool: ToolType) => void;
  setInitialized: (val: boolean) => void;
  restoreSession: (files: Map<string, UploadedFile>, pages: PDFPage[]) => void;
  
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

  // Search Initial State
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchProgress: 0,

  // --- Actions ---

  setActiveTool: (tool) => set({ 
    activeTool: tool,
    status: AppStatus.IDLE,
    errorMessage: null,
    downloadInfo: null,
    // Clear search results when switching tools if desired, or keep them. 
    // Keeping them allows switching back to results.
  }),

  setInitialized: (val) => set({ isInitialized: val }),

  restoreSession: (files, pages) => set({
    files,
    pages,
    status: AppStatus.IDLE,
    activeTool: pages.length > 0 ? 'merge' : 'home'
  }),

  addFilesAndPages: (newFiles, newPages) => set((state) => {
    // Create new Map to ensure immutability
    const nextFiles = new Map(state.files);
    newFiles.forEach(f => nextFiles.set(f.id, f));

    return {
      files: nextFiles,
      pages: [...state.pages, ...newPages],
      // Reset success state if we add new files after a download
      status: state.status === AppStatus.SUCCESS ? AppStatus.IDLE : state.status,
      downloadInfo: state.status === AppStatus.SUCCESS ? null : state.downloadInfo
    };
  }),

  replaceFileContent: async (fileId, newBlob, newFilename) => {
      const state = get();
      const existingFile = state.files.get(fileId);
      
      if (!existingFile) return;

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

  removeFile: (fileId) => set((state) => {
    const nextFiles = new Map(state.files);
    nextFiles.delete(fileId);
    
    // Cascading delete: remove pages belonging to this file
    const nextPages = state.pages.filter(p => p.fileId !== fileId);
    
    // Clean up selection
    const nextSelected = new Set(state.selectedPageIds);
    state.pages
      .filter(p => p.fileId === fileId)
      .forEach(p => nextSelected.delete(p.id));

    return {
      files: nextFiles,
      pages: nextPages,
      selectedPageIds: nextSelected
    };
  }),

  removePage: (pageId) => set((state) => {
    const nextSelected = new Set(state.selectedPageIds);
    nextSelected.delete(pageId);
    return {
      pages: state.pages.filter(p => p.id !== pageId),
      selectedPageIds: nextSelected
    };
  }),

  setPages: (newPages) => set({ pages: newPages }),

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

  rotatePage: (pageId, direction) => set((state) => ({
    pages: state.pages.map(p => {
      if (p.id === pageId) {
        const delta = direction === 'cw' ? 90 : -90;
        let newRot = (p.rotation + delta) % 360;
        if (newRot < 0) newRot += 360;
        return { ...p, rotation: newRot };
      }
      return p;
    })
  })),

  rotateSelectedPages: (direction) => set((state) => {
    if (state.selectedPageIds.size === 0) return {};
    
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
  }),

  deleteSelectedPages: () => set((state) => {
    if (state.selectedPageIds.size === 0) return {};
    return {
      pages: state.pages.filter(p => !state.selectedPageIds.has(p.id)),
      selectedPageIds: new Set()
    };
  }),

  // --- Processing UI ---
  
  setStatus: (status) => set({ status }),
  setError: (errorMessage) => set({ errorMessage, status: AppStatus.ERROR }),
  setDownloadInfo: (downloadInfo) => set({ downloadInfo }),
  
  resetProcessing: () => set({
    status: AppStatus.IDLE,
    errorMessage: null,
    downloadInfo: null
  }),

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
        (curr, total) => set({ searchProgress: Math.round((curr/total) * 100) })
      );
      set({ searchResults: results, isSearching: false });
    } catch (err) {
      console.error(err);
      set({ isSearching: false, errorMessage: "Search failed" });
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [], searchProgress: 0 })
}));

import { UploadedFile, PDFPage, ToolType } from '../types';

const DB_NAME = 'PDFYantraDB';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_METADATA = 'metadata';

interface WorkspaceState {
  files: Map<string, UploadedFile>;
  pages: PDFPage[];
  activeTool: ToolType;
}

/**
 * Open/Initialize IndexedDB
 */
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
      }
    };
  });
};

/**
 * Saves the current workspace state to IndexedDB.
 * Uses a readwrite transaction to store files and metadata.
 */
export const saveSession = async (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType) => {
  try {
    const db = await initDB();
    const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');

    // Save Files
    const filesStore = tx.objectStore(STORE_FILES);

    // We clear files first to ensure we don't keep deleted files in storage
    // In a more complex app we might diff, but for this size, clearing is safe and simple
    await new Promise<void>((resolve, reject) => {
      const req = filesStore.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Store actual File objects (Blobs)
    for (const file of Array.from(files.values())) {
      filesStore.put(file);
    }

    // Save Metadata (Pages & Order)
    const metaStore = tx.objectStore(STORE_METADATA);
    metaStore.put({ key: 'pages', value: pages });
    metaStore.put({ key: 'activeTool', value: activeTool });
    metaStore.put({ key: 'lastUpdated', value: Date.now() });

    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save session locally:', err);
    // We swallow the error here to avoid interrupting the user flow, 
    // as persistence is a secondary convenience feature.
  }
};

/**
 * Loads the saved workspace state from IndexedDB.
 */
export const loadSession = async (): Promise<WorkspaceState | null> => {
  try {
    const db = await initDB();
    const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readonly');

    const filesStore = tx.objectStore(STORE_FILES);
    const metaStore = tx.objectStore(STORE_METADATA);

    const filesReq = filesStore.getAll();
    const pagesReq = metaStore.get('pages');
    const activeToolReq = metaStore.get('activeTool');

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        const filesArray: UploadedFile[] = filesReq.result || [];
        const pagesWrapper = pagesReq.result;
        const activeToolResult = activeToolReq.result;

        if (filesArray.length === 0 && !pagesWrapper) {
          resolve(null);
          return;
        }

        const filesMap = new Map<string, UploadedFile>();
        filesArray.forEach(f => {
          // Reconstruct the file object if needed, though IDB usually stores structured clones
          filesMap.set(f.id, f);
        });

        resolve({
          files: filesMap,
          pages: pagesWrapper ? pagesWrapper.value : [],
          activeTool: activeToolResult ? activeToolResult.value : 'home'
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to load session:', err);
    return null;
  }
};

/**
 * Wipes the IndexedDB stores.
 */
export const clearSession = async () => {
  try {
    const db = await initDB();
    const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');
    tx.objectStore(STORE_FILES).clear();
    tx.objectStore(STORE_METADATA).clear();

    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to clear session:', err);
  }
};
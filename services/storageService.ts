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

let _dbPromise: Promise<IDBDatabase> | null = null;

export const getDB = (): Promise<IDBDatabase> => {
  if (!_dbPromise) _dbPromise = initDB();
  return _dbPromise;
};

/**
 * Saves the current workspace state to IndexedDB using incremental diffing.
 * Only puts new/updated files and deletes removed ones instead of clearing the entire store.
 */
export const saveSession = async (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType) => {
  try {
    const db = await getDB();
    const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');
    const filesStore = tx.objectStore(STORE_FILES);

    // 1. Get existing keys in IDB
    const existingKeysReq = filesStore.getAllKeys();
    const existingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      existingKeysReq.onsuccess = () => resolve(existingKeysReq.result);
      existingKeysReq.onerror = () => reject(existingKeysReq.error);
    });

    const currentFileIds = new Set(files.keys());
    const existingKeySet = new Set(existingKeys.map(k => String(k)));

    // 2. Delete files that are no longer in the workspace
    for (const key of existingKeySet) {
      if (!currentFileIds.has(key)) {
        filesStore.delete(key);
      }
    }

    // 3. Put current files
    for (const file of Array.from(files.values())) {
      filesStore.put(file);
    }

    // 4. Save Metadata (Pages & Order)
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
  }
};

/**
 * Loads the saved workspace state from IndexedDB.
 */
export const loadSession = async (): Promise<WorkspaceState | null> => {
  try {
    const db = await getDB();
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
    const db = await getDB();
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
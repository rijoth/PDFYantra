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
 * Monotonic counter bumped synchronously by every `clearSession()` call.
 *
 * `saveSession` / `loadSession` capture the epoch when they are *called* and
 * compare it again when their queued turn starts (and before committing). A
 * mismatch means the workspace was cleared after the operation was requested,
 * so its work is stale and must be dropped instead of resurrecting a cleared
 * workspace.
 */
let epoch = 0;

/**
 * Module level promise queue: every IndexedDB operation in this module runs
 * strictly after the previous one has settled. This keeps two saves from
 * interleaving their delete/put passes and keeps a save from landing after a
 * clear.
 */
let queueTail: Promise<void> = Promise.resolve();

const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = queueTail.then(operation);
  // The queue must keep moving even when an operation rejects, otherwise one
  // failed write would silently disable persistence for the rest of the session.
  // The rejection is still delivered to that operation's own caller.
  queueTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Must be attached in the same tick the transaction is created, otherwise the
 * completion event can be missed.
 */
const waitForTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

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
  if (!_dbPromise) {
    _dbPromise = initDB().catch((err) => {
      // Do not cache the failure: a later operation should be able to retry
      // instead of inheriting a permanently rejected connection promise.
      _dbPromise = null;
      throw err;
    });
  }
  return _dbPromise;
};

/**
 * Saves the current workspace state to IndexedDB using incremental diffing.
 * Only puts new/updated files and deletes removed ones instead of clearing the entire store.
 *
 * Runs through the storage queue, and is dropped as a no-op if the workspace was
 * cleared after this save was requested.
 */
export const saveSession = (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType): Promise<void> => {
  const startEpoch = epoch;

  return enqueue(async () => {
    if (epoch !== startEpoch) return;

    try {
      const db = await getDB();
      const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');
      const txDone = waitForTransaction(tx);
      const filesStore = tx.objectStore(STORE_FILES);

      // 1. Get existing keys in IDB
      const existingKeys = await requestToPromise(filesStore.getAllKeys());

      // A clear landed while we were reading: drop this snapshot instead of
      // writing it back over the (soon to be) cleared stores.
      if (epoch !== startEpoch) {
        await txDone;
        return;
      }

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

      // 4. Save Metadata (Pages, Tool & Order)
      const metaStore = tx.objectStore(STORE_METADATA);
      metaStore.put({ key: 'pages', value: pages });
      metaStore.put({ key: 'activeTool', value: activeTool });
      metaStore.put({ key: 'lastUpdated', value: Date.now() });

      await txDone;
    } catch (err) {
      console.error('Failed to save session locally:', err);
      throw err;
    }
  });
};

/**
 * Loads the saved workspace state from IndexedDB.
 *
 * Runs through the storage queue. Resolves to `null` when the workspace was
 * cleared after the load was requested, so a stale read can never be applied to
 * the store.
 */
export const loadSession = (): Promise<WorkspaceState | null> => {
  const startEpoch = epoch;

  return enqueue(async () => {
    if (epoch !== startEpoch) return null;

    try {
      const db = await getDB();
      const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readonly');
      const txDone = waitForTransaction(tx);

      const filesStore = tx.objectStore(STORE_FILES);
      const metaStore = tx.objectStore(STORE_METADATA);

      const filesReq = filesStore.getAll();
      const pagesReq = metaStore.get('pages');
      const activeToolReq = metaStore.get('activeTool');

      await txDone;

      // The clear happened while we were reading: these rows belong to the
      // workspace the user already threw away.
      if (epoch !== startEpoch) return null;

      const filesArray: UploadedFile[] = filesReq.result || [];
      const pagesWrapper = pagesReq.result as { value: PDFPage[] } | undefined;
      const activeToolWrapper = activeToolReq.result as { value: ToolType } | undefined;

      if (filesArray.length === 0 && !pagesWrapper) {
        return null;
      }

      const filesMap = new Map<string, UploadedFile>();
      filesArray.forEach(f => {
        // Reconstruct the file object if needed, though IDB usually stores structured clones
        filesMap.set(f.id, f);
      });

      return {
        files: filesMap,
        pages: pagesWrapper ? pagesWrapper.value : [],
        activeTool: activeToolWrapper ? activeToolWrapper.value : 'home'
      };
    } catch (err) {
      console.error('Failed to load session:', err);
      throw err;
    }
  });
};

/**
 * Wipes the IndexedDB stores.
 *
 * The epoch is bumped synchronously at call time (not when the queued turn
 * starts) so that anything already queued - even an operation that is running
 * right now - sees the clear immediately and aborts.
 *
 * Ordering guarantee: once the returned promise resolves, IndexedDB holds no
 * files and an empty (or absent) session, and any save scheduled before this
 * call has been dropped by the epoch guard. A save of the empty post-clear state
 * is allowed, as long as it is ordered behind the clear (it is, because it goes
 * through the same queue).
 */
export const clearSession = (): Promise<void> => {
  epoch += 1;

  return enqueue(async () => {
    try {
      const db = await getDB();
      const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');
      const txDone = waitForTransaction(tx);

      tx.objectStore(STORE_FILES).clear();
      tx.objectStore(STORE_METADATA).clear();

      await txDone;
    } catch (err) {
      console.error('Failed to clear session:', err);
      throw err;
    }
  });
};

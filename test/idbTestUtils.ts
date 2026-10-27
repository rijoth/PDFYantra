import type { PDFPage, UploadedFile } from '../types';

const DB_NAME = 'PDFYantraDB';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_METADATA = 'metadata';

/**
 * Test-only helpers that inspect the real IndexedDB state (via fake-indexeddb)
 * without going through the service under test.
 */

const openRawDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readStore = async <T>(storeName: string): Promise<T[]> => {
  const db = await openRawDB();
  try {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return request.result as T[];
  } finally {
    db.close();
  }
};

export const readFiles = (): Promise<UploadedFile[]> => readStore<UploadedFile>(STORE_FILES);

export const readMetadata = (): Promise<Array<{ key: string; value: unknown }>> =>
  readStore<{ key: string; value: unknown }>(STORE_METADATA);

export const readMetadataValue = async (key: string): Promise<unknown> => {
  const rows = await readMetadata();
  return rows.find(row => row.key === key)?.value;
};

export const clearRawDB = async (): Promise<void> => {
  const db = await openRawDB();
  try {
    const tx = db.transaction([STORE_FILES, STORE_METADATA], 'readwrite');
    tx.objectStore(STORE_FILES).clear();
    tx.objectStore(STORE_METADATA).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const makeUploadedFile = (id: string): UploadedFile => {
  const blob = new Blob([`%PDF-${id}`], { type: 'application/pdf' });
  return {
    id,
    file: new File([blob], `${id}.pdf`, { type: 'application/pdf' }),
    name: `${id}.pdf`,
    size: blob.size,
    color: '#123456',
  };
};

export const makePage = (fileId: string, pageIndex = 0): PDFPage => ({
  id: `${fileId}-p${pageIndex}`,
  fileId,
  pageIndex,
  pageNumber: pageIndex + 1,
  thumbnailUrl: `blob:${fileId}-${pageIndex}`,
  rotation: 0,
});

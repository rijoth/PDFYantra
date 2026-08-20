import { pdfjs } from './pdfjsSetup';
import { UploadedFile } from '../types';

/**
 * Reads a fresh ArrayBuffer from a File instance.
 * Note: We do NOT cache the raw ArrayBuffer across calls because worker boundaries
 * (such as PDF.js web workers) transfer and detach the buffer, making it inaccessible
 * to subsequent consumers like pdf-lib.
 */
export const getFileBuffer = async (file: File): Promise<ArrayBuffer> => {
  return file.arrayBuffer();
};

/**
 * In-memory cache for parsed PDF documents to avoid reloading the blob.
 * Key: fileId
 * Value: PDFDocumentProxy
 */
const docCache = new Map<string, any>();

/**
 * Retrieves a cached document or loads it if not present.
 * Implements LRU to keep memory bounded.
 */
export const getCachedDoc = async (file: UploadedFile): Promise<any> => {
  let pdf = docCache.get(file.id);
  if (!pdf) {
    const buffer = await getFileBuffer(file.file);
    const loadingTask = pdfjs.getDocument({ data: buffer });
    pdf = await loadingTask.promise;

    // LRU: If cache is getting full, remove oldest entry
    if (docCache.size >= 10) {
      const [firstKey] = docCache.keys();
      const oldestDoc = docCache.get(firstKey);
      if (oldestDoc) {
        try {
          oldestDoc.destroy();
        } catch (e) {
          console.warn("Failed to destroy PDF document", e);
        }
      }
      docCache.delete(firstKey);
    }

    docCache.set(file.id, pdf);
  }
  return pdf;
};

/**
 * Evicts a specific document from the cache and releases its resources.
 */
export const evictDoc = (fileId: string) => {
  const doc = docCache.get(fileId);
  if (doc) {
    try {
      doc.destroy();
    } catch (e) {
      // Ignored
    }
    docCache.delete(fileId);
  }
};

/**
 * Clears the entire document cache.
 */
export const clearDocCache = () => {
  docCache.forEach(pdf => {
    try {
      pdf.destroy();
    } catch (e) {
      // Ignored
    }
  });
  docCache.clear();
};


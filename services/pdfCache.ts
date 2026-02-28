import { pdfjs } from './pdfService';
import { UploadedFile } from '../types';

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
        const buffer = await file.file.arrayBuffer();
        // Using the worker-configured pdfjs instance from pdfService
        const loadingTask = pdfjs.getDocument({ data: buffer });
        pdf = await loadingTask.promise;

        // LRU: If cache is getting full, remove oldest entry
        if (docCache.size >= 3) {
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
 * Clears the internal caches.
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

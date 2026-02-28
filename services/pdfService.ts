

import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { UploadedFile, PDFPage, SplitConfig } from '../types';
import { parsePageRange } from '../utils/pdfUtils';

// Configure PDF.js worker
export const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Use local worker bundled by Vite instead of CDN for better offline support and privacy
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Unlocks a password-protected PDF or simply passes it through if not encrypted.
 */
export const unlockPdfFile = async (
  file: File,
  password?: string
): Promise<{ success: boolean; file?: File; needsPassword?: boolean; wrongPassword?: boolean }> => {
  // 1. Try pdf-lib first to see if it's unencrypted or if we can open it directly.
  try {
    const fileBuffer = await file.arrayBuffer();
    await PDFDocument.load(fileBuffer);
    // If it works, we don't need to do anything else.
    return { success: true, file };
  } catch (e: any) {
    // If it's an encryption error, we proceed to unlock/rasterize.
    // Otherwise, it's a genuine error we should rethrow.
    const isEncryptionError = e.name === 'EncryptedPDFError' ||
      e.message?.toLowerCase().includes('encrypted') ||
      e.message?.toLowerCase().includes('password');
    if (!isEncryptionError) {
      throw e;
    }
  }

  // 2. If we're here, it's encrypted. Use pdf.js to unlock it for rasterization.
  // We get a fresh buffer because the previous one might have been detached by some browser implementations
  // when converted to ArrayBuffer, though usually it's pdfjs.getDocument({ data: ... }) that detaches it.
  const fileBufferForJs = await file.arrayBuffer();

  try {
    const loadingTask = pdfjs.getDocument({ data: fileBufferForJs, password });
    const doc = await loadingTask.promise;

    // If we reach here, the document is successfully unlocked!

    // 3. Rasterization Fallback
    // Since we cannot structurally decrypt the PDF in the browser (pdf-lib lacks this),
    // we rasterize it to a new, unencrypted document that looks identical.
    const newPdf = await PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 144 DPI

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const imgBytes = await (await fetch(imgData)).arrayBuffer();
        const jpgImage = await newPdf.embedJpg(imgBytes);

        const newPage = newPdf.addPage([viewport.width, viewport.height]);
        newPage.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height
        });

        // Cleanup
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    const unencryptedBytes = await newPdf.save();
    const newFile = new File([unencryptedBytes as any], file.name, { type: 'application/pdf' });
    return { success: true, file: newFile };

  } catch (error: any) {
    // pdfjs-dist throws PasswordException for wrong or missing passwords
    if (error.name === 'PasswordException' || error.message?.toLowerCase().includes('password')) {
      return { success: false, needsPassword: !password, wrongPassword: !!password };
    }
    throw error;
  }
};

/**
 * Handles the retry loop for unlocking a PDF that may be encrypted.
 */
export const processFileWithPassword = async (
  file: File,
  promptForPassword: (filename: string, isRetry: boolean) => Promise<string | null>
): Promise<File | null> => {
  let currentPassword = undefined;
  let isRetry = false;

  while (true) {
    const result = await unlockPdfFile(file, currentPassword);
    if (result.success && result.file) {
      return result.file;
    }
    if (result.needsPassword || result.wrongPassword) {
      const pwd = await promptForPassword(file.name, result.wrongPassword || false);
      if (pwd === null) {
        // User cancelled
        return null;
      }
      currentPassword = pwd;
      isRetry = true;
    } else {
      throw new Error(`Failed to process ${file.name}`);
    }
  }
};

/**
 * Generates thumbnails for all pages in a PDF file.
 */
export const generateThumbnails = async (
  file: UploadedFile,
  onProgress?: (current: number, total: number) => void
): Promise<PDFPage[]> => {
  const fileBuffer = await file.file.arrayBuffer();

  // Load using pdf.js for rendering
  const loadingTask = pdfjs.getDocument({ data: fileBuffer });
  const pdf = await loadingTask.promise;
  const pages: PDFPage[] = [];

  // Determine scale based on file size to prevent memory issues with large docs
  const scale = pdf.numPages > 50 ? 0.3 : 0.5;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) throw new Error("Could not create canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    pages.push({
      id: `${file.id}-page-${i}-${Math.random().toString(36).substr(2, 5)}`,
      fileId: file.id,
      pageIndex: i - 1, // 0-based for pdf-lib
      pageNumber: i,    // 1-based for display
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.7),
      rotation: 0,
    });

    // Cleanup to free memory
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }

  return pages;
};

/**
 * Renders a specific page to a Blob URL for high-res preview.
 */
export const renderPageHighRes = async (
  file: UploadedFile,
  pageIndex: number,
  rotation: number
): Promise<string> => {
  const { getCachedDoc } = await import('./pdfCache');
  const pdf = await getCachedDoc(file);
  const page = await pdf.getPage(pageIndex + 1); // 1-based index

  // Calculate viewport with rotation
  // We render at scale 2.0 for crispness on high DPI screens, but cap dimension to prevent canvas errors
  const scale = 2.0;
  const viewport = page.getViewport({ scale, rotation });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) throw new Error("Canvas context failed");

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else resolve('');
    }, 'image/jpeg', 0.85);
  });
};

/**
 * Merges pages based on the provided order and rotation settings.
 */
export const mergePages = async (
  pages: PDFPage[],
  fileMap: Map<string, UploadedFile>,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> => {
  if (pages.length === 0) {
    throw new Error("No pages to merge");
  }

  try {
    const mergedPdf = await PDFDocument.create();

    // Cache loaded source documents to avoid parsing multiple times
    const loadedDocs = new Map<string, PDFDocument>();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (onProgress) onProgress(i + 1, pages.length);
      const file = fileMap.get(page.fileId);
      if (!file) {
        throw new Error(`Source file for page not found: ${page.fileId}`);
      }

      let sourceDoc = loadedDocs.get(page.fileId);

      if (!sourceDoc) {
        const fileBuffer = await file.file.arrayBuffer();
        sourceDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        loadedDocs.set(page.fileId, sourceDoc);
      }

      // Copy the specific page
      const [copiedPage] = await mergedPdf.copyPages(sourceDoc, [page.pageIndex]);

      // Apply rotation if needed
      if (page.rotation !== 0) {
        const currentRotation = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentRotation + page.rotation) % 360));
      }

      mergedPdf.addPage(copiedPage);
    }

    const mergedPdfBytes = await mergedPdf.save();
    return mergedPdfBytes;
  } catch (error) {
    console.error("Merge error:", error);
    throw new Error("Failed to merge pages. Files might be corrupted.");
  }
};

/**
 * Splits the current Workspace (page list) based on configuration.
 * This effectively acts as a "Split the result of the Merge" operation.
 */
export const splitWorkspace = async (
  pages: PDFPage[],
  fileMap: Map<string, UploadedFile>,
  config: SplitConfig,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; filename: string; isZip: boolean }> => {

  if (pages.length === 0) throw new Error("Workspace is empty.");

  const totalPages = pages.length;
  let ranges: number[][] = []; // Array of arrays of 0-based INDICES into the `pages` array

  // 1. Determine Ranges based on mode
  if (config.mode === 'extract_all') {
    // Each page is a separate range
    for (let i = 0; i < totalPages; i++) {
      ranges.push([i]);
    }
  } else if (config.mode === 'fixed_number') {
    // Chunk pages
    const count = Math.max(1, Math.floor(config.fixedCount));
    for (let i = 0; i < totalPages; i += count) {
      const chunk = [];
      for (let j = 0; j < count && (i + j) < totalPages; j++) {
        chunk.push(i + j);
      }
      ranges.push(chunk);
    }
  } else if (config.mode === 'by_range') {
    // Parse user string which refers to visual page numbers (1-based)
    // Convert them to indices in our current `pages` array
    const indices = parsePageRange(config.rangeInput, totalPages);
    if (indices.length === 0) throw new Error("Invalid page range specified.");
    ranges.push(indices);
  }

  // 2. Generate PDF(s)
  const resultBlobs: { name: string; blob: Blob }[] = [];
  const baseName = "split_document";

  // Cache loaded source documents
  const loadedDocs = new Map<string, PDFDocument>();

  for (let i = 0; i < ranges.length; i++) {
    const pageIndices = ranges[i]; // These are indices in the `pages` array
    if (pageIndices.length === 0) continue;

    const subDoc = await PDFDocument.create();

    const totalInnerPages = pageIndices.length;
    for (let j = 0; j < totalInnerPages; j++) {
      const index = pageIndices[j];
      if (onProgress) {
        // Simple heuristic for progress across multiple files being generated
        const overallProgress = (i / ranges.length) + ((j / totalInnerPages) / ranges.length);
        onProgress(Math.round(overallProgress * 100), 100);
      }
      const pageMeta = pages[index];
      const file = fileMap.get(pageMeta.fileId);

      if (!file) continue;

      let sourceDoc = loadedDocs.get(pageMeta.fileId);
      if (!sourceDoc) {
        const fileBuffer = await file.file.arrayBuffer();
        sourceDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        loadedDocs.set(pageMeta.fileId, sourceDoc);
      }

      const [copiedPage] = await subDoc.copyPages(sourceDoc, [pageMeta.pageIndex]);

      // Apply rotation if needed (persisting workspace edits)
      if (pageMeta.rotation !== 0) {
        const currentRotation = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentRotation + pageMeta.rotation) % 360));
      }

      subDoc.addPage(copiedPage);
    }

    const pdfBytes = await subDoc.save();
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });

    // Naming convention
    let suffix = '';
    if (config.mode === 'extract_all') {
      suffix = `_page_${pageIndices[0] + 1}`;
    } else if (config.mode === 'fixed_number') {
      suffix = `_part_${i + 1}`;
    } else {
      suffix = `_custom`;
    }

    resultBlobs.push({
      name: `${baseName}${suffix}.pdf`,
      blob
    });
  }

  // 3. Package Result
  if (resultBlobs.length === 0) {
    throw new Error("No pages resulted from the split operation.");
  }

  if (resultBlobs.length === 1) {
    return {
      blob: resultBlobs[0].blob,
      filename: resultBlobs[0].name,
      isZip: false
    };
  } else {
    // Zip multiple files
    const zip = new JSZip();
    resultBlobs.forEach(item => {
      zip.file(item.name, item.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      filename: `pdfyantra_split_files.zip`,
      isZip: true
    };
  }
};

/**
 * Compresses a PDF file by rasterizing pages to JPEGs at a lower quality/resolution
 * and rebuilding the document.
 */
export const compressPdfFile = async (
  file: File,
  quality: number, // 0 to 1
  scale: number,   // e.g. 1.0 = 72dpi, 2.0 = 144dpi
  onProgress: (current: number, total: number) => void
): Promise<{ blob: Blob; filename: string }> => {
  const arrayBuffer = await file.arrayBuffer();
  let doc;

  try {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    doc = await loadingTask.promise;
  } catch (e: any) {
    if (e.name === 'PasswordException' || e.message?.toLowerCase().includes('password')) {
      throw new Error("This file is password protected. Please unlock it first in the Organizer.");
    }
    throw e;
  }

  const numPages = doc.numPages;
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    onProgress(i, numPages);
    const page = await doc.getPage(i);

    // Determine viewport
    const viewport = page.getViewport({ scale });

    // Render to canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to image
    const imgData = canvas.toDataURL('image/jpeg', quality);
    const imgBytes = await fetch(imgData).then(res => res.arrayBuffer());

    // Embed in new PDF
    const jpgImage = await newPdf.embedJpg(imgBytes);
    const newPage = newPdf.addPage([viewport.width, viewport.height]);
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height
    });

    // Cleanup
    canvas.width = 0;
    canvas.height = 0;
  }

  const pdfBytes = await newPdf.save();
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const filename = file.name.replace(/\.pdf$/i, '_compressed.pdf');

  return { blob, filename };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};



import { PDFDocument, degrees, type PDFImage } from 'pdf-lib';
import JSZip from 'jszip';
import { UploadedFile, PDFPage, SplitConfig } from '../types';
import { parsePageRange } from '../utils/pdfUtils';
import { effectiveRotation } from '../utils/rotation';
import { getFileBuffer, getCachedDoc } from './pdfCache';
import { pdfjs } from './pdfjsSetup';
export { pdfjs };

/**
 * Unlocks a password-protected PDF or simply passes it through if not encrypted.
 */
export const unlockPdfFile = async (
  file: File,
  password?: string
): Promise<{ success: boolean; file?: File; needsPassword?: boolean; wrongPassword?: boolean }> => {
  // 1. Try pdf-lib first to see if it's unencrypted or if we can open it directly.
  try {
    const fileBuffer = await getFileBuffer(file);
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
  const fileBufferForJs = await getFileBuffer(file);

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
const MAX_PASSWORD_RETRIES = 5;

export const processFileWithPassword = async (
  file: File,
  promptForPassword: (filename: string, isRetry: boolean) => Promise<string | null>
): Promise<File | null> => {
  let currentPassword = undefined;
  let attempts = 0;

  while (attempts < MAX_PASSWORD_RETRIES) {
    attempts++;
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
    } else {
      throw new Error(`Failed to process ${file.name}`);
    }
  }

  throw new Error(`Too many failed attempts to unlock ${file.name}`);
};

/**
 * Generates thumbnails for all pages in a PDF file.
 */
export const generateThumbnails = async (
  file: UploadedFile,
  onProgress?: (current: number, total: number) => void
): Promise<PDFPage[]> => {
  const fileBuffer = await getFileBuffer(file.file);

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

    const thumbnailUrl = await new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve('');
        }
      }, 'image/jpeg', 0.7);
    });

    pages.push({
      id: `${file.id}-page-${i}-${Math.random().toString(36).substr(2, 5)}`,
      fileId: file.id,
      pageIndex: i - 1, // 0-based for pdf-lib
      pageNumber: i,    // 1-based for display
      thumbnailUrl,
      rotation: 0,
    });

    // Cleanup to free memory
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;

    // Yield to the main thread to prevent UI freezing
    if (i % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return pages;
};

/**
 * Regenerates thumbnail blob URLs for a single file.
 * Returns a Map<pageIndex, thumbnailUrl> to allow mapping back
 * to existing page objects without losing their IDs/rotation.
 */
export const regenerateThumbnailsForFile = async (
  file: UploadedFile,
  onProgress?: (current: number, total: number) => void
): Promise<Map<number, string>> => {
  const result = new Map<number, string>();
  const fileBuffer = await getFileBuffer(file.file);

  const loadingTask = pdfjs.getDocument({ data: fileBuffer });
  const pdf = await loadingTask.promise;

  const scale = pdf.numPages > 50 ? 0.3 : 0.5;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    const thumbnailUrl = await new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve('');
        }
      }, 'image/jpeg', 0.7);
    });

    result.set(i - 1, thumbnailUrl);

    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;

    if (i % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
};

/**
 * Renders a specific page to a Blob URL for high-res preview.
 */
export const renderPageHighRes = async (
  file: UploadedFile,
  pageIndex: number,
  workspaceRotation: number
): Promise<string> => {
  const pdf = await getCachedDoc(file);
  const page = await pdf.getPage(pageIndex + 1); // 1-based index

  // Calculate viewport with rotation
  // We render at scale 2.0 for crispness on high DPI screens, but cap dimension to prevent canvas errors.
  // PDF.js treats `rotation` as absolute (it replaces the page's intrinsic
  // /Rotate), so the workspace rotation must be added to it.
  const scale = 2.0;
  const viewport = page.getViewport({
    scale,
    rotation: effectiveRotation(page.rotate, workspaceRotation)
  });

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
      // Clean up canvas surface to free GPU memory
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
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
        const fileBuffer = await getFileBuffer(file.file);
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
        const fileBuffer = await getFileBuffer(file.file);
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
  onProgress: (current: number, total: number) => void,
  pages?: PDFPage[] // workspace page order/rotation; omitted = whole file as-is
): Promise<{ blob: Blob; filename: string }> => {
  const arrayBuffer = await getFileBuffer(file);
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

  // When the workspace page list is provided it defines the output: order and
  // rotation come from it, deleted pages stay absent. Without it, keep the
  // original behaviour and compress the whole file in its own order.
  const requestedPages: Array<{ pageIndex: number; rotation: number }> = pages
    ? pages.map(p => ({ pageIndex: p.pageIndex, rotation: p.rotation }))
    : Array.from({ length: doc.numPages }, (_, i) => ({ pageIndex: i, rotation: 0 }));

  if (requestedPages.length === 0) {
    throw new Error("No pages to compress. The workspace has no pages left for this file.");
  }

  const newPdf = await PDFDocument.create();

  // Renders are cached by (pageIndex, effective rotation) so a duplicated page
  // is rasterized and embedded once, then drawn onto multiple output pages.
  const renderedPages = new Map<string, { image: PDFImage; width: number; height: number }>();

  for (let i = 0; i < requestedPages.length; i++) {
    onProgress(i + 1, requestedPages.length);
    const { pageIndex, rotation: workspaceRotation } = requestedPages[i];
    const page = await doc.getPage(pageIndex + 1);
    const rotation = effectiveRotation(page.rotate, workspaceRotation);

    // Page geometry comes from the rotated viewport at scale 1, independent of
    // the quality scale, so 90/270 swap width and height correctly.
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const cacheKey = `${pageIndex}:${rotation}`;

    let rendered = renderedPages.get(cacheKey);
    if (!rendered) {
      const viewport = page.getViewport({ scale, rotation });

      // Render to canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Convert directly to Blob without base64 intermediate allocations
      const imgBlob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
      if (!imgBlob) throw new Error("Failed to compress page");

      const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
      const jpgImage = await newPdf.embedJpg(imgBytes);

      rendered = { image: jpgImage, width: baseViewport.width, height: baseViewport.height };
      renderedPages.set(cacheKey, rendered);

      // Cleanup
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }

    const newPage = newPdf.addPage([rendered.width, rendered.height]);
    newPage.drawImage(rendered.image, {
      x: 0,
      y: 0,
      width: rendered.width,
      height: rendered.height
    });
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

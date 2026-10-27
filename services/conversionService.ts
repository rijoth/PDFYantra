

import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { UploadedFile, PDFPage, ConvertFormat } from '../types';
import { pdfjs } from './pdfjsSetup';
import { getFileBuffer } from './pdfCache';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { effectiveRotation } from '../utils/rotation';

/**
 * Helper to create a hidden container for DOM rendering
 */
const createHiddenContainer = () => {
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.left = '-9999px';
  div.style.top = '-9999px';
  div.style.width = '794px'; // A4 width at 96 DPI
  div.style.backgroundColor = 'white';
  div.style.padding = '40px';
  div.style.fontFamily = 'Arial, sans-serif';
  div.style.color = '#000';
  document.body.appendChild(div);
  return div;
};

/**
 * CONVERT TO PDF
 * Supports: Images, Text, HTML, DOCX, XLSX
 */
export const convertToPdf = async (files: File[]): Promise<{ pdfBytes: Uint8Array, name: string }[]> => {
  const results: { pdfBytes: Uint8Array, name: string }[] = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
        results.push(await convertImageToPdf(file));
      } else if (['txt', 'md'].includes(ext || '')) {
        results.push(await convertTextToPdf(file));
      } else if (['html', 'htm'].includes(ext || '')) {
        results.push(await convertHtmlToPdf(file));
      } else if (['docx'].includes(ext || '')) {
        results.push(await convertDocxToPdf(file));
      } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
        results.push(await convertXlsxToPdf(file));
      } else {
        throw new Error(`Unsupported file type: .${ext}`);
      }
    } catch (e) {
      console.error(`Failed to convert ${file.name}:`, e);
      throw new Error(`Conversion failed for ${file.name}. Ensure file is valid.`);
    }
  }

  return results;
};

const convertImageToPdf = async (file: File) => {
  const pdfDoc = await PDFDocument.create();
  const buffer = await getFileBuffer(file);
  let image;

  const ext = file.name.split('.').pop()?.toLowerCase();
  const isPng = file.type === 'image/png' || ext === 'png';

  if (isPng) {
    image = await pdfDoc.embedPng(buffer);
  } else if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') {
    image = await pdfDoc.embedJpg(buffer);
  } else {
    // WebP, GIF, BMP, AVIF, etc. are not supported by pdf-lib directly.
    // Rasterize via canvas to PNG bytes, then embed.
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
        el.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed for image conversion');
      ctx.drawImage(img, 0, 0);

      const pngBlob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!pngBlob) throw new Error('Failed to rasterize image to PNG');

      const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      image = await pdfDoc.embedPng(pngBytes);

      // Cleanup
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, name: `${file.name.split('.')[0]}.pdf` };
};

const convertTextToPdf = async (file: File) => {
  const text = await file.text();
  const container = createHiddenContainer();
  
  // Escape HTML chars
  const safeText = text.replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");

  container.innerHTML = `
    <div style="font-family: 'Google Sans', 'Roboto', sans-serif; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${safeText}</div>
  `;
  
  try {
    return await renderDomToPdf(container, file.name);
  } finally {
    document.body.removeChild(container);
  }
};

// Uses DOM snapshot approach (Canvas)
const renderDomToPdf = async (element: HTMLElement, originalName: string) => {
  const canvas = await html2canvas(element, {
    scale: 2, // 2x scale for better quality
    // Privacy: never fetch remote resources and never taint the canvas.
    useCORS: false,
    allowTaint: false,
    foreignObjectRendering: false,
    // Bounded so a stuck resource cannot hang the conversion. No proxy:
    // nothing about the document ever leaves the browser.
    imageTimeout: 15000,
  });
  const imgData = canvas.toDataURL('image/jpeg', 0.8);
  
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc.embedJpg(imgData);
  
  // Fit to A4
  const a4Width = 595.28;
  const a4Height = 841.89;
  
  // Calculate aspect ratio
  const imgRatio = image.width / image.height;
  let printWidth = a4Width;
  let printHeight = printWidth / imgRatio;

  if (printHeight > a4Height) {
      // If it's too tall, create a custom page size to fit content
      const pdfPage = pdfDoc.addPage([printWidth, printHeight]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: printWidth, height: printHeight });
  } else {
      const pdfPage = pdfDoc.addPage([a4Width, a4Height]);
      pdfPage.drawImage(image, { 
          x: 0, 
          y: a4Height - printHeight, // Align top
          width: printWidth, 
          height: printHeight 
      });
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, name: `${originalName.split('.')[0]}.pdf` };
};

const convertHtmlToPdf = async (file: File) => {
  const text = await file.text();
  const container = createHiddenContainer();
  // Sanitize untrusted HTML before injecting into the app DOM (B12).
  container.innerHTML = sanitizeHtml(text);
  
  try {
    const res = await renderDomToPdf(container, file.name);
    return res;
  } finally {
    document.body.removeChild(container);
  }
};

const convertDocxToPdf = async (file: File) => {
  const arrayBuffer = await getFileBuffer(file);
  const result = await mammoth.convertToHtml({ arrayBuffer });
  
  const container = createHiddenContainer();
  // mammoth output is derived from user-uploaded docs; sanitize defensively too.
  container.innerHTML = `<div class="mammoth-output">${sanitizeHtml(result.value)}</div>`;
  
  // Add some basic styles for mammoth output
  const style = document.createElement('style');
  style.textContent = `
    .mammoth-output { line-height: 1.5; }
    .mammoth-output p { margin-bottom: 1em; }
    .mammoth-output table { border-collapse: collapse; width: 100%; }
    .mammoth-output td, th { border: 1px solid #ccc; padding: 4px; }
  `;
  container.appendChild(style);

  try {
    const res = await renderDomToPdf(container, file.name);
    return res;
  } finally {
    document.body.removeChild(container);
  }
};

const convertXlsxToPdf = async (file: File) => {
  const arrayBuffer = await getFileBuffer(file);
  const workbook = XLSX.read(arrayBuffer);
  const sheetName = workbook.SheetNames[0];
  const html = XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]);

  const container = createHiddenContainer();
  // Sheet cells are user-controlled and sheet_to_html also emits a document
  // wrapper (<head>/<meta>); sanitize before it touches this origin's DOM.
  container.innerHTML = sanitizeHtml(html);
  
  try {
    const res = await renderDomToPdf(container, file.name);
    return res;
  } finally {
    document.body.removeChild(container);
  }
};

/**
 * CONVERT FROM PDF
 * Supports: Images, Text, CSV (Simple)
 */
export const convertFromPdf = async (
  pages: PDFPage[], 
  fileMap: Map<string, UploadedFile>,
  format: ConvertFormat
): Promise<{ blob: Blob, filename: string, isZip: boolean }> => {
  
  const zip = new JSZip();
  const timestamp = new Date().getTime();

  // Sort pages to ensure processing order
  const processList = [...pages]; 
  
  // Cache docs
  const docCache = new Map<string, any>();

  // Helper to get PDF.js doc
  const getDoc = async (fileId: string) => {
    if (docCache.has(fileId)) return docCache.get(fileId);
    const file = fileMap.get(fileId);
    if (!file) throw new Error("File not found");
    const buffer = await getFileBuffer(file.file);
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    docCache.set(fileId, doc);
    return doc;
  };

  if (format === 'text') {
    let fullText = '';
    for (const pageMeta of processList) {
      const doc = await getDoc(pageMeta.fileId);
      const page = await doc.getPage(pageMeta.pageIndex + 1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `--- Page ${pageMeta.pageNumber} ---\n${pageText}\n\n`;
    }
    const blob = new Blob([fullText], { type: 'text/plain' });
    return { blob, filename: `extracted_text_${timestamp}.txt`, isZip: false };
  }

  else if (format === 'csv') {
    // Heuristic CSV extraction: Combine text items, sort by Y then X
    let fullCsv = 'Page,Content\n';
    for (const pageMeta of processList) {
      const doc = await getDoc(pageMeta.fileId);
      const page = await doc.getPage(pageMeta.pageIndex + 1);
      const textContent = await page.getTextContent();

      // Basic extraction: dump text.
      const pageText = textContent.items.map((item: any) => `"${item.str.replace(/"/g, '""')}"`).join(' ');
      fullCsv += `${pageMeta.pageNumber},${pageText}\n`;
    }
    const blob = new Blob([fullCsv], { type: 'text/csv' });
    return { blob, filename: `extracted_data_${timestamp}.csv`, isZip: false };
  }

  else if (format === 'jpg' || format === 'png') {
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';

    // Optimization: Direct export for single page (No ZIP)
    if (processList.length === 1) {
      const pageMeta = processList[0];
      const doc = await getDoc(pageMeta.fileId);
      const page = await doc.getPage(pageMeta.pageIndex + 1);

      // PDF.js treats `rotation` as absolute, so combine the page's intrinsic
      // /Rotate with the rotation applied in the Organizer.
      const viewport = page.getViewport({
        scale: 2.0,
        rotation: effectiveRotation(page.rotate, pageMeta.rotation)
      });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error("Canvas context failed");

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, 0.85));

      // Cleanup canvas to free memory
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;

      if (!blob) throw new Error("Failed to create image blob");

      return {
        blob,
        filename: `page_${pageMeta.pageNumber}.${format}`,
        isZip: false
      };
    }

    // Multiple pages: Create ZIP with direct binary blobs (avoiding base64 string churn)
    for (let i = 0; i < processList.length; i++) {
      const pageMeta = processList[i];
      const doc = await getDoc(pageMeta.fileId);
      const page = await doc.getPage(pageMeta.pageIndex + 1);

      const viewport = page.getViewport({
        scale: 2.0, // High res
        rotation: effectiveRotation(page.rotate, pageMeta.rotation)
      });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const imgBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, 0.85));

      // Cleanup canvas to free memory
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;

      if (imgBlob) {
        const fileName = `page_${i + 1}_${pageMeta.pageNumber}.${format}`;
        zip.file(fileName, imgBlob);
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { blob: zipBlob, filename: `converted_${format}_${timestamp}.zip`, isZip: true };
};

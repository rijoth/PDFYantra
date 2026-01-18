
import { pdfjs } from './pdfService';
import { UploadedFile, PDFPage, SearchResult, SearchMatch } from '../types';

/**
 * In-memory cache for extracted text.
 * Key: fileId + '-' + pageIndex (0-based)
 * Value: The raw text content of the page
 */
const textCache = new Map<string, string>();

/**
 * In-memory cache for parsed PDF documents to avoid reloading the blob.
 * Key: fileId
 * Value: PDFDocumentProxy
 */
const docCache = new Map<string, any>();

/**
 * Retrieves the text content of a specific page.
 * Uses caching to prevent repeated parsing.
 */
const getPageText = async (file: UploadedFile, pageIndex: number): Promise<string> => {
  const cacheKey = `${file.id}-${pageIndex}`;
  
  if (textCache.has(cacheKey)) {
    return textCache.get(cacheKey)!;
  }

  // 1. Get or Load Document
  let pdf = docCache.get(file.id);
  if (!pdf) {
    const buffer = await file.file.arrayBuffer();
    // Using the worker-configured pdfjs instance from pdfService
    const loadingTask = pdfjs.getDocument({ data: buffer });
    pdf = await loadingTask.promise;
    docCache.set(file.id, pdf);
  }

  // 2. Get Page
  // pdfjs uses 1-based indexing for getPage
  const page = await pdf.getPage(pageIndex + 1);
  
  // 3. Extract Text
  const tokenizedText = await page.getTextContent();
  
  // Join items with a space. This is a basic extraction that doesn't 
  // perfectly reconstruct layout (columns, tables), but sufficient for search.
  const pageText = tokenizedText.items
    .map((item: any) => item.str)
    .join(' ');
  
  // Normalize whitespace (remove excessive spaces, newlines, tabs)
  const normalizedText = pageText.replace(/\s+/g, ' ').trim();
  
  // Cache result
  textCache.set(cacheKey, normalizedText);
  
  return normalizedText;
};

/**
 * Creates a context snippet around the matched index.
 */
const getSnippet = (text: string, matchIndex: number, queryLength: number): string => {
  const snippetLength = 60; // Characters before and after
  const start = Math.max(0, matchIndex - snippetLength);
  const end = Math.min(text.length, matchIndex + queryLength + snippetLength);
  
  let snippet = text.substring(start, end);
  
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  
  return snippet;
};

/**
 * Performs a search across all provided pages.
 * @param query The search string
 * @param files Map of available files
 * @param pages List of pages in the workspace
 * @param onProgress Callback for progress updates
 */
export const searchWorkspace = async (
  query: string,
  files: Map<string, UploadedFile>,
  pages: PDFPage[],
  onProgress?: (processed: number, total: number) => void
): Promise<SearchResult[]> => {
  if (!query.trim()) return [];

  const resultsMap = new Map<string, SearchResult>();
  const normalizedQuery = query.toLowerCase();
  
  let processedCount = 0;

  // Iterate over all pages in the workspace
  // We process sequentially to be nice to the main thread, 
  // though pdfjs uses a worker, the text assembly is here.
  for (const page of pages) {
    const file = files.get(page.fileId);
    if (!file) continue;

    try {
      const text = await getPageText(file, page.pageIndex);
      const normalizedText = text.toLowerCase();
      
      // Find all occurrences
      let matchIndex = normalizedText.indexOf(normalizedQuery);
      
      while (matchIndex !== -1) {
        // We found a match!
        
        // Initialize result group if needed
        if (!resultsMap.has(file.id)) {
          resultsMap.set(file.id, {
            fileId: file.id,
            fileName: file.name,
            fileColor: file.color,
            matches: []
          });
        }
        
        // Create match object
        // Use the Original Text for the snippet to preserve Case
        const snippet = getSnippet(text, matchIndex, normalizedQuery.length);
        
        resultsMap.get(file.id)!.matches.push({
          pageId: page.id,
          pageNumber: page.pageNumber,
          text: text,
          matchIndex: matchIndex,
          snippet: snippet
        });

        // Find next occurrence in this page
        matchIndex = normalizedText.indexOf(normalizedQuery, matchIndex + 1);
      }
    } catch (err) {
      console.error(`Error searching page ${page.pageNumber} of ${file.name}`, err);
    }
    
    processedCount++;
    if (onProgress) onProgress(processedCount, pages.length);
  }

  return Array.from(resultsMap.values());
};

/**
 * Clears the internal caches. Useful if files are removed or workspace cleared.
 */
export const clearSearchCache = () => {
  textCache.clear();
  docCache.clear();
};

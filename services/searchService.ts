import { pdfjs } from './pdfjsSetup';
import { UploadedFile, PDFPage, SearchResult, SearchMatch } from '../types';
import { getCachedDoc, clearDocCache, evictDoc } from './pdfCache';

/**
 * In-memory cache for extracted text.
 * Key: fileId + '-' + pageIndex (0-based)
 * Value: The raw text content of the page
 */
const textCache = new Map<string, string>();
const MAX_TEXT_CACHE_ENTRIES = 500;

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
  const pdf = await getCachedDoc(file);

  // 2. Get Page (pdfjs uses 1-based indexing for getPage)
  const page = await pdf.getPage(pageIndex + 1);

  // 3. Extract Text
  const tokenizedText = await page.getTextContent();

  const pageText = tokenizedText.items
    .map((item: any) => item.str)
    .join(' ');

  const normalizedText = pageText.replace(/\s+/g, ' ').trim();

  // Bounded cache
  if (textCache.size >= MAX_TEXT_CACHE_ENTRIES) {
    const [firstKey] = textCache.keys();
    textCache.delete(firstKey);
  }

  textCache.set(cacheKey, normalizedText);

  return normalizedText;
};

/**
 * Creates a context snippet around the matched index.
 */
const getSnippet = (text: string, matchIndex: number, queryLength: number): string => {
  const snippetLength = 60;
  const start = Math.max(0, matchIndex - snippetLength);
  const end = Math.min(text.length, matchIndex + queryLength + snippetLength);

  let snippet = text.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
};

/**
 * Performs a search across all provided pages.
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
  const batchSize = 5;

  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (page) => {
        const file = files.get(page.fileId);
        if (!file) return null;

        try {
          const text = await getPageText(file, page.pageIndex);
          const normalizedText = text.toLowerCase();
          const matches: SearchMatch[] = [];

          let matchIndex = normalizedText.indexOf(normalizedQuery);
          while (matchIndex !== -1) {
            const snippet = getSnippet(text, matchIndex, normalizedQuery.length);
            matches.push({
              pageId: page.id,
              pageNumber: page.pageNumber,
              matchIndex: matchIndex,
              snippet: snippet
            });
            matchIndex = normalizedText.indexOf(normalizedQuery, matchIndex + 1);
          }

          return { file, matches };
        } catch (err) {
          console.error(`Error searching page ${page.pageNumber} of ${file.name}`, err);
          return null;
        }
      })
    );

    // Merge batch results sequentially to prevent any race condition
    for (const item of batchResults) {
      if (!item || item.matches.length === 0) continue;
      const { file, matches } = item;

      if (!resultsMap.has(file.id)) {
        resultsMap.set(file.id, {
          fileId: file.id,
          fileName: file.name,
          fileColor: file.color,
          matches: []
        });
      }

      resultsMap.get(file.id)!.matches.push(...matches);
    }

    processedCount += batch.length;
    if (onProgress) onProgress(Math.min(processedCount, pages.length), pages.length);

    // Yield to main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return Array.from(resultsMap.values());
};

/**
 * Evicts cached text for a specific file when removed or replaced.
 */
export const evictFileFromSearchCache = (fileId: string) => {
  const prefix = `${fileId}-`;
  for (const key of Array.from(textCache.keys())) {
    if (key.startsWith(prefix)) {
      textCache.delete(key);
    }
  }
  evictDoc(fileId);
};

/**
 * Clears the internal caches. Useful if workspace is cleared.
 */
export const clearSearchCache = () => {
  textCache.clear();
  clearDocCache();
};


/**
 * Parses a page range string (e.g., "1-3, 5, 8-10") into a sorted array of 0-based unique indices.
 * @param input The range string input.
 * @param maxPages The total number of pages in the document (for validation).
 * @returns Array of 0-based indices.
 */
export const parsePageRange = (input: string, maxPages: number): number[] => {
  const cleanInput = input.replace(/\s+/g, '');
  if (!cleanInput) return [];

  const parts = cleanInput.split(',');
  const indices = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        // Ensure strictly increasing range, bounded by file size
        const lower = Math.max(1, Math.min(start, end));
        const upper = Math.min(maxPages, Math.max(start, end));
        
        for (let i = lower; i <= upper; i++) {
          indices.add(i - 1); // Convert to 0-based
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        indices.add(pageNum - 1); // Convert to 0-based
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
};

/**
 * Validates if the range string format is roughly correct (syntax check only).
 */
export const isValidRangeFormat = (input: string): boolean => {
  if (!input) return false;
  // Allows digits, commas, hyphens, and spaces
  return /^[\d\s,-]+$/.test(input);
};
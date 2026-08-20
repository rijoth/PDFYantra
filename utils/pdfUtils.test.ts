import { describe, it, expect } from 'vitest';
import { parsePageRange, isValidRangeFormat } from './pdfUtils';

describe('pdfUtils', () => {
  describe('isValidRangeFormat', () => {
    it('should validate valid range strings', () => {
      expect(isValidRangeFormat('1')).toBe(true);
      expect(isValidRangeFormat('1-5')).toBe(true);
      expect(isValidRangeFormat('1, 3, 5-8')).toBe(true);
      expect(isValidRangeFormat('1,2,3,4')).toBe(true);
      expect(isValidRangeFormat('  1 - 5 , 8 , 10 - 12  ')).toBe(true);
    });

    it('should reject empty or malformed strings', () => {
      expect(isValidRangeFormat('')).toBe(false);
      expect(isValidRangeFormat('   ')).toBe(false);
      expect(isValidRangeFormat('--')).toBe(false);
      expect(isValidRangeFormat(',,')).toBe(false);
      expect(isValidRangeFormat('1--3')).toBe(false);
      expect(isValidRangeFormat('1, ,3')).toBe(false);
      expect(isValidRangeFormat('abc')).toBe(false);
      expect(isValidRangeFormat('1-a')).toBe(false);
    });
  });

  describe('parsePageRange', () => {
    it('should parse single page numbers', () => {
      expect(parsePageRange('1', 10)).toEqual([0]);
      expect(parsePageRange('3, 5, 7', 10)).toEqual([2, 4, 6]);
    });

    it('should parse inclusive page ranges', () => {
      expect(parsePageRange('1-4', 10)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange('3-5, 8-10', 10)).toEqual([2, 3, 4, 7, 8, 9]);
    });

    it('should deduplicate and sort parsed indices', () => {
      expect(parsePageRange('5, 1-3, 2, 4', 10)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should clamp pages within document bounds', () => {
      expect(parsePageRange('1-20', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('8, 12', 5)).toEqual([]);
    });

    it('should handle empty or whitespace inputs gracefully', () => {
      expect(parsePageRange('', 10)).toEqual([]);
      expect(parsePageRange('   ', 10)).toEqual([]);
    });
  });
});

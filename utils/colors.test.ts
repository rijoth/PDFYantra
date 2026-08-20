import { describe, it, expect } from 'vitest';
import { FILE_COLORS, getFileColor } from './colors';

describe('colors utility', () => {
  it('should cycle through FILE_COLORS sequentially', () => {
    expect(getFileColor(0)).toBe(FILE_COLORS[0]);
    expect(getFileColor(1)).toBe(FILE_COLORS[1]);
    expect(getFileColor(FILE_COLORS.length)).toBe(FILE_COLORS[0]);
    expect(getFileColor(FILE_COLORS.length + 1)).toBe(FILE_COLORS[1]);
  });
});

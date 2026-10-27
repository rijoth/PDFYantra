// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const themeScript = fs.readFileSync(path.join(repoRoot, 'public', 'theme-init.js'), 'utf8');

const runThemeScript = ({ savedTheme, prefersDark }) => {
  window.localStorage.clear();
  if (savedTheme !== undefined) window.localStorage.setItem('theme', savedTheme);

  window.matchMedia = (query) => ({
    matches: prefersDark,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  document.documentElement.className = '';
  // The shipped file is a self-contained IIFE; run it exactly as the browser would.
  new Function(themeScript)();
  return document.documentElement.classList.contains('dark');
};

describe('public/theme-init.js', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('applies dark when the saved preference is dark', () => {
    expect(runThemeScript({ savedTheme: 'dark', prefersDark: false })).toBe(true);
  });

  it('removes dark when the saved preference is light, even if the OS prefers dark', () => {
    expect(runThemeScript({ savedTheme: 'light', prefersDark: true })).toBe(false);
  });

  it('follows the OS preference when nothing is saved', () => {
    expect(runThemeScript({ savedTheme: undefined, prefersDark: true })).toBe(true);
    expect(runThemeScript({ savedTheme: undefined, prefersDark: false })).toBe(false);
  });
});

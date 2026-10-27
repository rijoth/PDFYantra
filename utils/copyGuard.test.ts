import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * These phrases are banned because they are inaccurate for the current
 * architecture: PDFYantra has no service worker/PWA (so it cannot work
 * offline), the app itself is served over the network, PDFs are processed
 * locally rather than end-to-end encrypted, and the workspace is stored
 * unencrypted in IndexedDB. Revisit this list if a PWA or at-rest encryption
 * ships.
 */
const BANNED_PHRASES = [
  '100% offline',
  'fully offline',
  'works offline',
  'offline support',
  'no servers',
  'end-to-end',
  'zero trace',
  'military-grade',
  'completely secure',
  '100% secure',
] as const;

const ROOT_FILES = ['index.html', 'README.md', 'metadata.json', 'App.tsx'];
const COPY_DIRS = ['components', 'constants'];
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDED_FILES = new Set([path.resolve(repoRoot, 'utils/copyGuard.test.ts')]);

const walk = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return SCRIPT_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
  });
};

const collectFiles = (): string[] => {
  const files = ROOT_FILES.map((file) => path.resolve(repoRoot, file)).filter((file) =>
    fs.existsSync(file)
  );

  for (const dir of COPY_DIRS) {
    files.push(...walk(path.resolve(repoRoot, dir)));
  }

  return files.filter((file) => !EXCLUDED_FILES.has(file));
};

const lineNumberAt = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length;

describe('public copy guard', () => {
  it('does not contain banned offline, security, or privacy claims', () => {
    const violations: string[] = [];

    for (const file of collectFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      const lowerText = text.toLowerCase();

      for (const phrase of BANNED_PHRASES) {
        let index = lowerText.indexOf(phrase);
        while (index !== -1) {
          violations.push(
            `${path.relative(repoRoot, file)}:${lineNumberAt(text, index)} contains banned phrase "${phrase}"`
          );
          index = lowerText.indexOf(phrase, index + phrase.length);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

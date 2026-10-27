#!/usr/bin/env node
/**
 * Guard: fail if the production build references third-party subresources.
 *
 * Run after `npm run build` with `npm run check:external`. This is deliberately
 * a manual check (not part of `build`) so a CDN URL can never slip into the
 * deployable output.
 *
 * Covered: external <script src>, <link> rel=stylesheet/preload/preconnect/
 * dns-prefetch/prefetch, CSS url(https://...) and @import, and fetch("https://")
 * literals in JS. Plain navigation links (<a href>) and XML namespace URLs are
 * ignored.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTERNAL_URL = /^(?:https?:)?\/\//i;

// Schema / XML namespace URLs are identifiers, not network requests.
const ALLOWED_PREFIXES = [
  'http://www.w3.org/',
  'https://www.w3.org/',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
];

const LINK_RELS = new Set([
  'stylesheet',
  'preload',
  'modulepreload',
  'prefetch',
  'preconnect',
  'dns-prefetch',
]);

const isAllowed = (url) => ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));

const isExternal = (rawUrl) => {
  if (!rawUrl) return false;
  const url = rawUrl.trim();
  if (!url) return false;
  if (url.startsWith('#')) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (!EXTERNAL_URL.test(url)) return false;
  return !isAllowed(url);
};

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : null;
};

/**
 * @param {{ file: string; text: string; kind: 'html' | 'css' | 'js' }} input
 * @returns {{ file: string; kind: string; url: string }[]}
 */
export const scanContent = ({ file, text, kind }) => {
  const findings = [];
  const seen = new Set();
  const add = (url) => {
    if (!isExternal(url)) return;
    const trimmed = url.trim();
    const key = `${kind}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ file, kind, url: trimmed });
  };

  if (kind === 'html') {
    for (const tag of text.match(/<script\b[^>]*>/gi) ?? []) {
      add(attribute(tag, 'src'));
    }

    for (const tag of text.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
      if (!rel.some((value) => LINK_RELS.has(value))) continue;
      add(attribute(tag, 'href'));
    }
  }

  if (kind === 'html' || kind === 'css') {
    for (const match of text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      add(match[2]);
    }
    for (const match of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"');\s]+)/gi)) {
      add(match[1]);
    }
  }

  if (kind === 'js') {
    for (const match of text.matchAll(/\bfetch\s*\(\s*(["'`])([^"'`]+)\1/g)) {
      add(match[2]);
    }
  }

  return findings;
};

const SCANNABLE = new Map([
  ['.html', 'html'],
  ['.css', 'css'],
  ['.js', 'js'],
  ['.mjs', 'js'],
]);

const walk = (dir) => {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (SCANNABLE.has(path.extname(entry.name))) files.push(full);
  }
  return files;
};

export const scanDirectory = (distDir = 'dist') => {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output not found at "${distDir}". Run "npm run build" first.`);
  }

  const files = walk(distDir);
  const findings = files.flatMap((file) => {
    const kind = SCANNABLE.get(path.extname(file));
    return scanContent({ file, text: fs.readFileSync(file, 'utf8'), kind });
  });

  return { files: files.length, findings };
};

const main = () => {
  const distDir = process.argv[2] ?? 'dist';
  const { files, findings } = scanDirectory(distDir);

  if (findings.length > 0) {
    console.error(`\nExternal subresource reference(s) found in ${distDir}:`);
    for (const finding of findings) {
      console.error(`  ${finding.file} [${finding.kind}] -> ${finding.url}`);
    }
    console.error(`\n${findings.length} finding(s) across ${files} scanned file(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`No external subresource references found (${files} file(s) scanned in ${distDir}).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

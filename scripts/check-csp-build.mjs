#!/usr/bin/env node
/**
 * Guard: verify the production build honours the CSP contract.
 *
 * Run after `npm run build`:
 *   npm run check:csp        (or `node scripts/check-csp-build.mjs dist`)
 *
 * Checks:
 *   - dist/index.html has no executable inline <script> (data blocks are fine)
 *   - the CSP <meta> tag is present in enforcing mode and absent in report-only
 *   - dist/_headers exists, uses the right header name for the mode, and carries
 *     the policy plus every companion header
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CSP_MODE, buildCsp, META_UNSUPPORTED_DIRECTIVES } from '../config/csp.mjs';

// <script> type values that the browser does not execute as script.
const NON_EXECUTABLE_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'importmap',
  'speculationrules',
  'text/template',
  'text/x-template',
]);

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : null;
};

/**
 * Inline <script> blocks the browser would execute (and that a strict
 * `script-src 'self'` would therefore block).
 *
 * @param {string} html
 * @returns {string[]} the offending script bodies
 */
export const findExecutableInlineScripts = (html) => {
  const findings = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const type = (attribute(attrs, 'type') ?? '').trim().toLowerCase();
    if (type && NON_EXECUTABLE_TYPES.has(type)) continue;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const scriptType = type.replace(/\s*;.*$/, '');
    if (scriptType && scriptType !== 'module' && scriptType !== 'text/javascript') continue;
    findings.push(body.trim());
  }
  return findings;
};

/**
 * @param {string} html
 * @returns {string | null} the CSP <meta> content attribute, when present
 */
export const findCspMetaContent = (html) => {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const httpEquiv = (attribute(tag, 'http-equiv') ?? '').toLowerCase();
    if (httpEquiv !== 'content-security-policy') continue;
    return attribute(tag, 'content');
  }
  return null;
};

/**
 * Parse a `_headers` file into a map of header name -> value (first block only).
 *
 * @param {string} text
 * @returns {{ path: string, headers: Record<string, string> } | null}
 */
export const parseHeadersFile = (text) => {
  const [firstBlock] = text.split(/\n\s*\n/);
  const lines = (firstBlock ?? '').split('\n');
  const headerPath = (lines.shift() ?? '').trim();
  if (!headerPath) return null;
  const headers = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;
    headers[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return { path: headerPath, headers };
};

/**
 * @param {{ distDir?: string, mode?: 'enforce' | 'report-only' }} [options]
 * @returns {{ problems: string[], info: string[] }}
 */
export const checkBuildOutput = ({ distDir = 'dist', mode = CSP_MODE } = {}) => {
  const problems = [];
  const info = [];
  const indexPath = path.join(distDir, 'index.html');
  const headersPath = path.join(distDir, '_headers');

  if (!fs.existsSync(indexPath)) {
    problems.push(`Missing ${indexPath}. Run "npm run build" first.`);
    return { problems, info };
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const inline = findExecutableInlineScripts(html);
  if (inline.length > 0) {
    problems.push(
      `${indexPath} still contains ${inline.length} executable inline script block(s): ${JSON.stringify(inline)}`
    );
  } else {
    info.push('index.html has no executable inline script');
  }

  const metaContent = findCspMetaContent(html);
  if (mode === 'enforce') {
    if (!metaContent) {
      problems.push(`${indexPath} is missing the Content-Security-Policy meta tag`);
    } else {
      for (const name of META_UNSUPPORTED_DIRECTIVES) {
        if (metaContent.includes(`${name} `)) {
          problems.push(`meta CSP must not contain the ignored directive "${name}"`);
        }
      }
      if (metaContent !== buildCsp({ forMeta: true })) {
        problems.push('meta CSP content does not match config/csp.mjs');
      }
      info.push('index.html carries the enforcing CSP meta tag');
    }
  } else if (metaContent) {
    problems.push(
      'meta CSP found in report-only mode: <meta> cannot be report-only, so it must be omitted'
    );
  } else {
    info.push('no meta CSP (report-only mode, header carries the policy)');
  }

  if (!fs.existsSync(headersPath)) {
    problems.push(`Missing ${headersPath}`);
    return { problems, info };
  }

  const parsed = parseHeadersFile(fs.readFileSync(headersPath, 'utf8'));
  if (!parsed) {
    problems.push(`${headersPath} is empty or malformed`);
    return { problems, info };
  }
  if (parsed.path !== '/*') {
    problems.push(`${headersPath} must apply to "/*", found "${parsed.path}"`);
  }

  const headerName =
    mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  const otherName =
    mode === 'enforce' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  if (!parsed.headers[headerName]) {
    problems.push(`${headersPath} is missing the "${headerName}" header for ${mode} mode`);
  }
  if (parsed.headers[otherName]) {
    problems.push(`${headersPath} unexpectedly contains "${otherName}"`);
  }
  const value = parsed.headers[headerName] ?? '';
  for (const directive of buildCsp({ forMeta: false }).split('; ')) {
    const name = directive.split(' ')[0];
    if (!value.includes(name)) problems.push(`${headersPath} CSP is missing directive "${name}"`);
  }

  for (const name of [
    'Referrer-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
  ]) {
    if (!parsed.headers[name]) problems.push(`${headersPath} is missing "${name}"`);
  }

  return { problems, info };
};

const main = () => {
  const distDir = process.argv[2] ?? 'dist';
  const { problems, info } = checkBuildOutput({ distDir });

  for (const line of info) console.log(`  ok: ${line}`);
  if (problems.length > 0) {
    console.error(`\nCSP build check failed (${problems.length} problem(s)):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nCSP build check passed for ${distDir} (mode: ${CSP_MODE}).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

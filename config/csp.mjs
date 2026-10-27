/**
 * Single source of truth for PDFYantra's Content Security Policy and the
 * companion security headers.
 *
 * Consumed by:
 *   - plugins/securityHeaders.ts  -> <meta> tag injection + dist/_headers
 *   - vite.config.ts              -> `preview.headers` (matches production)
 *   - scripts/check-csp-build.mjs -> build-output verification
 *   - test/csp.test.mjs           -> policy contract tests
 *
 * Do not copy these strings anywhere else; change them here.
 */

/**
 * Enforcement mode.
 *
 * 'enforce'     -> `Content-Security-Policy` (header + HTML <meta> fallback).
 * 'report-only' -> `Content-Security-Policy-Report-Only` (header only; <meta>
 *                  cannot be report-only, so no meta tag is injected).
 *
 * Currently ENFORCING: every documented flow (upload, unlock, preview/zoom,
 * search, reorder, rotate/delete/duplicate, undo/redo, merge, split, all convert
 * directions, compress, theme, session recovery, clear) was exercised in Chrome
 * 149 against `vite preview` (build output) with zero CSP violations.
 *
 * If you change a directive, a dependency, or add a code path that loads a new
 * kind of resource, re-run that flow list and `npm run check:csp` before
 * shipping. If you cannot verify a change in a browser, temporarily set this to
 * 'report-only' — never ship an unverified enforcing policy.
 */
export const CSP_MODE = 'enforce';

/**
 * Directive map. Order is preserved when serializing (baseline order).
 * @type {Record<string, string[]>}
 */
export const CSP_DIRECTIVES = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  // style-src keeps 'unsafe-inline' (deliberate, verified compromise):
  //   - React style={{}} props land on style ATTRIBUTES, and
  //   - html2canvas injects inline <style> elements while snapshotting the DOM
  //     for text/markdown/html/docx/xlsx/csv -> PDF conversions.
  // Verified: `style-src 'self'; style-src-attr 'unsafe-inline'` blocks two
  // distinct html2canvas style blocks and logs violations on those flows, so the
  // wider keyword stays. Exfiltration is still impossible because img-src,
  // font-src and connect-src only allow self/blob/data.
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'blob:', 'data:'],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:'],
  'media-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

/**
 * Directives a <meta http-equiv="Content-Security-Policy"> cannot deliver.
 * They must be sent as a real HTTP header.
 */
export const META_UNSUPPORTED_DIRECTIVES = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

/**
 * Companion headers. Applied to every path alongside the CSP.
 * @type {Record<string, string>}
 */
export const COMPANION_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const HEADER_NAMES = {
  enforce: 'Content-Security-Policy',
  'report-only': 'Content-Security-Policy-Report-Only',
};

/**
 * Serialize the directive map into a CSP header value.
 *
 * @param {{ forMeta?: boolean, directives?: Record<string, string[]> }} [options]
 *   forMeta - omit directives that <meta> ignores.
 * @returns {string}
 */
export const buildCsp = ({ forMeta = false, directives = CSP_DIRECTIVES } = {}) =>
  Object.entries(directives)
    .filter(([name]) => !(forMeta && META_UNSUPPORTED_DIRECTIVES.includes(name)))
    .map(([name, values]) => (values.length === 0 ? name : `${name} ${values.join(' ')}`))
    .join('; ');

/**
 * Full header set for a given mode, as an ordered record.
 *
 * @param {{ mode?: 'enforce' | 'report-only' }} [options]
 * @returns {Record<string, string>}
 */
export const buildSecurityHeaders = ({ mode = CSP_MODE } = {}) => {
  const headerName = HEADER_NAMES[mode];
  if (!headerName) throw new Error(`Unknown CSP mode: ${String(mode)}`);
  return {
    [headerName]: buildCsp({ forMeta: false }),
    ...COMPANION_HEADERS,
  };
};

/**
 * Render the header set in Netlify / Cloudflare Pages `_headers` format.
 *
 * @param {{ mode?: 'enforce' | 'report-only' }} [options]
 * @returns {string}
 */
export const buildHeadersFile = ({ mode = CSP_MODE } = {}) => {
  const lines = ['/*'];
  for (const [name, value] of Object.entries(buildSecurityHeaders({ mode }))) {
    lines.push(`  ${name}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
};

/**
 * The `<meta>` attributes for the HTML fallback (enforcing mode only).
 * @param {{ mode?: 'enforce' | 'report-only' }} [options]
 * @returns {{ 'http-equiv': string, content: string } | null}
 */
export const buildCspMetaAttributes = ({ mode = CSP_MODE } = {}) => {
  if (mode !== 'enforce') return null;
  return {
    'http-equiv': 'Content-Security-Policy',
    content: buildCsp({ forMeta: true }),
  };
};

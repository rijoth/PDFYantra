import type { Plugin } from 'vite';
import { CSP_MODE, buildCspMetaAttributes, buildHeadersFile } from '../config/csp.mjs';

/**
 * Emits the production security headers:
 *   1. `<meta http-equiv="Content-Security-Policy">` into index.html (enforcing only)
 *   2. `dist/_headers` (Netlify / Cloudflare Pages format) with the full header set
 *
 * Local preview gets the same headers through `preview.headers` in vite.config.ts.
 * The dev server is intentionally excluded: HMR and the React refresh preamble
 * need inline script.
 */
export const securityHeaders = (): Plugin => ({
  name: 'pdfyantra:security-headers',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: () => {
      const attrs = buildCspMetaAttributes();
      if (!attrs) return [];
      return [{ tag: 'meta', attrs, injectTo: 'head-prepend' as const }];
    },
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: buildHeadersFile({ mode: CSP_MODE }),
    });
  },
});

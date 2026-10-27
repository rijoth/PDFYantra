import { describe, expect, it } from 'vitest';
import {
  CSP_DIRECTIVES,
  CSP_MODE,
  COMPANION_HEADERS,
  buildCsp,
  buildCspMetaAttributes,
  buildHeadersFile,
  buildSecurityHeaders,
} from '../config/csp.mjs';

const serialize = (directives) => buildCsp({ forMeta: false, directives });
const directiveValue = (csp, name) => {
  const directive = csp.split('; ').find((part) => part === name || part.startsWith(`${name} `));
  return directive === undefined ? null : directive.slice(name.length).trim();
};

describe('buildCsp', () => {
  const header = buildCsp({ forMeta: false });
  const meta = buildCsp({ forMeta: true });

  it('locks the default source down to nothing', () => {
    expect(directiveValue(header, 'default-src')).toBe("'none'");
    expect(directiveValue(meta, 'default-src')).toBe("'none'");
  });

  it('never allows a wildcard or a plaintext http source', () => {
    expect(header).not.toContain('*');
    expect(meta).not.toContain('*');
    expect(header).not.toMatch(/\bhttp:/);
    expect(meta).not.toMatch(/\bhttp:/);
  });

  it('keeps script-src free of unsafe-inline and unsafe-eval', () => {
    expect(directiveValue(header, 'script-src')).toBe("'self'");
    expect(directiveValue(meta, 'script-src')).toBe("'self'");
    expect(header).not.toContain('unsafe-eval');
    expect(header).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(header).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('blocks plugins and <base> manipulation', () => {
    expect(directiveValue(header, 'object-src')).toBe("'none'");
    expect(directiveValue(header, 'base-uri')).toBe("'none'");
    expect(directiveValue(header, 'form-action')).toBe("'none'");
    expect(directiveValue(header, 'media-src')).toBe("'none'");
  });

  it('keeps frame-ancestors in the header variant and out of the meta variant', () => {
    expect(directiveValue(header, 'frame-ancestors')).toBe("'none'");
    expect(directiveValue(meta, 'frame-ancestors')).toBeNull();
    expect(meta).not.toContain('frame-ancestors');
  });

  it('allows self/blob/data for images and self/blob for the PDF.js worker', () => {
    expect(directiveValue(header, 'img-src')).toBe("'self' data: blob:");
    expect(directiveValue(header, 'worker-src')).toBe("'self' blob:");
    expect(directiveValue(header, 'child-src')).toBe("'self' blob:");
    expect(directiveValue(header, 'font-src')).toBe("'self'");
    expect(directiveValue(header, 'connect-src')).toBe("'self' blob: data:");
  });

  it('serializes value-less directives without a trailing space', () => {
    expect(directiveValue(header, 'upgrade-insecure-requests')).toBe('');
    expect(header).toContain('; upgrade-insecure-requests');
    expect(header.endsWith('upgrade-insecure-requests')).toBe(true);
  });

  it('drops every meta-unsupported directive from the meta variant', () => {
    expect(buildCsp({ forMeta: true })).toBe(
      serialize(
        Object.fromEntries(
          Object.entries(CSP_DIRECTIVES).filter(([name]) => name !== 'frame-ancestors')
        )
      )
    );
    expect(meta.split('; ')).toHaveLength(header.split('; ').length - 1);
  });
});

describe('security header set', () => {
  it('uses the enforcing header name only in enforce mode', () => {
    expect(Object.keys(buildSecurityHeaders({ mode: 'enforce' }))[0]).toBe(
      'Content-Security-Policy'
    );
    expect(Object.keys(buildSecurityHeaders({ mode: 'report-only' }))[0]).toBe(
      'Content-Security-Policy-Report-Only'
    );
  });

  it('ships every companion header with the agreed value', () => {
    for (const mode of ['enforce', 'report-only']) {
      const headers = buildSecurityHeaders({ mode });
      for (const [name, value] of Object.entries(COMPANION_HEADERS)) {
        expect(headers[name]).toBe(value);
      }
      expect(headers['Referrer-Policy']).toBe('no-referrer');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(headers['Permissions-Policy']).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
      );
    }
  });

  it('renders a _headers file from the same policy strings', () => {
    for (const mode of ['enforce', 'report-only']) {
      const file = buildHeadersFile({ mode });
      expect(file.startsWith('/*\n')).toBe(true);
      for (const [name, value] of Object.entries(buildSecurityHeaders({ mode }))) {
        expect(file).toContain(`  ${name}: ${value}\n`);
      }
    }
    expect(buildHeadersFile({ mode: 'enforce' })).toContain(buildCsp({ forMeta: false }));
  });

  it('only produces meta attributes in enforce mode', () => {
    expect(buildCspMetaAttributes({ mode: 'report-only' })).toBeNull();
    expect(buildCspMetaAttributes({ mode: 'enforce' })).toEqual({
      'http-equiv': 'Content-Security-Policy',
      content: buildCsp({ forMeta: true }),
    });
  });

  it('has a valid configured mode', () => {
    expect(['enforce', 'report-only']).toContain(CSP_MODE);
  });
});

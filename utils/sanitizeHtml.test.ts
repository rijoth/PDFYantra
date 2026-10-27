// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { sanitizeHtml, sanitizeStyleDeclarations } from './sanitizeHtml';

/**
 * Asserts that nothing dangerous survived sanitization.
 */
const expectNeutralized = (dirty: string) => {
  const clean = sanitizeHtml(dirty);

  expect(clean).not.toMatch(/<script/i);
  expect(clean).not.toMatch(/\son\w+\s*=/i);
  expect(clean).not.toMatch(/javascript:/i);
  expect(clean).not.toMatch(/<iframe/i);
  expect(clean).not.toMatch(/<style/i);
  expect(clean).not.toMatch(/<svg/i);
  expect(clean).not.toMatch(/<math/i);
  expect(clean).not.toMatch(/url\(\s*['"]?http/i);
  expect(clean).not.toMatch(/@import/i);
  expect(clean).not.toMatch(/src\s*=\s*["']?\s*https?:/i);
  expect(clean).not.toMatch(/src\s*=\s*["']?\s*\/\//i);

  return clean;
};

describe('sanitizeHtml', () => {
  describe('script and handler vectors', () => {
    it('strips inline event handlers', () => {
      const clean = expectNeutralized('<img src=x onerror=alert(1)>');
      expect(clean).not.toContain('alert(1)');
    });

    it('removes <script> elements and their content', () => {
      const clean = expectNeutralized('<p>before</p><script>alert(1)</script><p>after</p>');
      expect(clean).toContain('before');
      expect(clean).toContain('after');
      expect(clean).not.toContain('alert(1)');
    });

    it('strips javascript: hrefs', () => {
      const clean = expectNeutralized('<a href="javascript:alert(1)">x</a>');
      expect(clean).toContain('x');
      expect(clean).not.toContain('href');
    });

    it('removes svg payloads', () => {
      expectNeutralized('<svg onload=alert(1)>');
    });

    it('neutralizes mutation-XSS payloads', () => {
      expectNeutralized('<math><mtext><table><mglyph><style><img src onerror=alert(1)>');
    });

    it('removes forms and form controls', () => {
      const clean = expectNeutralized('<form action="https://evil.test"><input></form>');
      expect(clean).not.toMatch(/<form|<input/i);
      expect(clean).not.toContain('evil.test');
    });

    it('removes iframes', () => {
      expectNeutralized('<iframe src="https://evil.test"></iframe>');
    });
  });

  describe('CSS vectors', () => {
    it('removes <style> blocks with @import', () => {
      const clean = expectNeutralized('<style>@import url(https://evil.test/x.css)</style>');
      expect(clean).not.toContain('evil.test');
    });

    it('drops style declarations that fetch remote resources', () => {
      const clean = expectNeutralized(
        '<div style="background:url(https://evil.test/p.png);color:red">x</div>'
      );
      expect(clean).not.toContain('evil.test');
      expect(clean).toContain('color:red');
    });

    it('drops escape-obfuscated url() declarations', () => {
      const clean = expectNeutralized(
        '<div style="background:u\\72 l(https://evil.test/p.png)">x</div>'
      );
      expect(clean).not.toContain('evil.test');
    });

    it('drops expression() and other active declarations', () => {
      expect(sanitizeStyleDeclarations('width:expression(alert(1))')).toBe('');
      expect(sanitizeStyleDeclarations('behavior:url(#default#time2)')).toBe('');
      expect(sanitizeStyleDeclarations('-moz-binding:url(x.xml#y)')).toBe('');
    });

    it('decodes CSS escapes before checking declarations', () => {
      // `u\72 l(` is `url(` once CSS escapes are resolved.
      expect(sanitizeStyleDeclarations('background:u\\72 l(https://evil.test/x.png)')).toBe('');
      expect(sanitizeStyleDeclarations('@\\69 mport url(https://evil.test/x.css)')).toBe('');
      expect(sanitizeStyleDeclarations('background:u/**/rl(https://evil.test/x.png)')).toBe('');
    });

    it('keeps escaped characters that are not dangerous', () => {
      expect(sanitizeStyleDeclarations('font-family:"Micr\\6f soft Sans"')).toContain(
        'font-family'
      );
    });

    it('survives declarations containing semicolons inside url()', () => {
      const cleaned = sanitizeStyleDeclarations(
        'background:url(data:image/png;base64,AAAA);color:blue;text-align:center'
      );
      expect(cleaned).not.toContain('url(');
      expect(cleaned).toContain('color:blue');
      expect(cleaned).toContain('text-align:center');
    });
  });

  describe('remote resource vectors', () => {
    it('removes remote images', () => {
      const clean = expectNeutralized('<img src="https://evil.test/p.png">');
      expect(clean).not.toContain('evil.test');
      expect(clean).not.toMatch(/<img/i);
    });

    it('removes srcset', () => {
      const clean = expectNeutralized('<img srcset="https://evil.test/p.png 1x">');
      expect(clean).not.toContain('evil.test');
      expect(clean).not.toMatch(/srcset/i);
    });

    it('removes protocol-relative and relative images', () => {
      expect(sanitizeHtml('<img src="//evil.test/p.png">')).not.toContain('evil.test');
      expect(sanitizeHtml('<img src="/api/private">')).not.toMatch(/<img/i);
    });

    it('removes background/poster/ping attributes', () => {
      const clean = expectNeutralized(
        '<table background="https://evil.test/bg.png"><tr><td>c</td></tr></table>' +
          '<video poster="https://evil.test/p.png"></video>'
      );
      expect(clean).not.toContain('evil.test');
    });
  });

  describe('link handling', () => {
    it('keeps http(s) and mailto links and hardens them', () => {
      const clean = sanitizeHtml(
        '<a href="https://example.test/a" target="_blank">a</a>' +
          '<a href="mailto:x@example.test">b</a>'
      );
      expect(clean).toContain('href="https://example.test/a"');
      expect(clean).toContain('href="mailto:x@example.test"');
      expect(clean).not.toContain('target=');
      expect(clean.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    });

    it('drops data:/file: hrefs', () => {
      const clean = sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
      expect(clean).not.toContain('href');
      expect(clean).not.toContain('base64');
    });
  });

  describe('benign content preservation (DOCX/XLSX fidelity)', () => {
    it('keeps tables with colspan/rowspan', () => {
      const clean = sanitizeHtml(
        '<table class="sheet"><tr><th colspan="2" rowspan="3">h</th></tr>' +
          '<tr><td style="text-align:center">1</td><td>2</td></tr></table>'
      );
      expect(clean).toContain('<table');
      expect(clean).toContain('class="sheet"');
      expect(clean).toContain('colspan="2"');
      expect(clean).toContain('rowspan="3"');
      expect(clean).toContain('text-align:center');
    });

    it('keeps headings, lists and inline emphasis', () => {
      const clean = sanitizeHtml(
        '<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>' +
          '<ul><li>u</li></ul><ol><li>o</li></ol>' +
          '<p><strong>s</strong><em>e</em><u>u</u></p>'
      );
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'u'].forEach(tag => {
        expect(clean).toContain(`<${tag}>`);
      });
    });

    it('keeps harmless style declarations', () => {
      const clean = sanitizeHtml(
        '<p style="color:red;font-weight:bold;border:1px solid #ccc;background-color:#fff;width:50%">x</p>'
      );
      expect(clean).toContain('color:red');
      expect(clean).toContain('font-weight:bold');
      expect(clean).toContain('border:1px solid #ccc');
      expect(clean).toContain('background-color:#fff');
      expect(clean).toContain('width:50%');
    });

    it('keeps inline base64 images (mammoth embeds)', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
      const clean = sanitizeHtml(`<p>text</p><img src="${dataUri}">`);
      expect(clean).toContain(`src="${dataUri}"`);
    });

    it('drops non-raster data URIs', () => {
      expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).not.toMatch(/<img/i);
      expect(sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toMatch(/<img/i);
    });

    it('strips data-* attributes', () => {
      expect(sanitizeHtml('<p data-evil="1">x</p>')).not.toContain('data-evil');
    });

    it('returns an empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });
  });

  describe('SheetJS sheet_to_html fidelity', () => {
    it('keeps the table content and drops the document wrapper', () => {
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Name', 'Qty'],
        ['Widget', 3],
      ]);
      const html = XLSX.utils.sheet_to_html(sheet);
      const clean = sanitizeHtml(html);

      expect(clean).toContain('<table');
      expect(clean).toContain('Widget');
      expect(clean).not.toMatch(/<head|<meta|<html/i);
    });
  });
});

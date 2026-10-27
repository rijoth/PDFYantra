// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { File as NodeFile } from 'node:buffer';

// --- Mocks -----------------------------------------------------------------
// The sanitizer is wrapped so we can (a) spy on the calls and (b) prove the
// sanitized output (not the raw input) is what reaches the DOM container.
vi.mock('@/utils/sanitizeHtml', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/sanitizeHtml')>();
  return {
    ...actual,
    sanitizeHtml: vi.fn((dirty: string) => `<!--SANITIZED-->\n${actual.sanitizeHtml(dirty)}`),
  };
});

const capturedElements: HTMLElement[] = [];

vi.mock('html2canvas', () => ({
  default: vi.fn(async (element: HTMLElement) => {
    capturedElements.push(element);
    return {
      width: 100,
      height: 100,
      toDataURL: () => 'data:image/jpeg;base64,AAAA',
    };
  }),
}));

vi.mock('pdf-lib', () => {
  const image = { width: 100, height: 100 };
  const page = { drawImage: () => undefined };
  return {
    PDFDocument: {
      create: async () => ({
        embedJpg: async () => image,
        embedPng: async () => image,
        addPage: () => page,
        save: async () => new Uint8Array([1, 2, 3]),
      }),
    },
    rgb: () => ({}),
  };
});

vi.mock('@/services/pdfjsSetup', () => ({
  pdfjs: { getDocument: vi.fn() },
}));

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(async () => ({
      value: '<p class="docx">hello</p><img src="data:image/png;base64,AAAA">',
      messages: [],
    })),
  },
}));

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_html: vi.fn(
      () =>
        '<html><head><meta charset="utf-8"/></head><body><table><tr><td>cell</td></tr></table></body></html>'
    ),
  },
}));

import { convertToPdf } from '@/services/conversionService';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

const sanitizeSpy = vi.mocked(sanitizeHtml);

// jsdom's File is compatible with the DOM `File` the service expects.
const makeFile = (name: string, content: string): File =>
  new File([content], name) as unknown as File & NodeFile;

describe('conversion paths sanitize HTML before DOM insertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedElements.length = 0;
  });

  it('sanitizes uploaded HTML', async () => {
    const dirty = '<h1>Title</h1><img src="https://evil.test/p.png" onerror="alert(1)">';
    const file = makeFile('doc.html', dirty);

    await convertToPdf([file]);

    expect(sanitizeSpy).toHaveBeenCalledTimes(1);
    expect(sanitizeSpy).toHaveBeenCalledWith(dirty);

    const container = capturedElements.at(-1);
    expect(container?.innerHTML).toContain('SANITIZED');
    expect(container?.innerHTML).not.toContain('evil.test');
    expect(container?.innerHTML).not.toMatch(/onerror/i);
  });

  it('sanitizes mammoth DOCX output', async () => {
    const file = makeFile('doc.docx', 'binary');

    await convertToPdf([file]);

    expect(sanitizeSpy).toHaveBeenCalledTimes(1);

    const container = capturedElements.at(-1);
    expect(container?.innerHTML).toContain('SANITIZED');
    expect(container?.innerHTML).toContain('class="mammoth-output"');
    expect(container?.innerHTML).toContain('hello');
    // data: raster images embedded by mammoth must survive.
    expect(container?.innerHTML).toContain('data:image/png;base64,AAAA');
    // locally injected stylesheet is still appended
    expect(container?.querySelector('style')?.textContent).toContain('.mammoth-output');
  });

  it('sanitizes XLSX/XLS/CSV sheet_to_html output', async () => {
    const file = makeFile('sheet.xlsx', 'binary');

    await convertToPdf([file]);

    expect(sanitizeSpy).toHaveBeenCalledTimes(1);
    expect(sanitizeSpy.mock.calls[0][0]).toContain('<table>');

    const container = capturedElements.at(-1);
    expect(container?.innerHTML).toContain('SANITIZED');
    expect(container?.innerHTML).toContain('cell');
    expect(container?.innerHTML).not.toMatch(/<meta/i);
  });

  it('escapes TXT without running it through the sanitizer', async () => {
    const file = makeFile('notes.txt', '<script>alert(1)</script> & "quotes"');

    await convertToPdf([file]);

    expect(sanitizeSpy).not.toHaveBeenCalled();

    const container = capturedElements.at(-1);
    expect(container?.innerHTML).not.toMatch(/<script/i);
    expect(container?.innerHTML).toContain('&amp;');
  });

  it('hardens the html2canvas call against remote fetches', async () => {
    const html2canvas = (await import('html2canvas')).default;
    const spy = vi.mocked(html2canvas);

    await convertToPdf([makeFile('doc.html', '<h1>x</h1>')]);

    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(options.useCORS).toBe(false);
    expect(options.allowTaint).toBe(false);
    expect(options.foreignObjectRendering).toBe(false);
    expect(typeof options.imageTimeout).toBe('number');
    expect(options.imageTimeout).toBeGreaterThan(0);
    expect(options.imageTimeout).toBeLessThanOrEqual(30000);
    expect(options).not.toHaveProperty('proxy');
  });

  it('removes the hidden container even when rendering fails', async () => {
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('render boom'));
    const before = document.body.childElementCount;

    await expect(convertToPdf([makeFile('doc.html', '<h1>x</h1>')])).rejects.toThrow(
      /Conversion failed/
    );

    expect(document.body.childElementCount).toBe(before);
  });
});

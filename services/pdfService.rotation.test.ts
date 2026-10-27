// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';

// 1x1 JPEG. Real bytes so pdf-lib can embed the mocked canvas output.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

// The renderers only need PDF.js for `getDocument`; pages are faked below.
vi.mock('@/services/pdfjsSetup', () => ({
  pdfjs: { getDocument: vi.fn() },
}));
vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('mammoth', () => ({ default: {} }));
vi.mock('xlsx', () => ({ read: vi.fn(), utils: {} }));

import { pdfjs } from '@/services/pdfjsSetup';
import { compressPdfFile } from '@/services/pdfService';
import { convertFromPdf } from '@/services/conversionService';
import type { PDFPage, UploadedFile } from '@/types';

type PageSpec = { rotate: number; width: number; height: number };
type ViewportOptions = { scale: number; rotation?: number };

const jpegBytes = Uint8Array.from(atob(JPEG_BASE64), char => char.charCodeAt(0));
const fakeContext = { clearRect: vi.fn() };

const makeViewport = (spec: PageSpec, { scale, rotation }: ViewportOptions) => {
  const effective = (((rotation ?? spec.rotate) % 360) + 360) % 360;
  const swapped = effective === 90 || effective === 270;
  return {
    width: (swapped ? spec.height : spec.width) * scale,
    height: (swapped ? spec.width : spec.height) * scale,
  };
};

/**
 * Installs a fake PDF.js document. Intrinsic rotations/sizes are derived from a
 * real pdf-lib fixture, so the fake mirrors what PDF.js would report.
 * Returns the recorded `getViewport` arguments per page index.
 */
const installFakeDocument = (specs: PageSpec[]): ViewportOptions[][] => {
  const getViewportCalls: ViewportOptions[][] = specs.map(() => []);

  const fakeDoc = {
    numPages: specs.length,
    getPage: vi.fn(async (pageNumber: number) => {
      const index = pageNumber - 1;
      const spec = specs[index];
      return {
        rotate: spec.rotate,
        getViewport: vi.fn((options: ViewportOptions) => {
          getViewportCalls[index].push(options);
          return { ...makeViewport(spec, options), ...options };
        }),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
      };
    }),
  };

  vi.mocked(pdfjs.getDocument).mockReturnValue({ promise: Promise.resolve(fakeDoc) });

  return getViewportCalls;
};

const makeSourcePdf = async (): Promise<{ file: File; specs: PageSpec[] }> => {
  const doc = await PDFDocument.create();
  const rotated = doc.addPage([200, 100]);
  rotated.setRotation(degrees(90));
  doc.addPage([300, 100]); // intrinsic 0

  const bytes = await doc.save();
  const fileBytes = new Uint8Array(bytes.length);
  fileBytes.set(bytes);
  const file = new File([fileBytes], 'source.pdf', { type: 'application/pdf' });

  const loaded = await PDFDocument.load(bytes);
  const specs = loaded.getPages().map(page => ({
    rotate: page.getRotation().angle,
    width: page.getSize().width,
    height: page.getSize().height,
  }));

  return { file, specs };
};

const makePage = (pageIndex: number, rotation: number): PDFPage => ({
  id: `page-${pageIndex}-${rotation}`,
  fileId: 'file-a',
  pageIndex,
  pageNumber: pageIndex + 1,
  thumbnailUrl: '',
  rotation,
});

beforeEach(() => {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string
  ) => {
    if (tagName === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => fakeContext,
        toBlob: (callback: BlobCallback) =>
          callback(new Blob([jpegBytes], { type: 'image/jpeg' })),
      } as unknown as HTMLElement;
    }
    return originalCreateElement(tagName);
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compressPdfFile rotation and workspace page list', () => {
  it('passes intrinsic + workspace rotation to PDF.js and swaps 90/270 page dimensions', async () => {
    const { file, specs } = await makeSourcePdf();
    const getViewportCalls = installFakeDocument(specs);
    const pages = [makePage(0, 90), makePage(1, 90)];

    const result = await compressPdfFile(file, 0.75, 2, () => undefined, pages);

    // Page 0: intrinsic 90 + workspace 90 = 180. Page 1: 0 + 90 = 90.
    // Both the scale-1 page-size viewport and the render viewport use it.
    expect(getViewportCalls[0]).toEqual([
      { scale: 1, rotation: 180 },
      { scale: 2, rotation: 180 },
    ]);
    expect(getViewportCalls[1]).toEqual([
      { scale: 1, rotation: 90 },
      { scale: 2, rotation: 90 },
    ]);

    const output = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(output.getPageCount()).toBe(pages.length);

    const page0 = output.getPage(0).getSize();
    expect(page0.width).toBeCloseTo(200); // 180 does not swap
    expect(page0.height).toBeCloseTo(100);

    const page1 = output.getPage(1).getSize();
    expect(page1.width).toBeCloseTo(100); // 90 swaps
    expect(page1.height).toBeCloseTo(300);
  });

  it('emits exactly the workspace pages in workspace order', async () => {
    const { file, specs } = await makeSourcePdf();
    installFakeDocument(specs);

    // Workspace order is page 2 (300x100) then page 1 (200x100, intrinsic 90).
    const result = await compressPdfFile(file, 0.75, 1, () => undefined, [
      makePage(1, 0),
      makePage(0, 0),
    ]);

    const output = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(output.getPageCount()).toBe(2);

    const first = output.getPage(0).getSize();
    expect(first.width).toBeCloseTo(300);
    expect(first.height).toBeCloseTo(100);

    // Intrinsic /Rotate 90 is preserved when the workspace rotation is 0.
    const second = output.getPage(1).getSize();
    expect(second.width).toBeCloseTo(100);
    expect(second.height).toBeCloseTo(200);
  });

  it('embeds a duplicated (pageIndex, rotation) render only once', async () => {
    const { file, specs } = await makeSourcePdf();
    installFakeDocument(specs);
    const embedSpy = vi.spyOn(PDFDocument.prototype, 'embedJpg');

    // page 0 workspace-0 (intrinsic 90), duplicate, page 0 workspace-90 (180), page 1 (0).
    const pages = [makePage(0, 0), makePage(0, 0), makePage(0, 90), makePage(1, 0)];
    const result = await compressPdfFile(file, 0.75, 1, () => undefined, pages);

    expect(embedSpy).toHaveBeenCalledTimes(3);

    const output = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(output.getPageCount()).toBe(pages.length);
  });

  it('rejects an empty page list instead of producing an empty PDF', async () => {
    const { file, specs } = await makeSourcePdf();
    installFakeDocument(specs);

    await expect(compressPdfFile(file, 0.75, 1, () => undefined, [])).rejects.toThrow(
      /No pages to compress/
    );
  });

  it('compresses the whole file unchanged when no page list is supplied', async () => {
    const { file, specs } = await makeSourcePdf();
    const getViewportCalls = installFakeDocument(specs);

    const result = await compressPdfFile(file, 0.75, 1, () => undefined);

    // Workspace rotation defaults to 0, so only the intrinsic /Rotate applies.
    expect(getViewportCalls[0]).toEqual([
      { scale: 1, rotation: 90 },
      { scale: 1, rotation: 90 },
    ]);
    expect(getViewportCalls[1]).toEqual([
      { scale: 1, rotation: 0 },
      { scale: 1, rotation: 0 },
    ]);

    const output = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(output.getPageCount()).toBe(specs.length);
  });
});

describe('convertFromPdf rotation', () => {
  it('renders exported images with the combined rotation', async () => {
    const { file, specs } = await makeSourcePdf();
    const getViewportCalls = installFakeDocument(specs);

    const fileMap = new Map<string, UploadedFile>([
      ['file-a', { id: 'file-a', file, name: 'source.pdf', size: file.size, color: '#123456' }],
    ]);

    // Page 0 carries intrinsic /Rotate 90; the Organizer adds another 90.
    const result = await convertFromPdf([makePage(0, 90)], fileMap, 'jpg');

    expect(getViewportCalls[0]).toEqual([{ scale: 2, rotation: 180 }]);
    expect(result.isZip).toBe(false);
    expect(result.blob.type).toBe('image/jpeg');
  });

  it('renders every page of a multi-page zip export with its combined rotation', async () => {
    const { file, specs } = await makeSourcePdf();
    const getViewportCalls = installFakeDocument(specs);

    const fileMap = new Map<string, UploadedFile>([
      ['file-a', { id: 'file-a', file, name: 'source.pdf', size: file.size, color: '#123456' }],
    ]);

    const result = await convertFromPdf(
      [makePage(0, 90), makePage(1, 90), makePage(0, 270)],
      fileMap,
      'png'
    );

    expect(getViewportCalls[0]).toEqual([
      { scale: 2, rotation: 180 },
      { scale: 2, rotation: 0 }, // 90 + 270 = 0 after wraparound
    ]);
    expect(getViewportCalls[1]).toEqual([{ scale: 2, rotation: 90 }]);
    expect(result.isZip).toBe(true);
  });
});

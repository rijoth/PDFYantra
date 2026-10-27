import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFPage, UploadedFile } from '../types';

const { generateThumbnailsMock } = vi.hoisted(() => ({
  generateThumbnailsMock: vi.fn(),
}));

vi.mock('../services/pdfService', () => ({
  generateThumbnails: generateThumbnailsMock,
  regenerateThumbnailsForFile: vi.fn(),
}));

import { usePdfStore } from './usePdfStore';

const makeFile = (id: string): UploadedFile => {
  const blob = new Blob([`%PDF-${id}`], { type: 'application/pdf' });
  return {
    id,
    file: new File([blob], `${id}.pdf`, { type: 'application/pdf' }),
    name: `${id}.pdf`,
    size: blob.size,
    color: '#123456',
  };
};

const makePage = (fileId: string, pageIndex: number, rotation = 0): PDFPage => ({
  id: `${fileId}-p${pageIndex}`,
  fileId,
  pageIndex,
  pageNumber: pageIndex + 1,
  thumbnailUrl: `blob:old-${fileId}-${pageIndex}`,
  rotation,
});

const newPage = (pageIndex: number, rotation = 0): PDFPage => ({
  id: `new-a-p${pageIndex}`,
  fileId: 'a',
  pageIndex,
  pageNumber: pageIndex + 1,
  thumbnailUrl: `blob:new-a-${pageIndex}`,
  rotation,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  usePdfStore.setState({
    files: new Map(),
    pages: [],
    selectedPageIds: new Set(),
    past: [],
    future: [],
    isInitialized: false, // keep the debounced persistence out of this test
  });
});

describe('replaceFileContent slot-wise replacement', () => {
  it('keeps workspace positions while swapping in the new file pages', async () => {
    const files = new Map<string, UploadedFile>([
      ['a', makeFile('a')],
      ['b', makeFile('b')],
    ]);

    // A is reordered (page 3 then page 1) and its middle page was deleted.
    // A and B pages are interleaved.
    const originalPages = [
      makePage('a', 2, 90), // A slot 0
      makePage('b', 0),
      makePage('a', 0, 180), // A slot 1
      makePage('b', 1),
    ];

    usePdfStore.setState({ files, pages: originalPages, past: [], future: [] });
    generateThumbnailsMock.mockResolvedValue([newPage(0), newPage(1)]);

    await usePdfStore
      .getState()
      .replaceFileContent('a', new Blob(['%PDF-compressed'], { type: 'application/pdf' }), 'a_compressed.pdf');

    const state = usePdfStore.getState();

    // Positions (and interleaving with B) are preserved.
    expect(state.pages.map(p => p.fileId)).toEqual(['a', 'b', 'a', 'b']);
    expect(state.pages.map(p => p.id)).toEqual([
      'a-p2',
      'b-p0',
      'a-p0',
      'b-p1',
    ]);

    // A's k-th workspace page now points at the new file's k-th page,
    // with the rotation baked in (reset to 0).
    expect(state.pages[0]).toMatchObject({
      fileId: 'a',
      pageIndex: 0,
      pageNumber: 1,
      thumbnailUrl: 'blob:new-a-0',
      rotation: 0,
    });
    expect(state.pages[2]).toMatchObject({
      fileId: 'a',
      pageIndex: 1,
      pageNumber: 2,
      thumbnailUrl: 'blob:new-a-1',
      rotation: 0,
    });

    // B's pages are untouched.
    expect(state.pages[1]).toBe(originalPages[1]);
    expect(state.pages[3]).toBe(originalPages[3]);

    // The replacement file is registered under the same id.
    expect(state.files.get('a')?.name).toBe('a_compressed.pdf');
    expect(state.files.get('a')?.size).toBeGreaterThan(0);

    // Exactly one history entry, so the replace is undoable.
    expect(state.past).toHaveLength(1);
    expect(state.future).toHaveLength(0);

    usePdfStore.getState().undo();
    expect(usePdfStore.getState().pages.map(p => p.id)).toEqual(originalPages.map(p => p.id));
    expect(usePdfStore.getState().pages.map(p => p.rotation)).toEqual([90, 0, 180, 0]);
  });

  it('regenerates thumbnails from the new file content', async () => {
    usePdfStore.setState({
      files: new Map([['a', makeFile('a')]]),
      pages: [makePage('a', 0, 90)],
    });
    generateThumbnailsMock.mockResolvedValue([newPage(0)]);

    const compressedBlob = new Blob(['%PDF-compressed'], { type: 'application/pdf' });
    await usePdfStore.getState().replaceFileContent('a', compressedBlob, 'a_compressed.pdf');

    expect(generateThumbnailsMock).toHaveBeenCalledTimes(1);
    const passedFile = generateThumbnailsMock.mock.calls[0][0] as UploadedFile;
    expect(passedFile.id).toBe('a');
    expect(passedFile.name).toBe('a_compressed.pdf');
  });
});

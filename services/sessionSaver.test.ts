import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedSaver, SAVE_DEBOUNCE_MS } from './sessionSaver';
import { makePage, makeUploadedFile } from '../test/idbTestUtils';
import type { PDFPage, ToolType, UploadedFile } from '../types';

type SaveFn = (
  files: Map<string, UploadedFile>,
  pages: PDFPage[],
  activeTool: ToolType
) => Promise<void>;

const createSaveMock = () => vi.fn<SaveFn>(async () => undefined);

const snapshot = (id: string) => ({
  files: new Map([[id, makeUploadedFile(id)]]),
  pages: [makePage(id, 0)],
  activeTool: 'merge' as const,
});

describe('createDebouncedSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('writes only the latest snapshot after the debounce window', async () => {
    const save = createSaveMock();
    const saver = createDebouncedSaver(SAVE_DEBOUNCE_MS, save);

    const first = snapshot('a');
    const second = snapshot('b');
    saver.schedule(first.files, first.pages, first.activeTool);
    saver.schedule(second.files, second.pages, second.activeTool);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(Array.from(save.mock.calls[0][0].keys())).toEqual(['b']);
  });

  it('drops the pending snapshot on cancel', async () => {
    const save = createSaveMock();
    const saver = createDebouncedSaver(SAVE_DEBOUNCE_MS, save);
    const { files, pages, activeTool } = snapshot('a');

    saver.schedule(files, pages, activeTool);
    saver.cancel();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 4);
    await saver.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it('flush writes the pending snapshot immediately and resolves with it', async () => {
    const save = createSaveMock();
    const saver = createDebouncedSaver(SAVE_DEBOUNCE_MS, save);
    const { files, pages, activeTool } = snapshot('a');

    saver.schedule(files, pages, activeTool);
    const flushed = saver.flush();

    expect(save).toHaveBeenCalledTimes(1);
    await flushed;

    // The cancelled timer must not trigger a second write.
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 4);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush without a pending snapshot does not write anything', async () => {
    const save = createSaveMock();
    const saver = createDebouncedSaver(SAVE_DEBOUNCE_MS, save);

    await expect(saver.flush()).resolves.toBeUndefined();

    expect(save).not.toHaveBeenCalled();
  });

  it('does not surface a failed background save as an unhandled rejection', async () => {
    const save = vi.fn<SaveFn>(async () => {
      throw new Error('disk full');
    });
    const saver = createDebouncedSaver(SAVE_DEBOUNCE_MS, save);
    const { files, pages, activeTool } = snapshot('a');

    saver.schedule(files, pages, activeTool);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    // flush resolves through the settled in-flight save instead of rejecting.
    await expect(saver.flush()).resolves.toBeUndefined();
  });
});

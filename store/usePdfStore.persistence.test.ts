import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StorageService from '../services/storageService';
import type * as StoreModule from './usePdfStore';
import {
  clearRawDB,
  makePage,
  makeUploadedFile,
  readFiles,
  readMetadataValue,
} from '../test/idbTestUtils';

const originalPut = IDBObjectStore.prototype.put;

let storage: typeof StorageService;
let usePdfStore: typeof StoreModule.usePdfStore;

const addFile = (id: string) => {
  usePdfStore.getState().addFilesAndPages([makeUploadedFile(id)], [makePage(id, 0)]);
};

// fake-indexeddb schedules its work with setImmediate, which is intentionally
// left real so it is not faked by the debounce timers.
const waitForImmediate = async (predicate: () => boolean, attempts = 100): Promise<void> => {
  for (let i = 0; i < attempts && !predicate(); i += 1) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
};

beforeEach(async () => {
  // Only the debounce timers are faked: fake-indexeddb needs the real timers.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.resetModules();
  await clearRawDB();

  storage = await import('../services/storageService');
  usePdfStore = (await import('./usePdfStore')).usePdfStore;
  usePdfStore.getState().setInitialized(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('workspace persistence', () => {
  it('persists the workspace once the debounce elapses', async () => {
    addFile('a');
    await vi.advanceTimersByTimeAsync(100);

    expect(await readFiles()).toEqual([]);

    await vi.advanceTimersByTimeAsync(400);

    expect((await readFiles()).map(f => f.id)).toEqual(['a']);
    expect(await readMetadataValue('pages')).toEqual([makePage('a', 0)]);
  });

  // (a) save scheduled, then clear, then timers advance
  it('drops the pending debounced save when the workspace is cleared', async () => {
    addFile('a');
    await vi.advanceTimersByTimeAsync(100);

    await usePdfStore.getState().clearWorkspace();

    expect(usePdfStore.getState().files.size).toBe(0);
    expect(await readFiles()).toEqual([]);

    // The save of the (empty) post-clear state is allowed, as long as it is
    // ordered after the clear and never resurrects the dropped snapshot.
    await vi.advanceTimersByTimeAsync(1000);

    expect(await readFiles()).toEqual([]);
    expect((await readMetadataValue('pages')) ?? []).toEqual([]);
  });

  // (b) save already running, then clear
  it('clears the workspace when the clear happens while a save is writing', async () => {
    addFile('a');

    let clearPromise: Promise<void> | null = null;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      const request =
        key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      if (!clearPromise) {
        // The user hits "Clear Workspace" while this save is writing rows.
        clearPromise = usePdfStore.getState().clearWorkspace();
      }
      return request;
    } as typeof IDBObjectStore.prototype.put);

    await vi.advanceTimersByTimeAsync(400);
    await waitForImmediate(() => clearPromise !== null);

    expect(clearPromise).not.toBeNull();
    await clearPromise!;
    await vi.advanceTimersByTimeAsync(1000);

    expect(await readFiles()).toEqual([]);
    expect(usePdfStore.getState().files.size).toBe(0);
  });

  // (c) clear, then add a new file
  it('persists only the file that was added after a clear', async () => {
    addFile('old');
    await vi.advanceTimersByTimeAsync(400);
    expect((await readFiles()).map(f => f.id)).toEqual(['old']);

    await usePdfStore.getState().clearWorkspace();
    addFile('new');
    await vi.advanceTimersByTimeAsync(400);

    expect((await readFiles()).map(f => f.id)).toEqual(['new']);
    expect(await readMetadataValue('pages')).toEqual([makePage('new', 0)]);
  });

  // (g) clearWorkspace resolution
  it('resolves clearWorkspace only after IndexedDB has been cleared', async () => {
    addFile('a');
    await vi.advanceTimersByTimeAsync(400);
    expect((await readFiles()).map(f => f.id)).toEqual(['a']);

    const clearPromise = usePdfStore.getState().clearWorkspace();

    // The UI reset is synchronous so the workspace disappears instantly.
    expect(usePdfStore.getState().files.size).toBe(0);
    expect(usePdfStore.getState().pages).toEqual([]);

    let resolved = false;
    void clearPromise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await clearPromise;

    expect(resolved).toBe(true);
    expect(await readFiles()).toEqual([]);
    expect(await readMetadataValue('pages')).toBeUndefined();
  });

  it('reports a failed wipe through the store error message instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementationOnce(() => {
      throw new Error('wipe failed');
    });

    await expect(usePdfStore.getState().clearWorkspace()).resolves.toBeUndefined();

    expect(usePdfStore.getState().errorMessage).toContain('Could not clear the saved workspace');
  });

  it('does not save before the app has finished initializing', async () => {
    usePdfStore.getState().setInitialized(false);
    addFile('a');
    await vi.advanceTimersByTimeAsync(1000);

    expect(await readFiles()).toEqual([]);

    // Sanity: the same change is persisted once initialization completed.
    usePdfStore.getState().setInitialized(true);
    addFile('b');
    await vi.advanceTimersByTimeAsync(1000);

    expect((await readFiles()).map(f => f.id).sort()).toEqual(['a', 'b']);
  });
});

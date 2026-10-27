import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StorageService from './storageService';
import {
  clearRawDB,
  makePage,
  makeUploadedFile,
  readFiles,
  readMetadata,
  readMetadataValue,
} from '../test/idbTestUtils';

type Storage = typeof StorageService;

/** Raw (fake) IndexedDB prototypes, spied on to observe transaction ordering. */
const originalTransaction = IDBDatabase.prototype.transaction;
const originalPut = IDBObjectStore.prototype.put;
const originalGetAll = IDBObjectStore.prototype.getAll;

let storage: Storage;

const suppressConsoleError = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

const fileMap = (id: string) => new Map([[id, makeUploadedFile(id)]]);

beforeEach(async () => {
  // Only the debounce timers are faked: fake-indexeddb needs the real timers.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.resetModules();
  await clearRawDB();
  storage = await import('./storageService');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('storageService', () => {
  it('round-trips a saved session and drops files removed from the workspace', async () => {
    await storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge');
    await storage.saveSession(fileMap('b'), [makePage('b', 0)], 'split');

    expect((await readFiles()).map(f => f.id)).toEqual(['b']);
    expect(await readMetadataValue('pages')).toEqual([makePage('b', 0)]);
    expect(await readMetadataValue('activeTool')).toBe('split');

    const loaded = await storage.loadSession();
    expect(loaded?.activeTool).toBe('split');
    expect(Array.from(loaded?.files.keys() ?? [])).toEqual(['b']);
  });

  // (c) clear, then add a new file
  it('keeps only the new file when a save follows a clear', async () => {
    await storage.saveSession(fileMap('old'), [makePage('old', 0)], 'merge');
    await storage.clearSession();

    expect(await readFiles()).toEqual([]);
    expect(await readMetadata()).toEqual([]);

    await storage.saveSession(fileMap('new'), [makePage('new', 0)], 'merge');

    expect((await readFiles()).map(f => f.id)).toEqual(['new']);
    expect(await readMetadataValue('pages')).toEqual([makePage('new', 0)]);
  });

  // (b) pending save vs. clear
  it('drops a save that is still queued when the clear happens', async () => {
    const save = storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge');

    // The clear is requested while the save has not been written yet.
    const clear = storage.clearSession();
    await Promise.all([save, clear]);

    expect(await readFiles()).toEqual([]);
    expect(await readMetadataValue('pages')).toBeUndefined();
  });

  // (b) in-flight save vs. clear
  it('does not let a save that is mid-transaction land after the clear', async () => {
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
        clearPromise = storage.clearSession();
      }
      return request;
    } as typeof IDBObjectStore.prototype.put);

    const file = makeUploadedFile('a');
    await storage.saveSession(new Map([[file.id, file]]), [makePage('a', 0)], 'merge');

    expect(clearPromise).not.toBeNull();
    await clearPromise!;

    expect(await readFiles()).toEqual([]);
    expect(await readMetadataValue('pages')).toBeUndefined();
  });

  // (d) serialization
  it('runs IndexedDB operations strictly one at a time', async () => {
    const events: string[] = [];

    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      storeNames: string | string[],
      mode?: IDBTransactionMode
    ) {
      const tx = originalTransaction.call(this, storeNames, mode);
      events.push(`begin:${mode}`);
      tx.addEventListener('complete', () => events.push(`end:${mode}`));
      tx.addEventListener('error', () => events.push(`end:${mode}`));
      return tx;
    } as typeof IDBDatabase.prototype.transaction);

    await Promise.all([
      storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge'),
      storage.saveSession(fileMap('b'), [makePage('b', 0)], 'merge'),
      storage.loadSession(),
    ]);

    expect(events).toEqual([
      'begin:readwrite',
      'end:readwrite',
      'begin:readwrite',
      'end:readwrite',
      'begin:readonly',
      'end:readonly',
    ]);
  });

  // (e) failure isolation
  it('does not let one failing operation block the next one', async () => {
    const consoleErrorSpy = suppressConsoleError();

    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('storage exploded');
    });

    await expect(
      storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge')
    ).rejects.toThrow('storage exploded');

    await expect(
      storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge')
    ).resolves.toBeUndefined();

    expect((await readFiles()).map(f => f.id)).toEqual(['a']);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // (f) stale load is discarded
  it('discards a load that is queued before a clear', async () => {
    await storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge');

    const load = storage.loadSession();
    const clear = storage.clearSession();
    const [loaded] = await Promise.all([load, clear]);

    expect(loaded).toBeNull();
    expect(await readFiles()).toEqual([]);
  });

  // (f) stale load that is already reading is discarded too
  it('discards a load whose read is in flight when the clear happens', async () => {
    await storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge');

    let clearPromise: Promise<void> | null = null;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore) {
      const request = originalGetAll.call(this);
      if (!clearPromise) {
        clearPromise = storage.clearSession();
      }
      return request;
    } as typeof IDBObjectStore.prototype.getAll);

    const loaded = await storage.loadSession();

    expect(loaded).toBeNull();
    expect(clearPromise).not.toBeNull();
    await clearPromise!;
    expect(await readFiles()).toEqual([]);
  });

  it('still loads normally when no clear races it', async () => {
    await storage.saveSession(fileMap('a'), [makePage('a', 0)], 'merge');

    const loaded = await storage.loadSession();

    expect(loaded).not.toBeNull();
    expect(Array.from(loaded!.files.keys())).toEqual(['a']);
    expect(loaded!.pages).toEqual([makePage('a', 0)]);
  });
});

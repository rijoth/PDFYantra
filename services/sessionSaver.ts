import { PDFPage, ToolType, UploadedFile } from '../types';
import { saveSession } from './storageService';

export const SAVE_DEBOUNCE_MS = 400;

export interface WorkspaceSnapshot {
  files: Map<string, UploadedFile>;
  pages: PDFPage[];
  activeTool: ToolType;
}

export interface DebouncedSaver {
  /** Queues a save of this snapshot, replacing any snapshot not written yet. */
  schedule: (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType) => void;
  /** Drops the pending snapshot and its timer. Never touches an in-flight save. */
  cancel: () => void;
  /** Writes the pending snapshot immediately (if any) and resolves once it settled. */
  flush: () => Promise<void>;
}

/**
 * Small debounced wrapper around `saveSession`.
 *
 * `cancel()` is deliberately synchronous so that callers which must not race
 * with persistence (e.g. clearing the workspace) can drop a pending snapshot
 * before they mutate the store.
 */
export const createDebouncedSaver = (
  delayMs: number = SAVE_DEBOUNCE_MS,
  save: typeof saveSession = saveSession
): DebouncedSaver => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: WorkspaceSnapshot | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const startSave = (snapshot: WorkspaceSnapshot): Promise<void> => {
    const run = save(snapshot.files, snapshot.pages, snapshot.activeTool);
    // Background saves must not surface as unhandled rejections; the storage
    // service already logs the failure.
    inFlight = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancel = () => {
    clearTimer();
    pending = null;
  };

  const schedule = (files: Map<string, UploadedFile>, pages: PDFPage[], activeTool: ToolType) => {
    pending = { files, pages, activeTool };
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      const snapshot = pending;
      pending = null;
      if (!snapshot) return;
      startSave(snapshot).catch(() => undefined);
    }, delayMs);
  };

  const flush = (): Promise<void> => {
    if (!pending) {
      clearTimer();
      return inFlight;
    }

    clearTimer();
    const snapshot = pending;
    pending = null;
    return startSave(snapshot);
  };

  return { schedule, cancel, flush };
};

// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobalErrorHandlers } from './useGlobalErrorHandlers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const Probe = ({ setError }: { setError: (message: string | null) => void }) => {
  useGlobalErrorHandlers(setError);
  return null;
};

const dispatchWindowError = (error: unknown) => {
  const event = new ErrorEvent('error', {
    error,
    message: error instanceof Error ? error.message : String(error),
    cancelable: true,
  });
  // jsdom reports uncancelled error events as uncaught exceptions.
  event.preventDefault();
  window.dispatchEvent(event);
};

const dispatchUnhandledRejection = (reason: unknown) => {
  const event = new Event('unhandledrejection') as Event & { reason?: unknown };
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
};

const mount = (setError: (message: string | null) => void) => {
  act(() => {
    root.render(<Probe setError={setError} />);
  });
};

describe('useGlobalErrorHandlers', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('dedupes identical consecutive errors and reports each distinct error once', () => {
    const setError = vi.fn();
    mount(setError);

    dispatchWindowError(new Error('same failure'));
    dispatchWindowError(new Error('same failure'));
    dispatchUnhandledRejection(new Error('same failure'));

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError.mock.calls[0][0]).toContain('same failure');

    dispatchWindowError(new Error('different failure'));
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError.mock.calls[1][0]).toContain('different failure');
  });

  it('ignores ResizeObserver loop noise', () => {
    const setError = vi.fn();
    mount(setError);

    dispatchWindowError(new Error('ResizeObserver loop limit exceeded'));

    expect(setError).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const setError = vi.fn();
    mount(setError);

    act(() => {
      root.unmount();
    });

    dispatchUnhandledRejection(new Error('after unmount'));

    expect(setError).not.toHaveBeenCalled();
  });
});

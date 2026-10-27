// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { clearSessionMock } = vi.hoisted(() => ({
  clearSessionMock: vi.fn(),
}));

vi.mock('@/services/storageService', () => ({
  clearSession: clearSessionMock,
}));

import ErrorBoundary from './ErrorBoundary';
import ErrorFallback from './ErrorFallback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reloadMock = vi.fn();

// React's dev-mode guarded callback reports caught render errors through a
// window error event. Cancelling it keeps jsdom from printing the stack trace
// while React still receives the error object it needs.
const preventJsdomErrorReport = (event: ErrorEvent) => {
  event.preventDefault();
};

let container: HTMLDivElement;
let root: Root;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const getButton = (label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button')).find(
    element => element.textContent?.trim() === label
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button as HTMLButtonElement;
};

const click = (label: string) => {
  const button = getButton(label);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const renderInBoundary = (
  children: React.ReactNode,
  resetKeys?: unknown[],
  onGoHome: () => void = () => undefined
) => {
  act(() => {
    root.render(
      <ErrorBoundary
        resetKeys={resetKeys}
        fallback={({ error, reset }) => (
          <ErrorFallback
            error={error}
            reset={reset}
            onGoHome={onGoHome}
            variant="tool"
          />
        )}
      >
        {children}
      </ErrorBoundary>
    );
  });
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Expected React/ErrorBoundary diagnostics only.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.addEventListener('error', preventJsdomErrorReport, true);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });

    clearSessionMock.mockReset();
    clearSessionMock.mockResolvedValue(undefined);
    reloadMock.mockReset();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.removeEventListener('error', preventJsdomErrorReport, true);
    consoleErrorSpy.mockRestore();
  });

  it('renders the fallback when a child throws and recovers after Try again', () => {
    let shouldThrow = true;

    const FlakyChild = () => {
      if (shouldThrow) throw new Error('boom');
      return <div>Recovered content</div>;
    };

    renderInBoundary(<FlakyChild />);

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Something went wrong in this tool');

    const heading = alert?.querySelector('h2');
    expect(document.activeElement).toBe(heading);

    shouldThrow = false;
    click('Try again');

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Recovered content');
  });

  it('clears the error automatically when resetKeys change', () => {
    const KeyedChild = ({ fail }: { fail: boolean }) => {
      if (fail) throw new Error('key changed boom');
      return <div>Stable content</div>;
    };

    renderInBoundary(<KeyedChild fail />, [0]);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    renderInBoundary(<KeyedChild fail={false} />, [1]);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Stable content');
  });

  it('does not clear the error when resetKeys are shallow-equal', () => {
    const KeyedChild = ({ fail }: { fail: boolean }) => {
      if (fail) throw new Error('still failing');
      return <div>Stable content</div>;
    };

    renderInBoundary(<KeyedChild fail />, [0]);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    renderInBoundary(<KeyedChild fail />, [0]);

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('requires two clicks before clearing the saved workspace and reloading', async () => {
    act(() => {
      root.render(
        <ErrorFallback
          error={new Error('boom')}
          reset={() => undefined}
          onGoHome={() => undefined}
          variant="tool"
        />
      );
    });

    click('Reset saved workspace and reload');

    expect(getButton('Click again to confirm')).not.toBeUndefined();
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();

    await act(async () => {
      getButton('Click again to confirm').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(clearSessionMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('shows chunk-load specific guidance with a Reload page button', () => {
    act(() => {
      root.render(
        <ErrorFallback
          error={new Error('Failed to fetch dynamically imported module: /assets/tool.js')}
          reset={() => undefined}
          onGoHome={() => undefined}
          variant="tool"
        />
      );
    });

    expect(container.textContent).toContain('could not load part of the app');
    expect(getButton('Reload page')).not.toBeUndefined();

    click('Reload page');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('calls the Go to home handler without reloading', () => {
    const onGoHome = vi.fn();

    act(() => {
      root.render(
        <ErrorFallback
          error={new Error('boom')}
          reset={() => undefined}
          onGoHome={onGoHome}
          variant="tool"
        />
      );
    });

    click('Go to home');

    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});

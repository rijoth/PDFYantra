import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { clearSession } from '../services/storageService';

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  onGoHome: () => void;
  variant?: 'tool' | 'page';
}

const CHUNK_ERROR_FRAGMENTS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'loading chunk',
  'chunkloaderror',
];

/**
 * Detects lazy-chunk load failures (offline or a stale chunk after a deploy).
 * React reports these through the nearest error boundary.
 */
export const isChunkLoadError = (error: Error): boolean => {
  const message = `${error.name} ${error.message}`.toLowerCase();
  return CHUNK_ERROR_FRAGMENTS.some(fragment => message.includes(fragment));
};

const deleteDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.deleteDatabase('PDFYantraDB');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // A blocked deletion still allows the reload to release the connection.
    request.onblocked = () => resolve();
  });
};

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  reset,
  onGoHome,
  variant = 'tool',
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const chunkLoadFailed = isChunkLoadError(error);
  const isPage = variant === 'page';

  useEffect(() => {
    headingRef.current?.focus();
  }, [error]);

  const handleResetWorkspace = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }

    setConfirmingReset(false);
    setIsResetting(true);

    try {
      await clearSession();
    } catch (err) {
      console.error('Failed to clear the saved workspace:', err);
      try {
        await deleteDatabase();
      } catch (fallbackErr) {
        console.error('Failed to delete the saved workspace database:', fallbackErr);
      }
    }

    window.location.reload();
  };

  const containerClasses = isPage
    ? 'min-h-screen w-full flex items-center justify-center bg-background text-onBackground p-6'
    : 'w-full my-4 flex items-center justify-center p-2 md:p-4';

  const cardClasses = isPage
    ? 'w-full max-w-xl rounded-md3 border border-outline/30 bg-surface p-8 shadow-2xl'
    : 'w-full max-w-2xl rounded-md3 border border-outline/30 bg-surface p-6 md:p-8 shadow-lg';

  const buttonBase = 'rounded-lg px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

  return (
    <div className={containerClasses}>
      <div role="alert" className={cardClasses}>
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
            <FontAwesomeIcon icon={faTriangleExclamation} className="text-lg" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-display font-bold text-onSurface outline-none md:text-2xl"
            >
              {isPage ? 'PDFYantra hit an unexpected error' : 'Something went wrong in this tool'}
            </h2>

            {chunkLoadFailed ? (
              <p className="mt-2 text-sm leading-relaxed text-onSurfaceVariant">
                We could not load part of the app. You may be offline, or a newer version was
                deployed. Reload the page to get the latest version.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-onSurfaceVariant">
                Your files are still stored on this device. You can try again, go back home, or
                reset the saved workspace if the problem keeps happening.
              </p>
            )}

            {chunkLoadFailed && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={`${buttonBase} mt-4 bg-primary text-onPrimary hover:brightness-110`}
              >
                Reload page
              </button>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className={`${buttonBase} bg-primary text-onPrimary hover:brightness-110`}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onGoHome}
                className={`${buttonBase} bg-surfaceVariant text-onSurfaceVariant hover:brightness-95 dark:hover:brightness-110`}
              >
                Go to home
              </button>
              <button
                type="button"
                onClick={handleResetWorkspace}
                disabled={isResetting}
                className={`${buttonBase} bg-error/10 text-error hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isResetting
                  ? 'Resetting...'
                  : confirmingReset
                    ? 'Click again to confirm'
                    : 'Reset saved workspace and reload'}
              </button>
            </div>

            {confirmingReset && (
              <p className="mt-2 text-xs text-error" role="status">
                This permanently deletes the saved files from this browser.
              </p>
            )}

            <details className="mt-5 text-sm">
              <summary className="cursor-pointer select-none font-medium text-secondary hover:text-onSurface">
                Error details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 p-3 text-xs text-onSurfaceVariant">
                {error.message || 'Unknown error'}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorFallback;

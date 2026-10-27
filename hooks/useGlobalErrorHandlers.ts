import { useEffect, useRef } from 'react';

export type GlobalErrorReporter = (message: string | null) => void;

const IGNORED_MESSAGE_FRAGMENTS = ['resizeobserver loop'];

const getErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name} ${value.message}`.trim();
  }
  if (typeof value === 'string') return value;
  return '';
};

const toFriendlyMessage = (value: unknown): string => {
  const detail = getErrorMessage(value);
  return detail
    ? `Something went wrong: ${detail}`
    : 'Something went wrong. Please try again.';
};

const shouldIgnore = (message: string): boolean => {
  const lower = message.toLowerCase();
  return IGNORED_MESSAGE_FRAGMENTS.some(fragment => lower.includes(fragment));
};

/**
 * Surfaces uncaught browser errors through the app's existing error action.
 *
 * - Removes duplicate consecutive messages.
 * - Ignores known ResizeObserver loop noise.
 * - Never rethrows, navigates, or performs network requests, so it cannot loop.
 */
export const useGlobalErrorHandlers = (setError: GlobalErrorReporter): void => {
  const lastMessageRef = useRef<string | null>(null);
  const isHandlingRef = useRef(false);

  useEffect(() => {
    const surface = (value: unknown) => {
      const message = toFriendlyMessage(value);

      if (shouldIgnore(message)) return;
      if (isHandlingRef.current) return;
      if (lastMessageRef.current === message) return;

      lastMessageRef.current = message;
      isHandlingRef.current = true;

      try {
        setError(message);
      } catch (err) {
        // A broken store must not turn the handler into an error loop.
        console.error('Failed to surface a global error:', err);
      } finally {
        isHandlingRef.current = false;
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      surface(event.error ?? event.message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      surface(event.reason);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [setError]);
};

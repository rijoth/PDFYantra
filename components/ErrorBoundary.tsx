import React from 'react';

export interface ErrorBoundaryFallbackArgs {
  error: Error;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Rendered instead of `children` when a descendant throws.
   * Keep this free of store/app-context dependencies for the top-level boundary.
   */
  fallback?: (args: ErrorBoundaryFallbackArgs) => React.ReactNode;
  /**
   * When any entry changes (shallow comparison), an existing error is cleared
   * automatically. Useful for recovering when the active tool changes.
   */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'An unknown error occurred.');
};

const areResetKeysEqual = (previous?: unknown[], next?: unknown[]): boolean => {
  if (previous === next) return true;
  if (!previous || !next) return false;
  if (previous.length !== next.length) return false;
  return previous.every((key, index) => Object.is(key, next[index]));
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Local diagnostics only: no network calls, no telemetry.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (!this.state.error) return;
    if (!areResetKeysEqual(previousProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) return fallback({ error, reset: this.reset });

      return (
        <div role="alert" className="p-6 text-error">
          <h2 className="text-lg font-semibold">Something went wrong.</h2>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-onPrimary"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;

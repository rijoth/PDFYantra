// Self-hosted fonts are bundled by Vite (no third-party CDN).
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import '@fontsource/google-sans/latin-400.css';
import '@fontsource/google-sans/latin-500.css';
import '@fontsource/google-sans/latin-700.css';
import './components/iconSetup';

import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorFallback from './components/ErrorFallback';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';

// Load App lazily so a broken module graph (for example the store throwing at
// import time) can still be caught by the top-level boundary below.
const App = React.lazy(() => import('./App'));

const RootLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-primary">
    <FontAwesomeIcon icon={faCircleNotch} spin className="text-3xl" />
  </div>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <ErrorFallback
          error={error}
          reset={reset}
          onGoHome={() => window.location.reload()}
          variant="page"
        />
      )}
    >
      <React.Suspense fallback={<RootLoader />}>
        <App />
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);

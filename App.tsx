
import React, { useEffect, Suspense, lazy } from 'react';
import DashboardLayout from './components/DashboardLayout';
import LandingPage from './components/LandingPage';
import ProcessingOverlay from './components/ProcessingOverlay';
import PasswordModal from './components/PasswordModal';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorFallback from './components/ErrorFallback';
import { usePdfStore } from './store/usePdfStore';
import { useGlobalErrorHandlers } from './hooks/useGlobalErrorHandlers';
import { loadSession } from './services/storageService';
import { AppStatus } from './types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';

// Code-split heavy tool components on demand
const OrganizerTool = lazy(() => import('./components/OrganizerTool'));
const SplitTool = lazy(() => import('./components/SplitTool'));
const ConvertTool = lazy(() => import('./components/ConvertTool'));
const CompressTool = lazy(() => import('./components/CompressTool'));

const ToolLoader = () => (
  <div className="h-[50vh] w-full flex flex-col items-center justify-center text-primary gap-3">
    <FontAwesomeIcon icon={faCircleNotch} spin className="text-3xl" />
    <span className="text-sm font-medium text-secondary">Loading tool...</span>
  </div>
);

const App: React.FC = () => {
  const { activeTool, setActiveTool, restoreSession, setInitialized, isInitialized, status, setError } = usePdfStore();

  useGlobalErrorHandlers(setError);

  // SEO: Update document title based on active tool
  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'PDFYantra - Privacy-First Local PDF Tools',
      merge: 'Merge & Organize PDFs - PDFYantra',
      split: 'Split PDF Documents - PDFYantra',
      convert: 'Convert PDF to Images & Text - PDFYantra',
      compress: 'Compress PDF File Size - PDFYantra'
    };
    document.title = titles[activeTool] || titles.home;
  }, [activeTool]);

  // Global Keyboard Shortcuts (Ctrl+Z / Ctrl+Y) with input field protection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          usePdfStore.getState().redo();
        } else {
          usePdfStore.getState().undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        usePdfStore.getState().redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const session = await loadSession();
        if (session) {
          restoreSession(session.files, session.pages, session.activeTool);
          if (session.pages.length > 0) {
            await usePdfStore.getState().regenerateAllThumbnails();
            usePdfStore.getState().setHasRecoveredSession(true);
          }
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [restoreSession, setInitialized]);

  if (!isInitialized) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background text-primary">
        <FontAwesomeIcon icon={faCircleNotch} spin className="text-3xl" />
      </div>
    );
  }

  const renderTool = (content: React.ReactNode) => (
    <Suspense fallback={<ToolLoader />}>
      <ErrorBoundary
        resetKeys={[activeTool]}
        fallback={({ error, reset }) => (
          <ErrorFallback
            error={error}
            reset={reset}
            onGoHome={() => {
              setActiveTool('home');
              reset();
            }}
            variant="tool"
          />
        )}
      >
        {content}
      </ErrorBoundary>
    </Suspense>
  );

  const renderContent = () => {
    switch (activeTool) {
      case 'home':
        return renderTool(<LandingPage onNavigate={setActiveTool} />);
      case 'merge':
        return renderTool(<OrganizerTool />);
      case 'split':
        return renderTool(
          <SplitTool onSplit={() => { }} isProcessing={status === AppStatus.PROCESSING} />
        );
      case 'convert':
        return renderTool(<ConvertTool />);
      case 'compress':
        return renderTool(<CompressTool />);
      default:
        return renderTool(<LandingPage onNavigate={setActiveTool} />);
    }
  };

  return (
    <DashboardLayout activeTool={activeTool} onToolChange={setActiveTool}>
      <ProcessingOverlay />
      <PasswordModal />
      {renderContent()}
    </DashboardLayout>
  );
};

export default App;
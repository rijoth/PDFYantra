
import React, { useEffect, Suspense, lazy } from 'react';
import DashboardLayout from './components/DashboardLayout';
import LandingPage from './components/LandingPage';
import ProcessingOverlay from './components/ProcessingOverlay';
import PasswordModal from './components/PasswordModal';
import { usePdfStore } from './store/usePdfStore';
import { loadSession } from './services/storageService';
import { AppStatus } from './types';

// Code-split heavy tool components on demand
const OrganizerTool = lazy(() => import('./components/OrganizerTool'));
const SplitTool = lazy(() => import('./components/SplitTool'));
const ConvertTool = lazy(() => import('./components/ConvertTool'));
const CompressTool = lazy(() => import('./components/CompressTool'));

const ToolLoader = () => (
  <div className="h-[50vh] w-full flex flex-col items-center justify-center text-primary gap-3">
    <i className="fa-solid fa-circle-notch fa-spin text-3xl"></i>
    <span className="text-sm font-medium text-secondary">Loading tool...</span>
  </div>
);

const App: React.FC = () => {
  const { activeTool, setActiveTool, restoreSession, setInitialized, isInitialized, status } = usePdfStore();

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
        <i className="fa-solid fa-circle-notch fa-spin text-3xl"></i>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTool) {
      case 'home':
        return <LandingPage onNavigate={setActiveTool} />;
      case 'merge':
        return (
          <Suspense fallback={<ToolLoader />}>
            <OrganizerTool />
          </Suspense>
        );
      case 'split':
        return (
          <Suspense fallback={<ToolLoader />}>
            <SplitTool onSplit={() => { }} isProcessing={status === AppStatus.PROCESSING} />
          </Suspense>
        );
      case 'convert':
        return (
          <Suspense fallback={<ToolLoader />}>
            <ConvertTool />
          </Suspense>
        );
      case 'compress':
        return (
          <Suspense fallback={<ToolLoader />}>
            <CompressTool />
          </Suspense>
        );
      default:
        return <LandingPage onNavigate={setActiveTool} />;
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
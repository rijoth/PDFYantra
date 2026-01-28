
import React, { useEffect } from 'react';
import DashboardLayout from './components/DashboardLayout';
import LandingPage from './components/LandingPage';
import OrganizerTool from './components/OrganizerTool';
import SplitTool from './components/SplitTool';
import ConvertTool from './components/ConvertTool';
import CompressTool from './components/CompressTool';
import ProcessingOverlay from './components/ProcessingOverlay';
import { usePdfStore } from './store/usePdfStore';
import { loadSession } from './services/storageService';
import { AppStatus } from './types';

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

  useEffect(() => {
    const init = async () => {
      try {
        const session = await loadSession();
        if (session) {
          restoreSession(session.files, session.pages, session.activeTool);
          if (session.pages.length > 0) {
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
        return <OrganizerTool />;
      case 'split':
        return <SplitTool onSplit={() => { }} isProcessing={status === AppStatus.PROCESSING} />;
      case 'convert':
        return <ConvertTool />;
      case 'compress':
        return <CompressTool />;
      default:
        return <LandingPage onNavigate={setActiveTool} />;
    }
  };

  return (
    <DashboardLayout activeTool={activeTool} onToolChange={setActiveTool}>
      <ProcessingOverlay />
      {renderContent()}
    </DashboardLayout>
  );
};

export default App;
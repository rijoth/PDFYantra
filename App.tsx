
import React, { useEffect } from 'react';
import DashboardLayout from './components/DashboardLayout';
import LandingPage from './components/LandingPage';
import OrganizerTool from './components/OrganizerTool';
import SplitTool from './components/SplitTool';
import ConvertTool from './components/ConvertTool';
import CompressTool from './components/CompressTool';
import { usePdfStore } from './store/usePdfStore';
import { loadSession } from './services/storageService';

const App: React.FC = () => {
  const { activeTool, setActiveTool, restoreSession, setInitialized, isInitialized } = usePdfStore();

  useEffect(() => {
    const init = async () => {
      const session = await loadSession();
      if (session) {
        restoreSession(session.files, session.pages);
      }
      setInitialized(true);
    };
    init();
  }, [restoreSession, setInitialized]);

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-onSurfaceVariant font-medium animate-pulse">Initializing Engine...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTool) {
      case 'home': return <LandingPage onNavigate={setActiveTool} />;
      case 'merge': return <OrganizerTool />;
      case 'split': return <SplitTool onSplit={() => {}} isProcessing={false} />;
      case 'convert': return <ConvertTool />;
      case 'compress': return <CompressTool />;
      default: return <LandingPage onNavigate={setActiveTool} />;
    }
  };

  return (
    <DashboardLayout activeTool={activeTool} onToolChange={setActiveTool}>
      {renderContent()}
    </DashboardLayout>
  );
};

export default App;

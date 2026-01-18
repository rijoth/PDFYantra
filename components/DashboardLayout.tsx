
import React from 'react';
import Navigation from './Sidebar'; // Re-using Sidebar file as Navigation
import TopAppBar from './Header'; // Re-using Header file as TopAppBar
import Footer from './Footer';
import { ToolType } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTool,
  onToolChange
}) => {
  return (
    <div className="h-screen flex overflow-hidden bg-background font-sans text-onSurfaceVariant selection:bg-primaryContainer selection:text-onPrimaryContainer">
      {/* Navigation (Rail on Desktop, Bottom Bar on Mobile) */}
      <Navigation activeTool={activeTool} onToolChange={onToolChange} />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[80px] mb-[80px] md:mb-0 transition-all duration-300">
        <TopAppBar />

        <main className="flex-grow flex flex-col p-4 md:px-8 md:pb-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full h-full flex flex-col animate-fade-in flex-grow">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

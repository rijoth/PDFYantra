
import React from 'react';
import { ToolType } from '../types';
import { usePdfStore } from '../store/usePdfStore';

interface NavigationProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTool, onToolChange }) => {
  const { pages } = usePdfStore();
  const hasContent = pages.length > 0;

  const tools: { id: ToolType; label: string; icon: string; disabled?: boolean; showBadge?: boolean }[] = [
    { 
      id: 'home', 
      label: 'Home', 
      icon: 'fa-house',
      disabled: false 
    },
    { 
      id: 'merge', 
      label: 'Organizer', 
      icon: 'fa-layer-group', 
      disabled: false,
      showBadge: hasContent 
    },
    { 
      id: 'split', 
      label: 'Split', 
      icon: 'fa-scissors', 
      disabled: false,
      showBadge: hasContent 
    },
    { 
      id: 'convert', 
      label: 'Convert', 
      icon: 'fa-wand-magic-sparkles', 
      disabled: false,
      showBadge: false 
    },
    { 
      id: 'compress', 
      label: 'Compress', 
      icon: 'fa-compress', 
      disabled: false,
      showBadge: false
    },
  ];

  return (
    <>
      {/* Desktop Navigation Rail - Left Side */}
      <nav className="hidden md:flex flex-col items-center w-[80px] h-full fixed left-0 top-0 bg-surface z-50 py-6 border-r border-transparent">
        <div className="mb-10 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-primaryContainer/30 text-primary flex items-center justify-center shadow-none group cursor-default transition-all hover:bg-primaryContainer/50">
                 {/* Compact Brand Icon */}
                 <svg viewBox="0 0 32 32" className="w-7 h-7 overflow-visible" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="6" y="8" width="16" height="20" rx="2" className="fill-onPrimaryContainer/10 stroke-onPrimaryContainer stroke-[1.5] transition-transform duration-500 ease-out group-hover:rotate-[-8deg] origin-bottom-left" />
                      <rect x="10" y="4" width="16" height="20" rx="2" className="fill-primary stroke-primaryContainer stroke-[1.5] transition-transform duration-500 ease-out group-hover:rotate-[8deg] origin-bottom-left" />
                      <path d="M14 10H22" className="stroke-onPrimary stroke-[2] stroke-linecap-round" />
                      <path d="M14 14H22" className="stroke-onPrimary stroke-[2] stroke-linecap-round opacity-70" />
                  </svg>
            </div>
        </div>

        <div className="flex flex-col gap-4 w-full px-3">
          {tools.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
                <div key={tool.id} className="flex flex-col items-center gap-1 group relative">
                    <button
                        onClick={() => !tool.disabled && onToolChange(tool.id)}
                        disabled={tool.disabled}
                        className={`
                            w-14 h-8 rounded-pill flex items-center justify-center transition-all duration-300 ripple
                            ${isActive 
                                ? 'bg-secondaryContainer text-onSecondaryContainer shadow-sm' 
                                : 'text-onSurfaceVariant hover:bg-surfaceVariant/50'
                            }
                            ${tool.disabled ? 'opacity-40' : ''}
                        `}
                    >
                        <i className={`fa-solid ${tool.icon} ${isActive ? 'text-lg' : 'text-xl'}`}></i>
                    </button>
                    {tool.showBadge && !isActive && (
                      <span className="absolute top-0 right-2 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface"></span>
                    )}
                    <span className={`text-[11px] font-medium tracking-wide ${isActive ? 'text-onSecondaryContainer font-bold' : 'text-onSurfaceVariant'}`}>
                        {tool.label}
                    </span>
                </div>
            );
          })}
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full h-[80px] bg-surface z-50 flex items-center justify-around px-2 pb-2 border-t border-surfaceVariant/30 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
          {tools.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
                <div key={tool.id} className="flex flex-col items-center gap-1 flex-1 relative">
                    <button
                        onClick={() => !tool.disabled && onToolChange(tool.id)}
                        disabled={tool.disabled}
                        className={`
                            w-16 h-8 rounded-pill flex items-center justify-center transition-all duration-300 ripple
                            ${isActive 
                                ? 'bg-secondaryContainer text-onSecondaryContainer' 
                                : 'text-onSurfaceVariant'
                            }
                            ${tool.disabled ? 'opacity-40' : ''}
                        `}
                    >
                        <i className={`fa-solid ${tool.icon} text-lg`}></i>
                    </button>
                     {tool.showBadge && !isActive && (
                      <span className="absolute top-0 right-1/4 w-2 h-2 bg-primary rounded-full border border-surface"></span>
                    )}
                    <span className={`text-[12px] font-medium ${isActive ? 'text-onSecondaryContainer' : 'text-onSurfaceVariant'}`}>
                        {tool.label}
                    </span>
                </div>
            );
          })}
      </nav>
    </>
  );
};

export default Navigation;

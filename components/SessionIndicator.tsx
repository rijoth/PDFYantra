import React, { useEffect, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';

const SessionIndicator: React.FC = () => {
    const { hasRecoveredSession, dismissRecoveryIndication, clearWorkspace } = usePdfStore();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (hasRecoveredSession) {
            setIsVisible(true);
            // Auto-hide after 10 seconds, but user can dismiss manually
            const timer = setTimeout(() => {
                setIsVisible(false);
                setTimeout(dismissRecoveryIndication, 500); // Wait for transition
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [hasRecoveredSession, dismissRecoveryIndication]);

    if (!hasRecoveredSession && !isVisible) return null;

    const handleClear = () => {
        if (window.confirm('Are you sure you want to clear your session? This will remove all currently loaded files.')) {
            clearWorkspace();
            dismissRecoveryIndication();
        }
    };

    return (
        <div
            className={`fixed bottom-6 left-6 md:left-[100px] z-50 transition-all duration-500 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                }`}
        >
            <div className="bg-surface border border-primary/20 rounded-xl shadow-2xl p-4 flex flex-col gap-3 min-w-[280px] backdrop-blur-md">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <i className="fa-solid fa-clock-rotate-left text-lg"></i>
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground leading-tight">Session Restored</h4>
                            <p className="text-xs text-foreground/60 mt-0.5">Your previous work was recovered.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setIsVisible(false);
                            setTimeout(dismissRecoveryIndication, 500);
                        }}
                        className="text-foreground/40 hover:text-foreground transition-colors p-1"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="flex items-center gap-2 mt-1">
                    <button
                        onClick={() => {
                            setIsVisible(false);
                            setTimeout(dismissRecoveryIndication, 500);
                        }}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:brightness-110 transition-all"
                    >
                        Keep Working
                    </button>
                    <button
                        onClick={handleClear}
                        className="py-1.5 px-3 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-all"
                    >
                        Reset Session
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionIndicator;

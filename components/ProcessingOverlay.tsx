
import React from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { AppStatus } from '../types';

const ProcessingOverlay: React.FC = () => {
    const { status, processingProgress, processingMessage } = usePdfStore();

    if (status !== AppStatus.PROCESSING) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center animate-fade-in p-6">
            <div className="bg-surface rounded-md3 shadow-elevation-5 max-w-md w-full p-8 animate-scale-in border border-surfaceVariant/50">
                <div className="flex flex-col items-center text-center">
                    {/* Pulsing Spinner Icon */}
                    <div className="relative mb-8">
                        <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
                        <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center scale-110">
                            <i className="fa-solid fa-file-pdf text-primary text-3xl animate-pulse"></i>
                        </div>
                    </div>

                    <h3 className="text-2xl font-normal text-onSurfaceVariant mb-3 tracking-tight">
                        {processingMessage || 'Processing...'}
                    </h3>

                    <p className="text-secondary text-sm mb-8 leading-relaxed max-w-[280px]">
                        Please keep this window open while we handle your PDF documents locally.
                    </p>

                    {/* Progress Bar Container */}
                    <div className="w-full space-y-3">
                        <div className="flex justify-between items-end px-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Local Operation</span>
                            <span className="text-lg font-display font-bold text-primary">
                                {processingProgress}%
                            </span>
                        </div>

                        <div className="h-3 w-full bg-surfaceVariant rounded-full overflow-hidden border border-outline/5 relative shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-primaryContainer transition-all duration-500 ease-out shadow-lg"
                                style={{ width: `${processingProgress}%` }}
                            >
                                {/* Animated shine effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full animate-shine"></div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex items-center gap-2 text-xs text-secondary/60 font-medium">
                        <i className="fa-solid fa-shield-halved"></i>
                        <span>End-to-end private processing</span>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes shine {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-shine {
                    animation: shine 2s infinite;
                }
            `}} />
        </div>
    );
};

export default ProcessingOverlay;

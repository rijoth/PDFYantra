import React, { useState, useEffect, useRef } from 'react';
import { usePdfStore } from '../store/usePdfStore';

const PasswordModal: React.FC = () => {
    const { passwordPrompt, resolvePasswordPrompt } = usePdfStore();
    const [password, setPassword] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (passwordPrompt) {
            setPassword('');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [passwordPrompt]);

    if (!passwordPrompt) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        resolvePasswordPrompt(password);
    };

    const handleCancel = () => {
        resolvePasswordPrompt(null);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface w-full max-w-md rounded-2xl shadow-elevation-3 overflow-hidden animate-scale-in border border-surfaceVariant">
                <div className="p-6 border-b border-surfaceVariant flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primaryContainer text-onPrimaryContainer flex items-center justify-center text-xl shrink-0">
                        <i className="fa-solid fa-lock"></i>
                    </div>
                    <div>
                        <h3 className="text-xl font-display text-onSurfaceVariant">Protected PDF</h3>
                        <p className="text-sm text-secondary truncate max-w-[250px]" title={passwordPrompt.filename}>
                            {passwordPrompt.filename}
                        </p>
                    </div>
                </div>

                <div className="p-6">
                    {passwordPrompt.isRetry && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2 border border-red-100">
                            <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
                            <p>Incorrect password. Please try again.</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-onSurfaceVariant mb-2">
                                Enter Password
                            </label>
                            <input
                                ref={inputRef}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-12 px-4 bg-surfaceVariant/30 border border-outline/30 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-onSurfaceVariant"
                                placeholder="Password"
                            />
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-surfaceVariant/30 rounded-lg text-xs text-secondary mb-6">
                            <i className="fa-solid fa-shield-halved mt-0.5 text-primary"></i>
                            <p>
                                Passwords are used locally in your browser to unlock the document and are <b>never saved</b> or transmitted anywhere.
                            </p>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-5 h-10 rounded-pill font-medium text-onSurfaceVariant hover:bg-surfaceVariant/50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!password.trim()}
                                className="px-5 h-10 rounded-pill font-medium bg-primary text-onPrimary hover:shadow-elevation-1 transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                Unlock
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PasswordModal;

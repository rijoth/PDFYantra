import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, Message } from '../store/gameStore';

const GameInterface: React.FC = () => {
  const { messages, sendMessage, isProcessing, resetGame } = useGameStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-surface shadow-2xl overflow-hidden border-x border-surfaceVariant/20">
      
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-surfaceVariant/30 bg-surface/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primaryContainer text-onPrimaryContainer flex items-center justify-center">
            <i className="fa-solid fa-dragon"></i>
          </div>
          <h1 className="font-display font-bold text-xl text-onSurface tracking-wide">QuestYantra</h1>
        </div>
        <button 
          onClick={resetGame}
          className="text-xs font-medium text-secondary hover:text-error transition-colors uppercase tracking-wider"
        >
          <i className="fa-solid fa-rotate-right mr-2"></i> Restart
        </button>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-hide">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div 
              className={`
                max-w-[85%] md:max-w-[75%] rounded-2xl p-5 shadow-sm leading-relaxed text-lg
                ${msg.role === 'user' 
                  ? 'bg-primaryContainer text-onPrimaryContainer rounded-tr-sm' 
                  : 'bg-surfaceVariant/30 text-onSurfaceVariant rounded-tl-sm border border-surfaceVariant/30'
                }
              `}
            >
              {msg.role === 'model' && (
                <div className="mb-2 text-xs font-bold text-primary opacity-80 uppercase tracking-widest flex items-center gap-2">
                   <i className="fa-solid fa-dungeon"></i> Dungeon Master
                </div>
              )}
              <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
            </div>
          </div>
        ))}
        {isProcessing && (
           <div className="flex justify-start animate-fade-in">
             <div className="bg-surfaceVariant/30 px-6 py-4 rounded-2xl rounded-tl-sm flex items-center gap-3">
               <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
               <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100"></div>
               <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200"></div>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-6 bg-surface border-t border-surfaceVariant/30">
        <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you want to do?"
            disabled={isProcessing}
            className="w-full h-14 pl-6 pr-14 rounded-full bg-surfaceVariant/20 border border-outline/20 text-onSurface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-secondary/50 font-medium text-lg"
            autoFocus
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 top-2 h-10 w-10 bg-primary text-onPrimary rounded-full flex items-center justify-center hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition-all"
          >
            <i className="fa-solid fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default GameInterface;
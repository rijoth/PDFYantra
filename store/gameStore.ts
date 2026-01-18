import { create } from 'zustand';
import { Chat } from "@google/genai";
import { createGameSession, sendGameMessage } from '../services/aiService';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface GameState {
  chatSession: Chat | null;
  messages: Message[];
  isProcessing: boolean;
  gameStarted: boolean;
  
  // Actions
  initGame: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chatSession: null,
  messages: [],
  isProcessing: false,
  gameStarted: false,

  initGame: async () => {
    set({ isProcessing: true, messages: [] });
    try {
      const session = createGameSession();
      // Initial prompt to kick off the DM
      const introText = await sendGameMessage(session, "Let's begin a new adventure. Set the scene.");
      
      set({ 
        chatSession: session, 
        gameStarted: true,
        messages: [{
          id: 'init',
          role: 'model',
          text: introText,
          timestamp: Date.now()
        }],
        isProcessing: false
      });
    } catch (error) {
      console.error(error);
      set({ isProcessing: false });
    }
  },

  sendMessage: async (text: string) => {
    const { chatSession, messages } = get();
    if (!chatSession) return;

    const userMsg: Message = {
      id: Math.random().toString(36),
      role: 'user',
      text,
      timestamp: Date.now()
    };

    set({ 
      messages: [...messages, userMsg], 
      isProcessing: true 
    });

    try {
      const responseText = await sendGameMessage(chatSession, text);
      const aiMsg: Message = {
        id: Math.random().toString(36),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      
      set(state => ({ 
        messages: [...state.messages, aiMsg], 
        isProcessing: false 
      }));
    } catch (error) {
      set({ isProcessing: false });
    }
  },

  resetGame: () => {
    set({
      chatSession: null,
      messages: [],
      gameStarted: false,
      isProcessing: false
    });
  }
}));
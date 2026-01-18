import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const createGameSession = (): Chat => {
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are the Dungeon Master for a text-based adventure game. 
      Your goal is to provide immersive, descriptive, and engaging narratives.
      1. Start by asking the user for their character name and class, or to choose a setting.
      2. Keep responses concise (under 150 words) but evocative.
      3. Offer 2-3 choices at the end of key events, but allow open-ended actions.
      4. Manage the game state implicitly (health, inventory) in the narrative.
      5. Use markdown for emphasis (bold for items, italics for sounds).`,
    },
  });
};

export const sendGameMessage = async (chat: Chat, message: string): Promise<string> => {
  try {
    const result: GenerateContentResponse = await chat.sendMessage({ message });
    return result.text || "The mists of uncertainty cloud your vision... (API Error)";
  } catch (error) {
    console.error("AI Error:", error);
    return "A connection to the ether has been lost. Please try again.";
  }
};
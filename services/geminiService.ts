
import { GoogleGenAI, Type } from "@google/genai";
import type { AiResponseData } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const model = 'gemini-2.5-flash';

const systemInstruction = `You are an expert AI assistant specializing in Norwegian labor law (arbeidsrett), the NAV system, Skatt (tax), and trade unions (fagforeninger). Your purpose is to provide clear, concise, and helpful information to people working in Norway.
- First, you MUST detect the language of the user's question.
- Then, you MUST respond in the *exact same language*.
- Your response MUST include a BCP-47 language code for the detected language (e.g., 'en-US' for English, 'nb-NO' for Norwegian, 'lt-LT' for Lithuanian).
- Always base your answers on current Norwegian laws and regulations.
- Provide practical, real-world examples to illustrate your points.
- Keep your main answer concise and easy to understand.
- For every answer, you MUST provide a list of related topics and a list of official source links.
- The source links must be real, valid URLs from official Norwegian government or union websites like nav.no, arbeidstilplacet.no, skatteetaten.no, or major union sites.
- Your response must be in JSON format, adhering to the provided schema.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: "The main answer to the user's question, formatted in Markdown, in the same language as the user's query.",
    },
    relatedTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of 3-5 related topics the user might be interested in, in the same language as the user's query.",
    },
    sourceLinks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING }
        },
        required: ["title", "url"]
      },
      description: "A list of relevant, official source links. The title should be in the same language as the user's query.",
    },
    language: {
        type: Type.STRING,
        description: "The BCP-47 language code of the user's question and this response (e.g., 'en-US', 'nb-NO', 'lt-LT')."
    }
  },
  required: ["answer", "relatedTopics", "sourceLinks", "language"]
};

export const getLegalAdvice = async (userQuestion: string): Promise<AiResponseData> => {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: userQuestion,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.5,
      }
    });
    
    const text = response.text.trim();
    // Sometimes the model wraps the JSON in ```json ... ```, so we need to clean it.
    const cleanedText = text.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanedText) as AiResponseData;
  } catch (error) {
    console.error("Error getting legal advice:", error);
    throw new Error("Failed to get a response from the AI. Please try again.");
  }
};

export const simplifyAnswer = async (textToSimplify: string, originalQuestion: string): Promise<string> => {
    const prompt = `The user's original question was: "${originalQuestion}". Please rewrite the following text in very simple, easy-to-understand language, in the same language as the original question. Avoid legal jargon. The original text is: "${textToSimplify}"`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
    });
    return response.text;
};

export const generateEmailTemplate = async (context: string, originalQuestion: string): Promise<string> => {
    const prompt = `The user's original question was "${originalQuestion}". Based on the following situation, write a polite and professional email template in the same language as the original question. The user can then fill in the specific details. The situation is: "${context}"`;
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
    });
    return response.text;
};

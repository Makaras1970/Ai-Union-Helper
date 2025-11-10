
export interface SourceLink {
  title: string;
  url: string;
}

export interface AiResponseData {
  answer: string;
  relatedTopics: string[];
  sourceLinks: SourceLink[];
  language: string; // BCP-47 language code, e.g., 'en-US', 'nb-NO'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  aiResponseData?: AiResponseData;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}
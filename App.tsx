
import React, { useState, useRef, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ChatSession, ChatMessage } from './types';
import { getLegalAdvice } from './services/geminiService';
import { RECOMMENDED_TOPICS, FOOTER_LINKS } from './constants';
import { LogoIcon, MicrophoneIcon, StopCircleIcon } from './components/Icons';
import ChatBubble from './components/ChatBubble';
import LoadingSpinner from './components/LoadingSpinner';

// Fix: Add type definitions for Web Speech API to resolve 'Cannot find name 'SpeechRecognition'' error.
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

const App: React.FC = () => {
  const [chats, setChats] = useLocalStorage<ChatSession[]>('chatHistory', []);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        setUserInput(transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Ensure listening state is reset on any error for a robust UI.
        setIsListening(false);
        
        let errorMessage = "An unknown speech recognition error occurred.";
        switch (event.error) {
            case 'network':
                errorMessage = "Speech recognition failed due to a network error. Please check your connection.";
                break;
            case 'not-allowed':
            case 'service-not-allowed':
                errorMessage = "Microphone access was denied. Please allow it in your browser settings.";
                break;
            case 'no-speech':
                // Don't show an error for this, as it's common.
                return; 
        }
        console.error('Speech recognition error:', event.error, event.message);
        setSpeechError(errorMessage);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    } else {
        console.warn("Speech Recognition API is not supported in this browser.");
    }
    
    return () => {
        recognitionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (speechError) {
      const timer = setTimeout(() => setSpeechError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);


  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  const handleToggleListening = () => {
    if (!recognitionRef.current) {
      setSpeechError("Speech recognition is not available in your browser.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setUserInput(''); 
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Could not start speech recognition:", e);
        setSpeechError("Could not start listening. Please try again.");
      }
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setUserInput('');
  };
  
  const handleTopicSelect = (topic: string) => {
    setUserInput(topic);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    if(isListening) {
      recognitionRef.current?.abort();
    }

    setIsLoading(true);
    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', text: userInput.trim() };

    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat: ChatSession = {
        id: Date.now().toString(),
        title: userInput.trim().substring(0, 30) + (userInput.length > 30 ? '...' : ''),
        messages: [userMessage],
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
    } else {
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...c.messages, userMessage] } : c));
    }

    setUserInput('');

    try {
      const aiResponseData = await getLegalAdvice(userMessage.text);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: aiResponseData.answer,
        aiResponseData,
      };
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...c.messages, aiMessage] } : c));
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I'm sorry, but I encountered an error. Please try again.",
        aiResponseData: { 
            answer: "Error: Could not connect to AI service.", 
            relatedTopics: [], 
            sourceLinks: [],
            language: 'en-US'
        }
      };
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...c.messages, errorMessage] } : c));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen font-sans bg-slate-900 text-slate-200">
      {/* Sidebar for Chat History */}
      <aside className="w-1/4 bg-slate-950 flex flex-col p-4 border-r border-slate-800">
        <header className="flex items-center gap-2 p-2 mb-4">
          <LogoIcon className="w-8 h-8 text-blue-400" />
          <h1 className="text-xl font-bold">AI Union Helper</h1>
        </header>
        <button 
          onClick={handleNewChat}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors mb-4"
        >
          + New Chat
        </button>
        <div className="flex-1 overflow-y-auto">
          <h2 className="text-sm font-semibold text-slate-400 mb-2 px-2">Your previous chats</h2>
          <nav>
            {chats.map(chat => (
              <a
                key={chat.id}
                href="#"
                onClick={(e) => { e.preventDefault(); setActiveChatId(chat.id); }}
                className={`block p-2 rounded-lg truncate ${activeChatId === chat.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}
              >
                {chat.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {activeChat ? (
            <div className="space-y-4">
              {activeChat.messages.map((msg, index) => (
                <ChatBubble 
                  key={msg.id} 
                  message={msg} 
                  userQuestionMessage={
                    msg.role === 'model' && index > 0 && activeChat.messages[index - 1].role === 'user' 
                      ? activeChat.messages[index - 1] 
                      : null
                  } 
                />
              ))}
              <div ref={chatEndRef} />
            </div>
          ) : (
            <div className="text-center mt-20">
              <LogoIcon className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-4">How can I help you today?</h2>
              <p className="text-slate-400 mb-8">Ask me anything about Norwegian labor law.</p>

              <div className="max-w-2xl mx-auto">
                  <h3 className="text-lg font-semibold mb-4">Recommended legal topics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RECOMMENDED_TOPICS.map(topic => (
                        <button key={topic} onClick={() => handleTopicSelect(topic)} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-left shadow-md transition-all">
                            {topic}
                        </button>
                    ))}
                  </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="p-4 md:p-8 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto bg-slate-800 rounded-lg p-2 flex items-center gap-2 shadow-lg">
            <button
                type="button"
                onClick={handleToggleListening}
                disabled={!recognitionRef.current}
                className={`p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-slate-700'}`}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
              >
                {isListening ? <StopCircleIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
            </button>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
              placeholder={isListening ? "Listening..." : "Describe your situation..."}
              className="w-full bg-transparent p-2 resize-none focus:outline-none text-slate-200"
              rows={1}
            />
            <button
              type="submit"
              disabled={isLoading || !userInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center h-10 w-40"
            >
              {isLoading ? <LoadingSpinner size={20} /> : "Ask AI Lawyer"}
            </button>
          </form>
           {speechError && (
            <p className="text-center text-xs text-red-400 mt-2 animate-pulse">{speechError}</p>
          )}
          <footer className="text-center text-xs text-slate-500 mt-4">
            {FOOTER_LINKS.map(link => (
              <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="mx-2 hover:text-slate-300">
                {link.name}
              </a>
            ))}
            <p className="mt-1">AI can make mistakes. Consider checking important information.</p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default App;

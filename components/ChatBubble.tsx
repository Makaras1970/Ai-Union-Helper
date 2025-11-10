
import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { UserIcon, BotIcon, CopyIcon, WandIcon, MailIcon, Volume2Icon, StopCircleIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import { simplifyAnswer, generateEmailTemplate } from '../services/geminiService';

interface ChatBubbleProps {
  message: ChatMessage;
  userQuestionMessage: ChatMessage | null;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, userQuestionMessage }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  
  const [simplifiedAnswer, setSimplifiedAnswer] = useState<string | null>(null);
  const [isSimplifying, setIsSimplifying] = useState(false);
  
  const [emailTemplate, setEmailTemplate] = useState<string | null>(null);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Effect to clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      // If an utterance from this component is speaking, cancel it
      if (utteranceRef.current && window.speechSynthesis.speaking) {
         // A simple cancel is the most we can do, as there's no way to check
         // if the speaking utterance is exactly ours.
         window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopy = () => {
    const textToCopy = message.aiResponseData?.answer || message.text;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimplify = async () => {
    if (!message.aiResponseData?.answer || isSimplifying || !userQuestionMessage) return;
    setIsSimplifying(true);
    try {
      const result = await simplifyAnswer(message.aiResponseData.answer, userQuestionMessage.text);
      setSimplifiedAnswer(result);
    } catch (error) {
      console.error("Failed to simplify answer:", error);
      setSimplifiedAnswer("Sorry, I couldn't simplify this answer right now.");
    } finally {
      setIsSimplifying(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!message.aiResponseData?.answer || isGeneratingEmail || !userQuestionMessage) return;
    setIsGeneratingEmail(true);
    try {
      const context = `Question: ${userQuestionMessage.text}\nAnswer: ${message.aiResponseData.answer}`;
      const result = await generateEmailTemplate(context, userQuestionMessage.text);
      setEmailTemplate(result);
    } catch (error) {
      console.error("Failed to generate email template:", error);
      setEmailTemplate("Sorry, I couldn't generate an email template right now.");
    } finally {
      setIsGeneratingEmail(false);
    }
  };
  
  const handleToggleAudio = () => {
      if (isPlaying) {
          window.speechSynthesis.cancel();
          setIsPlaying(false);
      } else {
          const answerText = message.aiResponseData?.answer;
          const language = message.aiResponseData?.language || 'en-US';

          if (!answerText || !('speechSynthesis' in window)) {
              console.error("Speech Synthesis not supported or no text to speak.");
              return;
          }
          
          // Cancel any other speaking utterance before starting a new one.
          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(answerText);
          utterance.lang = language;
          utteranceRef.current = utterance; // Keep a reference to our utterance
          
          utterance.onend = () => {
              // Only update state if this is the utterance we're tracking
              if (utteranceRef.current === utterance) {
                setIsPlaying(false);
              }
          };
          
          utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
              // Only handle errors for the utterance we're tracking
              if (utteranceRef.current === utterance) {
                if (e.error !== 'interrupted' && e.error !== 'canceled') {
                  console.error("Speech synthesis error:", e.error);
                }
                setIsPlaying(false);
              }
          };
          
          setIsPlaying(true);
          window.speechSynthesis.speak(utterance);
      }
  };

  const renderMarkdown = (text: string) => {
    // A simple approach for **bold** and *italic*
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Handle newlines
    const lines = html.split('\n');

    return lines.map((line, index) => (
        <React.Fragment key={index}>
            <span dangerouslySetInnerHTML={{ __html: line }} />
            {index < lines.length - 1 && <br />}
        </React.Fragment>
    ));
  };


  return (
    <div className={`flex items-start gap-4 p-4 ${isUser ? '' : 'bg-slate-800/50 rounded-lg'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-500' : 'bg-slate-700'}`}>
        {isUser ? <UserIcon className="w-5 h-5" /> : <BotIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        <p className="font-bold">{isUser ? 'You' : 'AI Union Helper'}</p>
        <div className="prose prose-invert max-w-none text-slate-300 space-y-4">
           {isUser ? message.text : renderMarkdown(message.aiResponseData?.answer || "")}
        </div>

        {!isUser && message.aiResponseData && (
          <div className="mt-4">
            {simplifiedAnswer && (
                <div className="mt-4 p-4 border border-slate-700 rounded-lg bg-slate-900">
                    <h4 className="font-bold text-sm text-blue-400 mb-2">Simplified Answer</h4>
                    <p className="text-slate-300 whitespace-pre-wrap">{simplifiedAnswer}</p>
                </div>
            )}
            {emailTemplate && (
                <div className="mt-4 p-4 border border-slate-700 rounded-lg bg-slate-900">
                    <h4 className="font-bold text-sm text-blue-400 mb-2">Email Template</h4>
                    <pre className="text-slate-300 whitespace-pre-wrap font-sans">{emailTemplate}</pre>
                </div>
            )}

            <div className="flex items-center gap-2 mt-4 text-slate-400">
              <button onClick={handleToggleAudio} className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-slate-700 rounded-md transition-colors">
                  {isPlaying ? <StopCircleIcon className="w-3 h-3" /> : <Volume2Icon className="w-3 h-3" />}
                  {isPlaying ? 'Stop' : 'Listen'}
              </button>
              <button onClick={handleCopy} className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-slate-700 rounded-md transition-colors">
                <CopyIcon className="w-3 h-3" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleSimplify} disabled={isSimplifying} className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50">
                {isSimplifying ? <LoadingSpinner size={12} /> : <WandIcon className="w-3 h-3" />}
                Explain in simple words
              </button>
              <button onClick={handleGenerateEmail} disabled={isGeneratingEmail} className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50">
                 {isGeneratingEmail ? <LoadingSpinner size={12} /> : <MailIcon className="w-3 h-3" />}
                 Generate email template
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="font-bold text-sm text-slate-400 mb-2">✅ Related Topics</h4>
              <div className="flex flex-wrap gap-2">
                {message.aiResponseData.relatedTopics.map(topic => (
                  <span key={topic} className="px-2 py-1 text-xs bg-slate-700 rounded-full">{topic}</span>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h4 className="font-bold text-sm text-slate-400 mb-2">✅ Sources</h4>
              <ul className="list-disc list-inside text-sm">
                {message.aiResponseData.sourceLinks.map(link => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatBubble;

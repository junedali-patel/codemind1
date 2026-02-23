/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, no-var, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
'use client';

import { Send, Loader, Copy, Mic, MicOff } from '@/lib/icons';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// @ts-ignore - react-syntax-highlighter does not provide types in this project
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// @ts-ignore - style file does not provide types in this project
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

import axios from 'axios';

// TypeScript declarations for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition: typeof SpeechRecognition;
  webkitSpeechRecognition: typeof webkitSpeechRecognition;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function AIChatView() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI assistant. How can I help you today?",
      timestamp: new Date(),
    }
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass() as SpeechRecognition;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          const finalTranscript = transcript.trim();
          
          if (finalTranscript) {
            // Set the input with the transcribed text
            setInput(finalTranscript);
            setIsRecording(false);
            setIsListening(false);
            
            // Automatically send the message after a short delay
            setTimeout(() => {
              // Use the handleSend function by setting input and triggering send
              if (finalTranscript) {
                handleSendWithText(finalTranscript);
              }
            }, 300);
          } else {
            setIsRecording(false);
            setIsListening(false);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsRecording(false);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }

      // Initialize Speech Synthesis
      if ('speechSynthesis' in window) {
        synthesisRef.current = window.speechSynthesis;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleSendWithText = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await axios.post(`${API_BASE_URL}/api/ai/chat`, {
        message: userMessage.content,
        conversationHistory,
      });

      const assistantText = response.data?.response || "I couldn't generate a response.";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Speak the assistant's response using TTS
      speakText(assistantText);

    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString() + 3,
          role: "assistant",
          content: "❗ AI service error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    await handleSendWithText(input);
  };


  /* ---------- COPY BUTTON FOR CODE BLOCKS ---------- */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  /* ---------- VOICE RECOGNITION FUNCTIONS ---------- */
  const startVoiceRecognition = () => {
    if (recognitionRef.current && !isRecording) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
        setIsRecording(false);
      }
    }
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setIsListening(false);
    }
  };

  const toggleVoiceRecognition = () => {
    if (isRecording) {
      stopVoiceRecognition();
    } else {
      startVoiceRecognition();
    }
  };

  /* ---------- TEXT-TO-SPEECH FUNCTION ---------- */
  const speakText = (text: string) => {
    if (synthesisRef.current) {
      // Stop any ongoing speech
      synthesisRef.current.cancel();

      // Remove markdown formatting for cleaner speech
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links
        .trim();

      if (cleanText) {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = 'en-US';
        
        synthesisRef.current.speak(utterance);
      }
    }
  };


  /* -------------- UI + MARKDOWN FIXES -------------- */
  return (
    <div className="h-full flex flex-col cm-sidebar overflow-hidden">
      <div className="h-10 px-3 border-b border-[var(--cm-border)] bg-[rgba(2,6,23,0.5)] flex items-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cm-primary)]">
          AI Assistant
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[82%] px-3 py-2 rounded-xl text-[13px] leading-[1.45] ${
                m.role === 'user'
                  ? 'cm-btn-primary text-white'
                  : 'bg-[rgba(148,163,184,0.12)] text-slate-100 border border-[var(--cm-border)]'
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  /* -------- FIXED MARKDOWN CODE BLOCKS -------- */
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");

                    if (!inline) {
                      const codeText = String(children).replace(/\n$/, "");

                      return (
                        <div className="relative mt-2 mb-3">
                          
                          {/* COPY BUTTON */}
                          <button
                            onClick={() => copyToClipboard(codeText)}
                            className="absolute right-2 top-2 text-xs text-slate-300 hover:text-white bg-black/20 px-2 py-1 rounded"
                          >
                            <Copy size={12} />
                          </button>

                          <pre className="!m-0 !p-0 rounded-md overflow-hidden">
                            <SyntaxHighlighter
                              language={match?.[1] || "text"}
                              style={oneDark}
                              customStyle={{
                                padding: "14px",
                                fontSize: "12px",
                                background: "rgba(0,0,0,0.25)"
                              }}
                              {...props}
                            >
                              {codeText}
                            </SyntaxHighlighter>
                          </pre>
                        </div>
                      );
                    }

                    return <code className="px-1 py-0.5 bg-black/20 rounded text-[11px]">{children}</code>;
                  }
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[82%] px-3 py-2 rounded-xl text-[13px] leading-[1.45] bg-[rgba(148,163,184,0.12)] text-sky-300 border border-[var(--cm-border)] flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-2.5 border-t border-[var(--cm-border)] bg-[rgba(2,6,23,0.55)]">
        <div className="flex gap-2 items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask me anything..."
            className="flex-1 h-10 max-h-24 rounded-lg px-3 py-2 text-sm text-[var(--cm-text)] bg-[rgba(15,23,42,0.75)] border border-[var(--cm-border-soft)] focus:outline-none focus:border-[var(--cm-primary)]"
          />

          <button
            onClick={toggleVoiceRecognition}
            disabled={isLoading}
            className={`px-3 py-2 rounded transition-colors ${
              isRecording || isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'cm-btn-ghost text-[var(--cm-text)]'
            }`}
            title={isRecording || isListening ? 'Stop recording' : 'Start voice input'}
          >
            {isRecording || isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 rounded cm-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Copy, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  codeSnippet?: string;
}

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hi! I\'m your AI coding assistant. I can help you with code explanations, suggestions, debugging, and more. What would you like to work on?',
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { activeFile, getCodeContext } = useProject();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Get current code context
      const context = getCodeContext();
      
      // Simulate AI response (replace with actual API call)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: generateAIResponse(inputValue, context),
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAIResponse = (input: string, context: any) => {
    // Simple response generator (replace with actual AI API)
    const responses = [
      "I can help you with that! Let me analyze your code and provide suggestions.",
      "That's a great question! Based on your current file, here's what I think...",
      "I see you're working on a JavaScript file. Here are some optimization suggestions:",
      "Let me explain that code pattern for you and suggest improvements.",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div key={message.id} className="flex space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              message.type === 'user' ? 'bg-blue-600' : 'bg-purple-600'
            }`}>
              {message.type === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium">
                  {message.type === 'user' ? 'You' : 'AI Assistant'}
                </span>
                <span className="text-xs text-gray-400">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {message.codeSnippet && (
                  <div className="mt-3 bg-gray-800 rounded p-3 relative">
                    <pre className="text-sm text-green-400 overflow-x-auto">
                      <code>{message.codeSnippet}</code>
                    </pre>
                    <button
                      onClick={() => copyToClipboard(message.codeSnippet!)}
                      className="absolute top-2 right-2 p-1 hover:bg-gray-600 rounded"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                )}
              </div>

              {message.type === 'assistant' && (
                <div className="flex items-center space-x-2 mt-2">
                  <button className="p-1 hover:bg-gray-700 rounded">
                    <ThumbsUp size={12} />
                  </button>
                  <button className="p-1 hover:bg-gray-700 rounded">
                    <ThumbsDown size={12} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex space-x-3">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="flex-1">
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-t border-gray-700">
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setInputValue('Explain this code')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-xs transition-colors"
          >
            Explain Code
          </button>
          <button
            onClick={() => setInputValue('Optimize this function')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-xs transition-colors"
          >
            Optimize
          </button>
          <button
            onClick={() => setInputValue('Find bugs')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-xs transition-colors"
          >
            Debug
          </button>
          <button
            onClick={() => setInputValue('Add comments')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-xs transition-colors"
          >
            Comment
          </button>
        </div>

        {/* Input */}
        <div className="flex space-x-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={activeFile ? `Ask about ${activeFile.name}...` : 'Ask me anything...'}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
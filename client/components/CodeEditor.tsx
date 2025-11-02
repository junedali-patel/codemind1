'use client';

import { useState, useRef } from "react";
import dynamic from 'next/dynamic';
import axios from "axios";
import { Sparkles, X, Check, AlertCircle, Loader2 } from 'lucide-react';

// Dynamically import the Monaco editor with no SSR
const Editor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
);

// Get API base URL from environment or use default
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type Props = {
  code: string;
  language: string;
  height?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
};

const CodeEditor = ({ 
  code, 
  language, 
  height = "70vh",
  onChange,
  readOnly = false
}: Props) => {
  const [suggestion, setSuggestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSuggest = async () => {
    if (!code.trim()) {
      setError("Please write some code first");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuggestion("");
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/ai/complete`, {
        code,
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.data && response.data.suggestion) {
        setSuggestion(response.data.suggestion);
      } else if (response.data && response.data.error) {
        throw new Error(response.data.error);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      console.error("AI Suggestion Error:", err);
      
      let errorMessage = "Failed to get AI suggestions.";
      
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        errorMessage = "⚠️ Cannot connect to AI service. Please ensure the server is running on port 4000.\n\nRun: cd server && npm start";
      } else if (err.response) {
        const { data } = err.response;
        errorMessage = data.error || data.message || errorMessage;
        if (data.details) {
          errorMessage += `\n${data.details}`;
        }
        if (data.suggestion) {
          errorMessage += `\n\n💡 Tip: ${data.suggestion}`;
        }
      } else if (err.request) {
        errorMessage = "⚠️ No response from AI service. Check if the server is running.";
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = "⏱️ Request timed out. The AI service is taking too long.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const applySuggestion = () => {
    if (onChange && suggestion) {
      onChange(code + "\n" + suggestion);
      setSuggestion("");
    }
  };

  const editorRef = useRef(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Editor Header */}
      <div className="h-9 flex items-center justify-between bg-[#2d2d2d] px-4 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#858585] uppercase tracking-wider">
            {language || 'plaintext'}
          </span>
        </div>
        {!readOnly && (
          <button
            onClick={handleSuggest}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1 text-xs rounded bg-[#007acc] hover:bg-[#005a9e] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>AI Thinking...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>AI Suggest</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage={language}
          language={language}
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange?.(value || '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            readOnly,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            contextmenu: true,
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-[#5a1d1d] border-t border-[#be1100] px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-[#f48771] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm text-[#f48771] font-medium mb-1">AI Suggestion Error</div>
              <pre className="text-xs text-[#cccccc] whitespace-pre-wrap font-mono">
                {error}
              </pre>
            </div>
            <button
              onClick={() => setError("")}
              className="text-[#858585] hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* AI Suggestion Display */}
      {suggestion && (
        <div className="bg-[#1e1e1e] border-t border-[#2b2b2b] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#007acc]" />
              <span className="text-sm font-medium text-[#cccccc]">AI Suggestion</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={applySuggestion}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#007acc] hover:bg-[#005a9e] rounded text-white transition-colors"
              >
                <Check size={12} />
                Apply
              </button>
              <button
                onClick={() => setSuggestion("")}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[#3e3e3e] hover:bg-[#4e4e4e] rounded text-[#cccccc] transition-colors"
              >
                <X size={12} />
                Dismiss
              </button>
            </div>
          </div>
          <pre className="text-xs bg-[#0d1117] p-3 rounded border border-[#2b2b2b] overflow-auto text-[#cccccc] font-mono">
            {suggestion}
          </pre>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;

'use client';

import { useState, useRef, useCallback } from "react";
import dynamic from 'next/dynamic';
import axios from "axios";
import { Sparkles } from 'lucide-react';

// Dynamically import the Monaco editor with no SSR
const Editor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
);

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
      const response = await axios.post("http://localhost:4000/api/ai/complete", {
        code,
      }, {
        timeout: 30000, // 30 seconds in milliseconds
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true // Prevent axios from throwing on HTTP error status
      });
      
      if (response.data && response.data.suggestion) {
        setSuggestion(response.data.suggestion);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      console.error("AI Suggestion Error:", err);
      
      let errorMessage = "Failed to get AI suggestions. Please try again.";
      
      if (err.response) {
        // Server responded with an error status code
        const { data } = err.response;
        errorMessage = data.error || data.message || errorMessage;
        
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }
      } else if (err.request) {
        // Request was made but no response received
        errorMessage = "No response from the AI service. Please check your connection and try again.";
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = "Request timed out. The AI service is taking too long to respond.";
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
    <div className="rounded-md overflow-hidden border border-[#30363d] mt-4">
      <div className="flex justify-between items-center bg-[#161b22] px-4 py-2 border-b border-[#30363d]">
        <div className="text-sm text-gray-400">
          {language ? language.toUpperCase() : 'TEXT'}
        </div>
        {!readOnly && (
          <button
            onClick={handleSuggest}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            {isLoading ? 'Thinking...' : 'Suggest'}
          </button>
        )}
      </div>
      
      <div className="h-full">
        <Editor
          height={height}
          defaultLanguage={language}
          language={language}
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange?.(value || '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 10 },
            readOnly,
          }}
        />
      </div>

      {error && (
        <div className="bg-red-900/50 border-t border-red-800 text-red-200 p-3 text-sm">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="bg-[#1c2128] border-t border-[#30363d] p-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium text-gray-300">AI Suggestion</h4>
            <div className="flex gap-2">
              <button
                onClick={applySuggestion}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                Apply
              </button>
              <button
                onClick={() => setSuggestion("")}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              >
                Dismiss
              </button>
            </div>
          </div>
          <pre className="text-xs bg-[#0d1117] p-3 rounded overflow-auto text-gray-300">
            {suggestion}
          </pre>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;

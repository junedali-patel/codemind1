'use client';

import { useRef, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import type { EditorProps } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import { AlertCircle, Check, Loader2, Sparkles, X } from '@/lib/icons';

function MonacoFallbackEditor(props: EditorProps) {
  const value = typeof props.value === 'string' ? props.value : '';
  const readOnly = Boolean(props.options?.readOnly);
  const height = typeof props.height === 'number' ? `${props.height}px` : props.height || '100%';

  return (
    <div className="h-full w-full cm-editor flex flex-col" style={{ height }}>
      <div className="px-4 py-2 text-xs text-amber-200 border-b border-amber-400/30 bg-amber-500/10">
        Monaco failed to load. Using fallback editor.
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(event) =>
          props.onChange?.(event.target.value, {} as MonacoEditor.IModelContentChangedEvent)
        }
        className="flex-1 w-full resize-none bg-[#0d1117] text-[#e2e8f0] cm-mono text-sm p-4 focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}

async function loadMonacoEditor(retry = 0): Promise<{ default: ComponentType<EditorProps> }> {
  try {
    const mod = await import('@monaco-editor/react');
    return { default: mod.default };
  } catch (error) {
    if (retry < 1) {
      return loadMonacoEditor(retry + 1);
    }

    console.error('Failed to load Monaco editor chunk, using fallback editor.', error);
    return { default: MonacoFallbackEditor };
  }
}

const Editor = dynamic<EditorProps>(() => loadMonacoEditor(), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center cm-editor">
      <Loader2 className="w-6 h-6 text-[var(--cm-primary)] animate-spin" />
    </div>
  ),
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type Props = {
  code: string;
  language: string;
  height?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
};

export default function CodeEditor({
  code,
  language,
  height = '70vh',
  onChange,
  readOnly = false,
}: Props) {
  const [suggestion, setSuggestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const handleSuggest = async () => {
    if (!code.trim()) {
      setError('Please write some code first');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuggestion('');
    setShowSuggestion(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/complete`,
        { code, language: language || 'javascript' },
        {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.data?.suggestion) {
        setSuggestion(response.data.suggestion);
      } else if (response.data?.completion) {
        setSuggestion(response.data.completion);
      } else if (response.data?.error) {
        throw new Error(response.data.error);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: unknown) {
      let errorMessage = 'Failed to get AI suggestions.';
      if (axios.isAxiosError(err) && (err.code === 'ERR_NETWORK' || err.message === 'Network Error')) {
        errorMessage =
          'Cannot connect to AI service. Ensure server is running on port 4000.\nRun: cd server && npm start';
      } else if (axios.isAxiosError(err) && err.response) {
        const { data, status } = err.response;
        const typedData = (data ?? {}) as { error?: string; message?: string; details?: string; suggestion?: string };
        if (status === 400) {
          errorMessage = `Bad Request: ${typedData.error || typedData.message || 'Invalid request format'}`;
          if (typedData.details) errorMessage += `\nDetails: ${typedData.details}`;
        } else {
          errorMessage = typedData.error || typedData.message || errorMessage;
          if (typedData.details) errorMessage += `\n${typedData.details}`;
        }
        if (typedData.suggestion) errorMessage += `\nTip: ${typedData.suggestion}`;
      } else if (axios.isAxiosError(err) && err.request) {
        errorMessage = 'No response from AI service. Check if the server is running.';
      } else if (axios.isAxiosError(err) && err.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. The AI service is taking too long.';
      } else if (err instanceof Error && err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const applySuggestion = () => {
    if (onChange && suggestion) {
      onChange(`${code}\n${suggestion}`);
      setSuggestion('');
      setShowSuggestion(false);
    }
  };

  const dismissSuggestion = () => {
    setSuggestion('');
    setShowSuggestion(false);
    setError('');
  };

  const handleEditorDidMount = (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('codemind-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e2e8f0',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#e2e8f0',
        'editor.selectionBackground': '#0ea5e955',
        'editor.inactiveSelectionBackground': '#0ea5e933',
        'editorCursor.foreground': '#38bdf8',
        'editor.lineHighlightBackground': '#1e293b55',
      },
    });
    monaco.editor.setTheme('codemind-dark');
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border border-[#30363d] rounded-none">
      <div className="h-8 px-3 border-b border-[#30363d] bg-[#0d1117] flex items-center justify-between">
        <div className="cm-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">{language}</div>
        <button
          onClick={handleSuggest}
          disabled={isLoading || readOnly || !code.trim()}
          className="h-6 px-2.5 rounded border border-[#3b82f6]/20 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#58a6ff] text-[10px] font-semibold tracking-[0.06em] uppercase flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles size={12} />
              AI Suggest
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-hidden" style={{ height }}>
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(value) => onChange?.(value)}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            readOnly,
            theme: 'codemind-dark',
            formatOnPaste: true,
            formatOnType: true,
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            automaticLayout: true,
          }}
        />
      </div>

      {error && (
        <div className="px-4 py-3 border-t border-red-400/35 bg-red-500/10 text-red-200 text-xs whitespace-pre-wrap cm-mono">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError('')} className="text-red-200 hover:text-white">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {showSuggestion && suggestion && (
        <div className="px-3 py-2 border-t border-[var(--cm-border)] bg-[rgba(79,142,247,0.08)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[var(--cm-primary)] text-[10px] font-semibold uppercase tracking-[0.08em]">
              <Sparkles size={12} />
              AI Suggestion
            </div>
            <button onClick={dismissSuggestion} className="text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]">
              <X size={12} />
            </button>
          </div>
          <pre className="text-xs text-slate-100 cm-mono mb-2 rounded-lg border border-[var(--cm-border)] bg-[rgba(2,6,23,0.6)] p-3 overflow-x-auto">
            {suggestion}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={applySuggestion}
              className="h-7 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
            >
              <Check size={12} />
              Apply
            </button>
            <button
              onClick={dismissSuggestion}
              className="h-7 px-3 rounded-md cm-btn-ghost text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

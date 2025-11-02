import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Terminal, X, File as FileIcon } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

export const CodeEditorPanel: React.FC = () => {
  const { activeFile, updateFileContent, runCode, compilerOutput } = useProject();
  const [showTerminal, setShowTerminal] = useState(false);
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Configure Monaco for better performance
    monaco.editor.defineTheme('vs-dark-custom', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editorLineNumber.foreground': '#858585',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
      }
    });
    
    monaco.editor.setTheme('vs-dark-custom');
    
    // Add custom key bindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Save file
      console.log('Save file');
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runCode();
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFile && value !== undefined) {
      updateFileContent(activeFile.path, value);
    }
  };

  const getLanguageFromExtension = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      xml: 'xml',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      sql: 'sql',
      sh: 'shell',
      bat: 'bat',
      ps1: 'powershell',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileIcon className="mx-auto mb-4" size={48} />
          <p>No file selected</p>
          <p className="text-sm mt-2">Choose a file from the explorer to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center">
        <div className="flex items-center px-3 py-2 bg-gray-900 border-r border-gray-700">
          <span className="text-sm">{activeFile.name}</span>
          <button className="ml-2 hover:bg-gray-700 rounded p-1">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className={`flex-1 ${showTerminal ? 'h-2/3' : 'h-full'}`}>
        <Editor
          height="100%"
          language={getLanguageFromExtension(activeFile.name)}
          value={activeFile.content || ''}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'smart',
            folding: true,
            foldingHighlight: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* Terminal Panel */}
      {showTerminal && (
        <div className="h-1/3 bg-gray-900 border-t border-gray-700 flex flex-col">
          <div className="h-8 bg-gray-800 flex items-center justify-between px-3">
            <div className="flex items-center space-x-2">
              <Terminal size={14} />
              <span className="text-sm">Terminal</span>
            </div>
            <button
              onClick={() => setShowTerminal(false)}
              className="hover:bg-gray-700 rounded p-1"
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex-1 p-3 overflow-y-auto font-mono text-sm">
            {compilerOutput ? (
              <pre className="whitespace-pre-wrap text-green-400">
                {compilerOutput}
              </pre>
            ) : (
              <div className="text-gray-400">Ready to run code...</div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-3">
        <div className="flex items-center space-x-4 text-xs text-gray-400">
          <span>Ln 1, Col 1</span>
          <span>{getLanguageFromExtension(activeFile.name)}</span>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className="flex items-center space-x-1 px-2 py-1 hover:bg-gray-700 rounded text-xs transition-colors"
          >
            <Terminal size={12} />
            <span>Terminal</span>
          </button>
          
          <button
            onClick={runCode}
            className="flex items-center space-x-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors"
          >
            <Play size={12} />
            <span>Run</span>
          </button>
        </div>
      </div>
    </div>
  );
};
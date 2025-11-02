'use client';

import { GitBranch, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';

interface StatusBarProps {
  line?: number;
  column?: number;
  language?: string;
  branch?: string;
  errors?: number;
  warnings?: number;
  aiStatus?: 'idle' | 'processing' | 'ready';
}

export default function StatusBar({
  line = 1,
  column = 1,
  language = 'plaintext',
  branch = 'main',
  errors = 0,
  warnings = 0,
  aiStatus = 'idle'
}: StatusBarProps) {
  return (
    <div className="h-6 bg-[#007acc] flex items-center justify-between px-2 text-white text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
          <GitBranch size={14} />
          <span>{branch}</span>
        </div>
        
        {errors > 0 && (
          <div className="flex items-center gap-1 hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
            <AlertCircle size={14} />
            <span>{errors}</span>
          </div>
        )}
        
        {warnings > 0 && (
          <div className="flex items-center gap-1 hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
            <AlertCircle size={14} />
            <span>{warnings}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {aiStatus !== 'idle' && (
          <div className="flex items-center gap-1 px-2 py-0.5">
            <Sparkles size={14} className={aiStatus === 'processing' ? 'animate-pulse' : ''} />
            <span>{aiStatus === 'processing' ? 'AI Processing...' : 'AI Ready'}</span>
          </div>
        )}
        
        <div className="hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
          Ln {line}, Col {column}
        </div>
        
        <div className="hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
          {language.toUpperCase()}
        </div>
        
        <div className="hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer">
          UTF-8
        </div>
        
        <div className="hover:bg-[#0098ff] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1">
          <CheckCircle size={14} />
          <span>CodeMind</span>
        </div>
      </div>
    </div>
  );
}

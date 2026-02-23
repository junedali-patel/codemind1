'use client';

import { AlertTriangle, CircleAlert, GitBranch, Zap } from '@/lib/icons';

interface StatusBarProps {
  line?: number;
  column?: number;
  language?: string;
  branch?: string;
  aiStatus?: 'idle' | 'processing' | 'ready';
  workspaceKind?: 'repo' | 'local';
  terminalCount?: number;
  extensionHostStatus?: 'off' | 'running' | 'error';
}

const statusConfig = {
  idle: {
    label: 'AI Idle',
    dot: 'bg-slate-400',
  },
  processing: {
    label: 'AI Processing',
    dot: 'bg-amber-400 cm-pulse-soft',
  },
  ready: {
    label: 'AI Ready',
    dot: 'bg-emerald-400',
  },
};

export default function StatusBar({
  line = 1,
  column = 1,
  language = 'typescript',
  branch = 'main',
  aiStatus = 'ready',
  workspaceKind = 'repo',
  terminalCount = 0,
  extensionHostStatus = 'off',
}: StatusBarProps) {
  const config = statusConfig[aiStatus];
  const extensionStatusLabel = extensionHostStatus === 'running'
    ? 'Ext Host Running'
    : extensionHostStatus === 'error'
    ? 'Ext Host Error'
    : 'Ext Host Off';

  return (
    <footer className="h-6 px-3 bg-[#3b82f6] text-white flex items-center justify-between text-[11px] font-medium">
      <div className="flex items-center gap-4">
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors uppercase">
          {workspaceKind}
        </div>
        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
          <GitBranch size={11} />
          <span>{branch || 'main'}*</span>
        </div>
        <div className="flex items-center gap-1 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          <span>{config.label}</span>
        </div>
        <div className="flex items-center gap-1 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
          <CircleAlert size={11} />
          <span>0</span>
          <AlertTriangle size={11} />
          <span>0</span>
        </div>
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors">
          Terminals: {terminalCount}
        </div>
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors">
          {extensionStatusLabel}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors">
          Ln {line}, Col {column}
        </div>
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors">
          UTF-8
        </div>
        <div className="hover:bg-white/10 px-2 h-full cursor-pointer flex items-center transition-colors uppercase">
          {language}
        </div>
        <div className="flex items-center gap-1 hover:bg-white/10 px-2 h-full cursor-pointer transition-colors">
          <Zap size={11} />
          <span>1.5s</span>
        </div>
      </div>
    </footer>
  );
}

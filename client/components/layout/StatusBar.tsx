'use client';

import { AlertTriangle, CircleAlert, GitBranch, Zap } from 'lucide-react';

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
    <footer className="h-[22px] px-2.5 flex items-center justify-between text-[10px] cm-mono border-t border-[var(--cm-border)] bg-[rgba(11,16,25,0.98)] text-[var(--cm-text-muted)]">
      <div className="flex items-center gap-3">
        <div className="text-[var(--cm-text)] uppercase tracking-[0.08em]">
          {workspaceKind}
        </div>
        <div className="flex items-center gap-1 text-[var(--cm-text)]">
          <GitBranch size={11} />
          <span>{branch || 'no-branch'}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          <span>{config.label}</span>
        </div>
        <div>
          Terminals: {terminalCount}
        </div>
        <div>
          {extensionStatusLabel}
        </div>
        <div className="flex items-center gap-1">
          <CircleAlert size={10} />
          <span>0</span>
          <AlertTriangle size={10} />
          <span>0</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span>
          Ln {line}, Col {column}
        </span>
        <span className="uppercase text-[var(--cm-text)]">{language}</span>
        <div className="flex items-center gap-1">
          <Zap size={10} />
          <span>1.5s</span>
        </div>
      </div>
    </footer>
  );
}

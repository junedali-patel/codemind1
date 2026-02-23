'use client';

import {
  FileText,
  Search,
  GitBranch,
  Play,
  Blocks,
  Network,
  Zap,
  Settings,
  MoreHorizontal,
} from 'lucide-react';

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const activities = [
  { id: 'explorer', icon: FileText, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'run', icon: Play, label: 'Run and Debug' },
  { id: 'extensions', icon: Blocks, label: 'Extensions' },
  { id: 'mindmap', icon: Network, label: 'Code Visualization' },
  { id: 'ai', icon: Zap, label: 'AI Assistant' },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <aside className="w-12 cm-sidebar border-r border-[var(--cm-border)] flex flex-col items-center py-2 gap-2">
      <div className="flex flex-col gap-1">
        {activities.map(({ id, icon: Icon, label }) => {
          const isActive = activeView === id;
          return (
            <div key={id} className="relative group flex justify-center">
              {isActive && (
                <span className="absolute -left-[11px] top-1/2 -translate-y-1/2 h-6 w-[2px] rounded-r-full bg-[var(--cm-primary)] shadow-[0_0_12px_rgba(79,142,247,0.65)]" />
              )}
              <button
                onClick={() => onViewChange(id)}
                aria-label={label}
                className={`h-9 w-9 rounded-md flex items-center justify-center transition-all duration-150 ${
                  isActive
                    ? 'bg-[rgba(79,142,247,0.16)] text-[var(--cm-text)]'
                    : 'text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]'
                }`}
              >
                <Icon size={16} />
              </button>
              <div className="pointer-events-none absolute left-[120%] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--cm-border)] bg-[var(--cm-surface-2)] px-2 py-1 text-[11px] text-[var(--cm-text)] opacity-0 shadow-lg transition-all group-hover:opacity-100 group-hover:translate-x-1">
                {label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1">
        <button
          onClick={() => {}}
          aria-label="More"
          className="h-9 w-9 rounded-md flex items-center justify-center text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)] transition-all"
        >
          <MoreHorizontal size={16} />
        </button>
        <button
          onClick={() => onViewChange('settings')}
          aria-label="Settings"
          className={`h-9 w-9 rounded-md flex items-center justify-center transition-all ${
            activeView === 'settings'
              ? 'bg-[rgba(79,142,247,0.16)] text-[var(--cm-text)]'
              : 'text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]'
          }`}
        >
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}

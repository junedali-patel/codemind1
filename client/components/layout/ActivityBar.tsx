'use client';

import {
  CircleUser,
  FileText,
  Search,
  GitBranch,
  Play,
  Blocks,
  Network,
  Zap,
  Settings,
} from '@/lib/icons';

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
    <aside className="w-12 border-r border-[#30363d] bg-[#010409] flex flex-col items-center py-4 gap-4 z-20">
      <nav className="flex flex-col gap-4 items-center flex-1">
        {activities.map(({ id, icon: Icon, label }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              aria-label={label}
              className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
                isActive ? 'text-[#58a6ff]' : 'text-slate-500 hover:text-[#f0f6fc]'
              }`}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 items-center">
        <button
          aria-label="Account"
          className="h-7 w-7 rounded flex items-center justify-center text-slate-500 hover:text-[#f0f6fc] transition-colors"
        >
          <CircleUser size={18} />
        </button>
        <button
          onClick={() => onViewChange('settings')}
          aria-label="Settings"
          className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${
            activeView === 'settings'
              ? 'text-[#58a6ff]'
              : 'text-slate-500 hover:text-[#f0f6fc]'
          }`}
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}

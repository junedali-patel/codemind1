'use client';

import { FileText, X } from '@/lib/icons';

export interface EditorTab {
  id: string;
  name: string;
  language?: string;
  isDirty?: boolean;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export default function EditorTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
}: EditorTabsProps) {
  return (
    <div className="h-9 bg-[#010409] border-b border-[#30363d] flex items-stretch overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={`group relative flex items-center gap-2 px-3 border-r border-[#30363d] text-[11px] transition-all ${
              isActive
                ? 'bg-[#0d1117] text-[#f0f6fc]'
                : 'bg-[#010409] text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-0 h-[2px] w-full bg-[#3b82f6]" />
            )}
            <FileText size={12} className="text-[#58a6ff] shrink-0" />
            <span className="max-w-32 truncate font-medium">{tab.name}</span>
            {tab.isDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#f6bd60] cm-pulse-soft shrink-0" />
            )}
            <span
              onClick={(event) => {
                event.stopPropagation();
                onTabClose(tab.id);
              }}
              className={`h-4 w-4 rounded flex items-center justify-center transition-all ${
                isActive
                  ? 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                  : 'text-transparent group-hover:text-slate-500 group-hover:hover:text-slate-200 group-hover:hover:bg-white/5'
              }`}
            >
              <X size={11} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

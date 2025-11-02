'use client';

import { X, File } from 'lucide-react';

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  isDirty?: boolean;
  icon?: string;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export default function EditorTabs({ tabs, activeTabId, onTabClick, onTabClose }: EditorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="h-9 bg-[#1e1e1e] border-b border-[#2b2b2b] flex items-center overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`h-full px-3 flex items-center gap-2 cursor-pointer border-r border-[#2b2b2b] group min-w-[120px] ${
            activeTabId === tab.id
              ? 'bg-[#1e1e1e] text-white'
              : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#1e1e1e]'
          }`}
          onClick={() => onTabClick(tab.id)}
        >
          <File size={14} className="flex-shrink-0" />
          <span className="text-xs truncate flex-1">{tab.title}</span>
          {tab.isDirty && <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 hover:bg-[#3e3e3e] rounded p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

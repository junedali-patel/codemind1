'use client';

import { useState } from 'react';
import { Terminal, AlertCircle, FileOutput, X } from 'lucide-react';

interface PanelProps {
  height?: number;
  onClose?: () => void;
}

export default function Panel({ height = 200, onClose }: PanelProps) {
  const [activeTab, setActiveTab] = useState<'terminal' | 'problems' | 'output'>('terminal');

  const tabs = [
    { id: 'terminal', label: 'Terminal', icon: Terminal },
    { id: 'problems', label: 'Problems', icon: AlertCircle },
    { id: 'output', label: 'Output', icon: FileOutput },
  ];

  return (
    <div 
      className="bg-[#1e1e1e] border-t border-[#2b2b2b] flex flex-col"
      style={{ height: `${height}px` }}
    >
      <div className="h-9 flex items-center bg-[#1e1e1e] border-b border-[#2b2b2b]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`h-full px-4 flex items-center gap-2 text-xs border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-[#007acc]'
                  : 'text-[#969696] border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            className="h-full px-3 text-[#858585] hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2 font-mono text-xs text-[#cccccc]">
        {activeTab === 'terminal' && (
          <div className="space-y-1">
            <div className="text-green-400">$ npm run dev</div>
            <div className="text-[#858585]">Ready on http://localhost:3000</div>
            <div className="text-[#858585]">✓ Compiled successfully</div>
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="text-[#858585]">
            No problems detected in the workspace.
          </div>
        )}
        {activeTab === 'output' && (
          <div className="space-y-1 text-[#858585]">
            <div>[Info] CodeMind AI Assistant initialized</div>
            <div>[Info] Ready to assist with code analysis</div>
          </div>
        )}
      </div>
    </div>
  );
}

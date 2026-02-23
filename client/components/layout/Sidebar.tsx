'use client';

import { ReactNode } from 'react';
import { MoreHorizontal } from '@/lib/icons';

interface SidebarProps {
  title: string;
  width?: number;
  onClose?: () => void;
  children: ReactNode;
}

export default function Sidebar({
  title,
  width = 240,
  onClose = () => {},
  children,
}: SidebarProps) {
  return (
    <aside
      className="h-full border-r border-[#30363d] bg-[#010409] flex flex-col shrink-0"
      style={{ width: `${width}px` }}
    >
      <div className="h-10 px-4 border-b border-[#30363d] flex items-center justify-between bg-[#010409]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {title}
        </h2>
        <button
          onClick={onClose}
          aria-label="Sidebar options"
          className="h-6 w-6 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 flex items-center justify-center transition-all"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}

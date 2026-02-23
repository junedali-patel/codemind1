'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

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
      className="h-full cm-sidebar border-r border-[var(--cm-border)] flex flex-col shrink-0"
      style={{ width: `${width}px` }}
    >
      <div className="h-9 px-3 border-b border-[var(--cm-border)] flex items-center justify-between bg-[rgba(13,18,27,0.92)]">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cm-text-muted)]">
          {title}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          className="h-6 w-6 rounded text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)] flex items-center justify-center transition-all"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}

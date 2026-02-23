'use client';

import { useMemo } from 'react';
import { GitBranch, GitCommit, Upload, RefreshCcw, Plus, ListChecks } from '@/lib/icons';

export interface GitStatusPayload {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface GitViewProps {
  status: GitStatusPayload | null;
  commitMessage: string;
  isBusy?: boolean;
  onCommitMessageChange: (value: string) => void;
  onStageAll: () => void;
  onStageFile: (path: string) => void;
  onCommit: () => void;
  onPush: () => void;
  onSync: () => void;
}

export default function GitView({
  status,
  commitMessage,
  isBusy = false,
  onCommitMessageChange,
  onStageAll,
  onStageFile,
  onCommit,
  onPush,
  onSync,
}: GitViewProps) {
  const stagedCount = status?.staged.length || 0;
  const unstagedCount = (status?.unstaged.length || 0) + (status?.untracked.length || 0);

  const combinedUnstaged = useMemo(() => {
    const modified = status?.unstaged || [];
    const untracked = (status?.untracked || []).filter((item) => !modified.includes(item));
    return [...modified, ...untracked];
  }, [status]);

  return (
    <div className="h-full bg-[#010409] p-2 text-[#c9d1d9] overflow-y-auto">
      <section className="mb-3">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 border-b border-[#30363d] pb-2 mb-2">
          <GitBranch size={12} />
          Source Control
        </h3>
        <div className="flex items-center gap-2 px-2 h-7 rounded bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[11px] mb-2">
          <span className="h-2 w-2 rounded-full bg-[#58a6ff]" />
          <span className="cm-mono text-[#58a6ff]">{status?.branch || 'main'}</span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.08em] text-slate-500">
            {stagedCount} staged / {unstagedCount} changed
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSync}
            disabled={isBusy}
            className="h-7 rounded border border-[#30363d] hover:bg-white/5 text-[11px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <RefreshCcw size={12} />
            Sync
          </button>
          <button
            onClick={onPush}
            disabled={isBusy}
            className="h-7 rounded border border-[#30363d] hover:bg-white/5 text-[11px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Upload size={12} />
            Push
          </button>
        </div>
      </section>

      <section className="mb-3">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 border-b border-[#30363d] pb-2 mb-2">
          <ListChecks size={12} />
          Changes
        </h3>
        <button
          onClick={onStageAll}
          disabled={isBusy}
          className="w-full h-7 rounded border border-[#30363d] hover:bg-white/5 text-[11px] flex items-center justify-center gap-1 mb-2 disabled:opacity-50"
        >
          <Plus size={12} />
          Stage All
        </button>
        <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
          {combinedUnstaged.length === 0 && (
            <div className="text-[11px] text-slate-500 px-2 py-2 rounded bg-[rgba(8,12,20,0.72)] border border-[#30363d]">
              No unstaged changes.
            </div>
          )}
          {combinedUnstaged.map((filePath) => (
            <div
              key={filePath}
              className="px-2 py-1 rounded bg-[rgba(8,12,20,0.76)] border border-[#30363d]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] truncate flex-1">{filePath}</span>
                <button
                  onClick={() => onStageFile(filePath)}
                  disabled={isBusy}
                  className="h-5 px-2 rounded text-[10px] border border-[#30363d] hover:bg-white/5 disabled:opacity-50"
                >
                  Stage
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 border-b border-[#30363d] pb-2 mb-2">
          <GitCommit size={12} />
          Commit
        </h3>
        <textarea
          value={commitMessage}
          onChange={(event) => onCommitMessageChange(event.target.value)}
          placeholder="Commit message"
          className="w-full min-h-20 rounded bg-[rgba(8,12,20,0.84)] border border-[#30363d] px-2 py-2 text-[11px] text-[#c9d1d9] placeholder:text-slate-500 focus:outline-none focus:border-[#3b82f6]"
        />
        <button
          onClick={onCommit}
          disabled={isBusy}
          className="w-full h-7 mt-2 rounded border border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#58a6ff] text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-[#3b82f6]/20"
        >
          <GitCommit size={12} />
          Commit
        </button>
      </section>
    </div>
  );
}

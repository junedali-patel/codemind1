'use client';

import { GitBranch, GitCommit, GitPullRequest, RefreshCw } from 'lucide-react';

export default function GitView() {
  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-[#cccccc] uppercase tracking-wider">
          Source Control
        </h3>
        <button className="text-[#858585] hover:text-white">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-[#cccccc] bg-[#2d2d2d] px-3 py-2 rounded">
          <GitBranch size={16} className="text-[#858585]" />
          <span>main</span>
        </div>

        <div className="pt-2 border-t border-[#2b2b2b]">
          <div className="text-xs text-[#858585] mb-2">CHANGES</div>
          <div className="text-sm text-[#858585] py-4 text-center">
            No changes detected
          </div>
        </div>

        <div className="pt-2 border-t border-[#2b2b2b]">
          <div className="text-xs text-[#858585] mb-2">STAGED CHANGES</div>
          <div className="text-sm text-[#858585] py-4 text-center">
            No staged changes
          </div>
        </div>
      </div>

      <button className="w-full bg-[#007acc] hover:bg-[#005a9e] text-white text-sm py-2 rounded transition-colors flex items-center justify-center gap-2">
        <GitCommit size={16} />
        Commit
      </button>

      <button className="w-full bg-[#2d2d2d] hover:bg-[#3e3e3e] text-[#cccccc] text-sm py-2 rounded transition-colors flex items-center justify-center gap-2">
        <GitPullRequest size={16} />
        Pull Request
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Search, FileText } from 'lucide-react';

export default function SearchView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');

  return (
    <div className="p-3 space-y-4">
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#2d2d2d] text-[#cccccc] text-sm rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#007acc] placeholder-[#858585]"
        />
        <input
          type="text"
          placeholder="Replace"
          value={replaceQuery}
          onChange={(e) => setReplaceQuery(e.target.value)}
          className="w-full bg-[#2d2d2d] text-[#cccccc] text-sm rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#007acc] placeholder-[#858585]"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[#cccccc] cursor-pointer">
          <input type="checkbox" className="rounded" />
          Match Case
        </label>
        <label className="flex items-center gap-2 text-sm text-[#cccccc] cursor-pointer">
          <input type="checkbox" className="rounded" />
          Match Whole Word
        </label>
        <label className="flex items-center gap-2 text-sm text-[#cccccc] cursor-pointer">
          <input type="checkbox" className="rounded" />
          Use Regular Expression
        </label>
      </div>

      <div className="pt-4 border-t border-[#2b2b2b]">
        <div className="text-xs text-[#858585] mb-2">FILES TO INCLUDE</div>
        <input
          type="text"
          placeholder="e.g., *.js, src/**"
          className="w-full bg-[#2d2d2d] text-[#cccccc] text-sm rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#007acc] placeholder-[#858585]"
        />
      </div>

      <div className="pt-4 border-t border-[#2b2b2b]">
        <div className="text-xs text-[#858585] mb-2">FILES TO EXCLUDE</div>
        <input
          type="text"
          placeholder="e.g., node_modules, dist"
          className="w-full bg-[#2d2d2d] text-[#cccccc] text-sm rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#007acc] placeholder-[#858585]"
        />
      </div>

      {searchQuery && (
        <div className="pt-4 border-t border-[#2b2b2b] text-sm text-[#858585]">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} />
            <span>Search results will appear here</span>
          </div>
        </div>
      )}
    </div>
  );
}

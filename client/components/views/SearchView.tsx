'use client';

import { Search } from '@/lib/icons';

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

interface SearchViewProps {
  query: string;
  isSearching?: boolean;
  results: SearchMatch[];
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onSelectResult: (result: SearchMatch) => void;
}

export default function SearchView({
  query,
  isSearching = false,
  results,
  onQueryChange,
  onSearch,
  onSelectResult,
}: SearchViewProps) {
  return (
    <div className="h-full flex flex-col bg-[#010409]">
      <div className="p-2 border-b border-[#30363d] bg-[#010409]">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSearch(query);
              }
            }}
            placeholder="Search in files..."
            className="w-full h-7 rounded border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] pl-8 pr-2 text-[11px] placeholder:text-slate-500 focus:outline-none focus:border-[#3b82f6]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {isSearching && (
          <div className="text-[11px] text-slate-500 px-2 py-2">Searching...</div>
        )}
        {!isSearching && query.trim().length === 0 && (
          <div className="text-[11px] text-slate-500 px-2 py-2">
            Enter a query and press Enter.
          </div>
        )}
        {!isSearching && query.trim().length > 0 && results.length === 0 && (
          <div className="text-[11px] text-slate-500 px-2 py-2">No matches found.</div>
        )}
        {results.map((result, index) => (
          <button
            key={`${result.path}:${result.line}:${result.column}:${index}`}
            onClick={() => onSelectResult(result)}
            className="w-full text-left p-1.5 rounded border border-transparent hover:border-[#30363d] hover:bg-white/5 mb-1"
          >
            <div className="text-[11px] text-[#58a6ff] truncate">{result.path}</div>
            <div className="text-[10px] text-slate-500">
              Ln {result.line}, Col {result.column}
            </div>
            <div className="text-[11px] text-[#c9d1d9] truncate mt-0.5">{result.preview}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

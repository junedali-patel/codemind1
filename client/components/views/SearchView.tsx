'use client';

import { Search } from 'lucide-react';

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
    <div className="h-full flex flex-col cm-sidebar">
      <div className="p-2 border-b border-[var(--cm-border)] bg-[rgba(12,18,28,0.94)]">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--cm-text-muted)]" />
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
            className="w-full h-7 rounded border border-[var(--cm-border-soft)] bg-[rgba(10,15,23,0.88)] text-[var(--cm-text)] pl-8 pr-2 text-[11px] placeholder:text-[var(--cm-text-muted)] focus:outline-none focus:border-[var(--cm-primary)] focus:ring-1 focus:ring-[rgba(79,142,247,0.35)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {isSearching && (
          <div className="text-[11px] text-[var(--cm-text-muted)] px-2 py-2">Searching...</div>
        )}
        {!isSearching && query.trim().length === 0 && (
          <div className="text-[11px] text-[var(--cm-text-muted)] px-2 py-2">
            Enter a query and press Enter.
          </div>
        )}
        {!isSearching && query.trim().length > 0 && results.length === 0 && (
          <div className="text-[11px] text-[var(--cm-text-muted)] px-2 py-2">No matches found.</div>
        )}
        {results.map((result, index) => (
          <button
            key={`${result.path}:${result.line}:${result.column}:${index}`}
            onClick={() => onSelectResult(result)}
            className="w-full text-left p-1.5 rounded border border-transparent hover:border-[var(--cm-border)] hover:bg-[rgba(129,150,189,0.1)] mb-1"
          >
            <div className="text-[11px] text-[var(--cm-primary)] truncate">{result.path}</div>
            <div className="text-[10px] text-[var(--cm-text-muted)]">
              Ln {result.line}, Col {result.column}
            </div>
            <div className="text-[11px] text-[var(--cm-text)] truncate mt-0.5">{result.preview}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

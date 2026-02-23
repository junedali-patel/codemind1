'use client';

import { FormEvent, useEffect, useMemo, useRef } from 'react';
import { ChevronUp, TerminalSquare, X } from 'lucide-react';

export type PanelTab = 'problems' | 'output' | 'terminal' | 'debug';

export interface PanelProblem {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
  column?: number;
  source?: string;
}

interface PanelProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  problems?: PanelProblem[];
  outputLines?: string[];
  debugLines?: string[];
  terminalLines?: string[];
  terminalConnected?: boolean;
  terminalInput?: string;
  onTerminalInputChange?: (value: string) => void;
  onTerminalSubmit?: () => void;
  terminalTabs?: Array<{
    id: string;
    name: string;
    connected: boolean;
  }>;
  activeTerminalId?: string;
  onTerminalTabSelect?: (terminalId: string) => void;
  onTerminalCreate?: () => void;
  onTerminalClose?: (terminalId: string) => void;
}

export const panelTabs: Array<{ id: PanelTab; label: string }> = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'debug', label: 'Debug Console' },
];

function getProblemTone(problem: PanelProblem) {
  if (problem.severity === 'error') return 'text-red-300 border-red-400/45 bg-red-500/10';
  if (problem.severity === 'warning') return 'text-amber-300 border-amber-400/45 bg-amber-500/10';
  return 'text-sky-300 border-sky-400/45 bg-sky-500/10';
}

export default function Panel({
  activeTab,
  onTabChange,
  onClose = () => {},
  onToggleCollapse,
  problems = [],
  outputLines = [],
  debugLines = [],
  terminalLines = [],
  terminalConnected = false,
  terminalInput = '',
  onTerminalInputChange = () => {},
  onTerminalSubmit = () => {},
  terminalTabs = [],
  activeTerminalId = '',
  onTerminalTabSelect = () => {},
  onTerminalCreate = () => {},
  onTerminalClose = () => {},
}: PanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const problemsLabel = useMemo(() => {
    const count = problems.length;
    return count > 0 ? `Problems (${count})` : 'Problems (0)';
  }, [problems.length]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (activeTab === 'output' || activeTab === 'terminal' || activeTab === 'debug') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTab, outputLines, terminalLines, debugLines]);

  const handleTerminalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onTerminalSubmit();
  };

  return (
    <section className="h-full cm-shell border-t border-[var(--cm-border)] flex flex-col">
      <div className="h-8 px-3 border-b border-[var(--cm-border)] flex items-center justify-between bg-[rgba(12,18,28,0.94)]">
        <div className="flex items-center gap-4 overflow-x-auto">
          {panelTabs.map((tab) => {
            const label = tab.id === 'problems' ? problemsLabel : tab.label;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-[var(--cm-text)]'
                    : 'text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button
            aria-label="Minimize"
            onClick={onToggleCollapse}
            className="h-5 w-5 rounded text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)] flex items-center justify-center"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-5 w-5 rounded text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)] flex items-center justify-center"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 cm-mono text-[11px] text-[var(--cm-text-muted)]">
        {activeTab === 'problems' && (
          <div className="space-y-2">
            {problems.length === 0 ? (
              <div className="h-full flex flex-col items-start justify-center gap-1">
                <p>No problems have been detected in the workspace.</p>
                <span className="text-[10px] uppercase tracking-[0.1em]">Linter ready</span>
              </div>
            ) : (
              problems.map((problem) => (
                <div
                  key={problem.id}
                  className={`rounded-md border px-3 py-2 text-[11px] leading-5 ${getProblemTone(problem)}`}
                >
                  <div className="font-semibold">{problem.message}</div>
                  <div className="opacity-85">
                    {[problem.path, problem.line ? `Ln ${problem.line}` : '', problem.column ? `Col ${problem.column}` : '']
                      .filter(Boolean)
                      .join(' • ')}
                    {problem.source ? ` • ${problem.source}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div className="space-y-1">
            {outputLines.length === 0 ? (
              <p>Build output will appear here.</p>
            ) : (
              outputLines.map((line, index) => (
                <div key={`${line}-${index}`} className="whitespace-pre-wrap text-slate-200">
                  {line}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="h-full flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--cm-text-muted)]">
              <TerminalSquare size={12} />
              <span>{terminalConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {terminalTabs.map((terminalTab) => {
                const isActive = terminalTab.id === activeTerminalId;
                return (
                  <div key={terminalTab.id} className="flex items-center gap-1">
                    <button
                      onClick={() => onTerminalTabSelect(terminalTab.id)}
                      className={`h-6 px-2 rounded text-[10px] cm-mono flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-[rgba(79,142,247,0.22)] text-[var(--cm-text)]'
                          : 'bg-[rgba(8,12,20,0.62)] text-[var(--cm-text-muted)] hover:text-[var(--cm-text)]'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${terminalTab.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="truncate max-w-[120px]">{terminalTab.name}</span>
                    </button>
                    <button
                      onClick={() => onTerminalClose(terminalTab.id)}
                      className="h-6 w-6 rounded text-[var(--cm-text-muted)] hover:text-red-300 hover:bg-red-500/10"
                      title="Close terminal"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={onTerminalCreate}
                className="h-6 px-2 rounded text-[10px] font-semibold cm-btn-ghost"
                title="New terminal"
              >
                + New
              </button>
            </div>

            <div className="flex-1 rounded border border-[var(--cm-border)] bg-[rgba(7,11,18,0.84)] p-2 overflow-y-auto space-y-1 text-[11px]">
              {terminalLines.length === 0 && <div className="text-slate-400">$ Ready.</div>}
              {terminalLines.map((line, index) => (
                <div key={`${line}-${index}`} className="whitespace-pre-wrap text-slate-100">
                  {line}
                </div>
              ))}
            </div>

            <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <input
                value={terminalInput}
                onChange={(event) => onTerminalInputChange(event.target.value)}
                placeholder={terminalConnected ? 'Type command and press Enter' : 'Terminal unavailable'}
                disabled={!terminalConnected}
                className="h-7 flex-1 rounded border border-[var(--cm-border)] bg-[rgba(8,12,20,0.9)] px-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--cm-primary)] disabled:opacity-50"
              />
            </form>
          </div>
        )}

        {activeTab === 'debug' && (
          <div className="space-y-1">
            {debugLines.length === 0 ? (
              <div className="h-full flex flex-col items-start justify-center gap-1">
                <p>Debug console is idle.</p>
                <span className="text-[10px] uppercase tracking-[0.1em]">Attach a debugger to begin</span>
              </div>
            ) : (
              debugLines.map((line, index) => (
                <div key={`${line}-${index}`} className="whitespace-pre-wrap text-slate-200">
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

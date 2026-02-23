'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import Panel, { PanelProblem, PanelTab } from './Panel';
import EditorTabs, { EditorTab } from './EditorTabs';
import AIChatView from '../views/AIChatView';
import ExplorerView, { FileNode } from '../views/ExplorerView';
import SearchView, { SearchMatch } from '../views/SearchView';
import GitView, { GitStatusPayload } from '../views/GitView';
import MindMapView from '../views/MindMapView';
import SettingsView from '../views/SettingsView';
import ExtensionsView from '../views/ExtensionsView';

export type SidebarView = 'explorer' | 'search' | 'git' | 'run' | 'mindmap' | 'extensions' | 'settings';

export interface SidebarState {
  visible: boolean;
  width: number;
  activeView: SidebarView;
}

export interface PanelState {
  visible: boolean;
  height: number;
  activeTab: PanelTab;
}

interface SearchViewConfig {
  query: string;
  isSearching?: boolean;
  results: SearchMatch[];
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onSelectResult: (result: SearchMatch) => void;
}

interface GitViewConfig {
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

interface ExtensionsViewConfig {
  workspaceSessionId?: string;
}

interface PanelContent {
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

interface IDELayoutProps {
  children?: ReactNode;
  headerContent?: ReactNode;
  files?: FileNode[];
  expandedDirs?: Record<string, boolean>;
  onFileClick?: (file: FileNode) => void;
  onDirToggle?: (path: string) => void;
  selectedFile?: FileNode | null;
  tabs?: EditorTab[];
  activeTabId?: string;
  onTabClick?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onGenerateVisualization?: (file: FileNode, type: 'flowchart' | 'mindmap') => void;
  selectedFileContent?: string | null;
  analysisPanel?: {
    content: string;
    isAnalyzing?: boolean;
    onClose: () => void;
  };
  statusBarProps?: {
    line?: number;
    column?: number;
    language?: string;
    branch?: string;
    aiStatus?: 'idle' | 'processing' | 'ready';
    workspaceKind?: 'repo' | 'local';
    terminalCount?: number;
    extensionHostStatus?: 'off' | 'running' | 'error';
  };
  sidebarState?: SidebarState;
  onSidebarStateChange?: (state: SidebarState) => void;
  onSidebarResize?: (width: number) => void;
  panelState?: PanelState;
  onPanelStateChange?: (state: PanelState) => void;
  onPanelResize?: (height: number) => void;
  searchViewProps?: SearchViewConfig;
  gitViewProps?: GitViewConfig;
  extensionsViewProps?: ExtensionsViewConfig;
  panelContent?: PanelContent;
}

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const PANEL_MIN_HEIGHT = 140;

const DEFAULT_SIDEBAR_STATE: SidebarState = {
  visible: true,
  width: 280,
  activeView: 'explorer',
};

const DEFAULT_PANEL_STATE: PanelState = {
  visible: true,
  height: 220,
  activeTab: 'problems',
};

const ALL_SIDEBAR_VIEWS: SidebarView[] = ['explorer', 'search', 'git', 'run', 'mindmap', 'extensions', 'settings'];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function IDELayout({
  children,
  headerContent,
  files = [],
  expandedDirs = {},
  onFileClick = () => {},
  onDirToggle = () => {},
  selectedFile = null,
  tabs = [],
  activeTabId = '',
  onTabClick = () => {},
  onTabClose = () => {},
  onGenerateVisualization,
  selectedFileContent = null,
  analysisPanel,
  statusBarProps = {},
  sidebarState: sidebarStateProp,
  onSidebarStateChange,
  onSidebarResize,
  panelState: panelStateProp,
  onPanelStateChange,
  onPanelResize,
  searchViewProps,
  gitViewProps,
  extensionsViewProps,
  panelContent,
}: IDELayoutProps) {
  const [showAI, setShowAI] = useState(false);
  const [internalSidebarState, setInternalSidebarState] = useState<SidebarState>(
    sidebarStateProp ?? DEFAULT_SIDEBAR_STATE
  );
  const [internalPanelState, setInternalPanelState] = useState<PanelState>(
    panelStateProp ?? DEFAULT_PANEL_STATE
  );

  const sidebarState = sidebarStateProp ?? internalSidebarState;
  const panelState = panelStateProp ?? internalPanelState;

  const setSidebarState = useCallback((nextState: SidebarState) => {
    if (onSidebarStateChange) {
      onSidebarStateChange(nextState);
      return;
    }
    setInternalSidebarState(nextState);
  }, [onSidebarStateChange]);

  const setPanelState = useCallback((nextState: PanelState) => {
    if (onPanelStateChange) {
      onPanelStateChange(nextState);
      return;
    }
    setInternalPanelState(nextState);
  }, [onPanelStateChange]);

  const sidebarWidth = clamp(sidebarState.width || DEFAULT_SIDEBAR_STATE.width, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  const panelHeight = clamp(
    panelState.height || DEFAULT_PANEL_STATE.height,
    PANEL_MIN_HEIGHT,
    Math.max(PANEL_MIN_HEIGHT, Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.75))
  );

  const resizeRef = useRef<
    | {
        type: 'sidebar' | 'panel';
        startX: number;
        startY: number;
        initialSize: number;
      }
    | null
  >(null);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;

      if (resizeRef.current.type === 'sidebar') {
        const nextWidth = clamp(
          resizeRef.current.initialSize + (event.clientX - resizeRef.current.startX),
          SIDEBAR_MIN_WIDTH,
          SIDEBAR_MAX_WIDTH
        );

        setSidebarState({ ...sidebarState, visible: true, width: nextWidth });
        onSidebarResize?.(nextWidth);
        return;
      }

      const maxHeight = Math.max(PANEL_MIN_HEIGHT, Math.round(window.innerHeight * 0.75));
      const nextHeight = clamp(
        resizeRef.current.initialSize + (resizeRef.current.startY - event.clientY),
        PANEL_MIN_HEIGHT,
        maxHeight
      );

      setPanelState({ ...panelState, visible: true, height: nextHeight });
      onPanelResize?.(nextHeight);
    };

    const onMouseUp = () => {
      resizeRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onPanelResize, onSidebarResize, panelState, setPanelState, setSidebarState, sidebarState]);

  const shouldShowAnalysisPanel = !!(analysisPanel && (analysisPanel.content || analysisPanel.isAnalyzing));

  const handleActivityChange = (view: string) => {
    if (view === 'ai') {
      setShowAI((previous) => !previous);
      return;
    }

    if (!ALL_SIDEBAR_VIEWS.includes(view as SidebarView)) {
      return;
    }

    setSidebarState({
      ...sidebarState,
      visible: true,
      activeView: view as SidebarView,
    });
  };

  const renderSidebarContent = () => {
    switch (sidebarState.activeView) {
      case 'explorer':
        return (
          <ExplorerView
            files={files}
            expandedDirs={expandedDirs}
            onFileClick={onFileClick}
            onDirToggle={onDirToggle}
            selectedFile={selectedFile}
            onGenerateVisualization={onGenerateVisualization}
          />
        );
      case 'search':
        if (!searchViewProps) {
          return (
            <div className="p-4 text-sm text-[var(--cm-text-muted)] text-center">
              Search is unavailable for this workspace.
            </div>
          );
        }
        return <SearchView {...searchViewProps} />;
      case 'git':
        if (!gitViewProps) {
          return (
            <div className="p-4 text-sm text-[var(--cm-text-muted)] text-center">
              Source control is unavailable for this workspace.
            </div>
          );
        }
        return <GitView {...gitViewProps} />;
      case 'run':
        return (
          <div className="p-4 text-sm text-[var(--cm-text-muted)]">
            <p className="mb-2 text-[var(--cm-text)] font-medium">Run and Debug</p>
            <p className="leading-6">
              Use the terminal panel for runtime commands and the Debug Console tab for logs. Debug adapter
              integrations can be added in the next phase.
            </p>
          </div>
        );
      case 'mindmap':
        return <MindMapView selectedFileContent={selectedFileContent} />;
      case 'extensions':
        return <ExtensionsView workspaceSessionId={extensionsViewProps?.workspaceSessionId} />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  const sidebarTitle = useMemo(() => {
    switch (sidebarState.activeView) {
      case 'explorer':
        return 'Explorer';
      case 'search':
        return 'Search';
      case 'git':
        return 'Source Control';
      case 'run':
        return 'Run and Debug';
      case 'mindmap':
        return 'Code Visualization';
      case 'settings':
        return 'Settings';
      case 'extensions':
        return 'Extensions';
      default:
        return '';
    }
  }, [sidebarState.activeView]);

  return (
    <div className="h-screen flex flex-col cm-shell overflow-hidden">
      <div className="flex-1 flex overflow-hidden min-h-0">
        <ActivityBar activeView={showAI ? 'ai' : sidebarState.activeView} onViewChange={handleActivityChange} />

        {sidebarState.visible && (
          <>
            <Sidebar
              title={sidebarTitle}
              width={sidebarWidth}
              onClose={() => setSidebarState({ ...sidebarState, visible: false })}
            >
              <div className="h-full overflow-hidden">{renderSidebarContent()}</div>
            </Sidebar>
            <div
              role="separator"
              aria-label="Resize sidebar"
              className="w-[3px] bg-transparent hover:bg-[rgba(79,142,247,0.35)] cursor-col-resize transition-colors"
              onMouseDown={(event) => {
                resizeRef.current = {
                  type: 'sidebar',
                  startX: event.clientX,
                  startY: event.clientY,
                  initialSize: sidebarWidth,
                };
              }}
            />
          </>
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {headerContent}

          {tabs.length > 0 && (
            <EditorTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={onTabClick}
              onTabClose={onTabClose}
            />
          )}

          <div className="flex-1 overflow-hidden relative">{children}</div>

          {shouldShowAnalysisPanel && (
            <section
              className="border-t border-[var(--cm-border)] cm-panel flex flex-col"
              style={{ minHeight: 130, maxHeight: '45vh' }}
            >
              <div className="h-8 px-3 border-b border-[var(--cm-border)] flex items-center justify-between bg-[rgba(12,18,28,0.92)]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--cm-text)]">
                  AI Analysis
                </span>
                <button
                  onClick={analysisPanel?.onClose}
                  className="h-6 w-6 rounded flex items-center justify-center text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {analysisPanel?.content ? (
                  <pre className="text-xs whitespace-pre-wrap cm-mono text-slate-200/95">
                    {analysisPanel.content}
                  </pre>
                ) : (
                  <span className="text-[var(--cm-text-muted)] text-xs">
                    {analysisPanel?.isAnalyzing ? 'Analyzing...' : 'No analysis yet.'}
                  </span>
                )}
              </div>
            </section>
          )}

          {panelState.visible && (
            <>
              <div
                role="separator"
                aria-label="Resize panel"
                className="h-[3px] bg-transparent hover:bg-[rgba(79,142,247,0.35)] cursor-row-resize transition-colors"
                onMouseDown={(event) => {
                  resizeRef.current = {
                    type: 'panel',
                    startX: event.clientX,
                    startY: event.clientY,
                    initialSize: panelHeight,
                  };
                }}
              />
              <div className="shrink-0" style={{ height: `${panelHeight}px` }}>
                <Panel
                  activeTab={panelState.activeTab}
                  onTabChange={(tab) => setPanelState({ ...panelState, activeTab: tab })}
                  onClose={() => setPanelState({ ...panelState, visible: false })}
                  onToggleCollapse={() => setPanelState({ ...panelState, visible: false })}
                  problems={panelContent?.problems}
                  outputLines={panelContent?.outputLines}
                  debugLines={panelContent?.debugLines}
                  terminalLines={panelContent?.terminalLines}
                  terminalConnected={panelContent?.terminalConnected}
                  terminalInput={panelContent?.terminalInput}
                  onTerminalInputChange={panelContent?.onTerminalInputChange}
                  onTerminalSubmit={panelContent?.onTerminalSubmit}
                  terminalTabs={panelContent?.terminalTabs}
                  activeTerminalId={panelContent?.activeTerminalId}
                  onTerminalTabSelect={panelContent?.onTerminalTabSelect}
                  onTerminalCreate={panelContent?.onTerminalCreate}
                  onTerminalClose={panelContent?.onTerminalClose}
                />
              </div>
            </>
          )}
        </div>

        {showAI && (
          <aside className="w-[360px] lg:w-[400px] h-full border-l border-[var(--cm-border)] cm-sidebar flex-shrink-0 overflow-hidden transition-all duration-300">
            <div className="h-9 px-3 border-b border-[var(--cm-border)] bg-[rgba(13,18,27,0.95)] flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cm-text)]">
                AI Assistant
              </span>
              <button
                onClick={() => setShowAI(false)}
                className="h-6 w-6 rounded flex items-center justify-center text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]"
              >
                ✕
              </button>
            </div>
            <div className="h-[calc(100%-2.25rem)]">
              <AIChatView />
            </div>
          </aside>
        )}
      </div>

      <StatusBar {...statusBarProps} />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Code,
  Command,
  Loader2,
  PanelLeft,
  Save,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
  X,
} from '@/lib/icons';
import CodeEditor from '@/components/CodeEditor';
import IDELayout, {
  PanelState,
  SidebarState,
  SidebarView,
} from '@/components/layout/IDELayout';
import { EditorTab } from '@/components/layout/EditorTabs';
import { PanelProblem } from '@/components/layout/Panel';
import MindMapView from '@/components/views/MindMapView';
import { FileNode } from '@/components/views/ExplorerView';
import { GitStatusPayload } from '@/components/views/GitView';
import { SearchMatch } from '@/components/views/SearchView';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

const FILE_EXTENSIONS_FOR_ANALYSIS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'hpp',
  'md',
  'json',
  'yml',
  'yaml',
]);

interface WorkspaceOpenPayload {
  sessionId: string;
  rootPath: string;
  branch: string;
  kind?: 'repo' | 'local';
  provider?: string;
  displayName?: string;
  isGitRepo?: boolean;
}

interface WorkspaceFilePayload {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
}

interface WorkspaceTreePayload {
  tree: FileNode[];
}

interface WorkspaceMetaPayload {
  sessionId: string;
  kind: 'repo' | 'local';
  provider: string;
  displayName: string;
  rootPath: string;
  branch: string;
  isGitRepo: boolean;
}

interface WorkspaceSearchPayload {
  matches: SearchMatch[];
  total: number;
  truncated: boolean;
}

interface DocumentState {
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  isLoading: boolean;
}

interface TerminalStreamPayload {
  type: 'stdout' | 'stderr' | 'stdin' | 'system' | 'exit' | 'error';
  data: string;
  timestamp: string;
}

interface TerminalSessionPayload {
  terminalId: string;
  name?: string;
  workspaceSessionId: string;
  cwd: string;
  shell: string;
}

interface TerminalClientSession {
  id: string;
  name: string;
  connected: boolean;
  lines: string[];
  input: string;
}

interface AiAnalysisPayload {
  success?: boolean;
  analysis?: string;
  error?: string;
}

interface CommandAction {
  id: string;
  label: string;
  keywords: string[];
  run: () => void | Promise<void>;
}

type TopMenuId = 'file' | 'edit' | 'view' | 'terminal' | 'help';

interface TopMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

interface TopMenuSection {
  id: TopMenuId;
  label: string;
  actions: TopMenuAction[];
}

interface QuickOpenState {
  open: boolean;
  query: string;
  selectedIndex: number;
}

interface CommandPaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
}

type RequestError = Error & {
  status?: number;
  url?: string;
};

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getLanguage(filename: string): string {
  const extension = getExtension(filename);
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    txt: 'plaintext',
  };
  return languageMap[extension] || 'plaintext';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return fallback;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const maybeError = error as RequestError;
  return typeof maybeError.status === 'number' ? maybeError.status : undefined;
}

function flattenFilePaths(nodes: FileNode[]): string[] {
  const output: string[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      output.push(node.id);
      continue;
    }

    if (node.children?.length) {
      output.push(...flattenFilePaths(node.children));
    }
  }

  return output;
}

function findNodeById(nodes: FileNode[], nodeId: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.children?.length) {
      const found = findNodeById(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function fuzzyPathMatch(path: string, query: string): boolean {
  const pathInput = path.toLowerCase();
  const queryInput = query.toLowerCase().trim();

  if (!queryInput) {
    return true;
  }

  if (pathInput.includes(queryInput)) {
    return true;
  }

  let index = 0;
  for (const char of pathInput) {
    if (char === queryInput[index]) {
      index += 1;
    }
    if (index === queryInput.length) {
      return true;
    }
  }

  return false;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string; message?: string };
      message = payload.details || payload.error || payload.message || message;
    } catch {
      // ignore payload parsing errors
    }
    const error = new Error(message) as RequestError;
    error.status = response.status;
    error.url = url;
    throw error;
  }

  return response.json() as Promise<T>;
}

export default function RepoPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeParams = params as { owner?: string; repo?: string };
  const owner = routeParams.owner || '';
  const repo = routeParams.repo || '';
  const forcedSessionId = searchParams?.get('sessionId') || '';

  const [workspaceSessionId, setWorkspaceSessionId] = useState('');
  const [workspaceBranch, setWorkspaceBranch] = useState('main');
  const [workspaceTree, setWorkspaceTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [workspaceKind, setWorkspaceKind] = useState<'repo' | 'local'>('repo');
  const [workspaceDisplayName, setWorkspaceDisplayName] = useState('');
  const [workspaceProvider, setWorkspaceProvider] = useState('github');

  const [documents, setDocuments] = useState<Record<string, DocumentState>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTabPath, setActiveTabPath] = useState('');

  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisOutput, setAnalysisOutput] = useState('');

  const [error, setError] = useState('');
  const [problems, setProblems] = useState<PanelProblem[]>([]);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusPayload | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const [terminalSessions, setTerminalSessions] = useState<Record<string, TerminalClientSession>>({});
  const [terminalOrder, setTerminalOrder] = useState<string[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState('');

  const [sidebarState, setSidebarState] = useState<SidebarState>({
    visible: true,
    width: 256,
    activeView: 'explorer',
  });

  const [panelState, setPanelState] = useState<PanelState>({
    visible: true,
    activeTab: 'problems',
    height: 220,
  });

  const [quickOpen, setQuickOpen] = useState<QuickOpenState>({
    open: false,
    query: '',
    selectedIndex: 0,
  });

  const [commandPalette, setCommandPalette] = useState<CommandPaletteState>({
    open: false,
    query: '',
    selectedIndex: 0,
  });

  const [openTopMenu, setOpenTopMenu] = useState<TopMenuId | null>(null);

  const [visualizationTrigger, setVisualizationTrigger] = useState<{
    type: 'flowchart' | 'mindmap' | null;
    timestamp?: number;
  }>({ type: null });

  const terminalEventSourcesRef = useRef<Record<string, EventSource>>({});
  const workspaceSessionIdRef = useRef('');
  const workspaceInitAttemptRef = useRef<string | null>(null);
  const quickOpenInputRef = useRef<HTMLInputElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const topMenuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    workspaceSessionIdRef.current = workspaceSessionId;
  }, [workspaceSessionId]);

  const appendOutput = useCallback((line: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setOutputLines((previous) => [...previous, `[${timestamp}] ${line}`].slice(-600));
  }, []);

  const appendDebug = useCallback((line: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLines((previous) => [...previous, `[${timestamp}] ${line}`].slice(-600));
  }, []);

  const pushProblem = useCallback(
    (problem: Omit<PanelProblem, 'id'>) => {
      setProblems((previous) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...problem,
        },
        ...previous,
      ].slice(0, 50));

      setPanelState((previous) => {
        if (previous.visible && previous.activeTab === 'problems') {
          return previous;
        }
        return { ...previous, visible: true, activeTab: 'problems' };
      });
    },
    []
  );

  const clearProblems = useCallback(() => {
    setProblems([]);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('codemind.layout');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        sidebarWidth?: number;
        sidebarVisible?: boolean;
        panelHeight?: number;
        panelVisible?: boolean;
      };

      setSidebarState((previous) => ({
        ...previous,
        width: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : previous.width,
        visible: typeof parsed.sidebarVisible === 'boolean' ? parsed.sidebarVisible : previous.visible,
      }));

      setPanelState((previous) => ({
        ...previous,
        height: typeof parsed.panelHeight === 'number' ? parsed.panelHeight : previous.height,
        visible: typeof parsed.panelVisible === 'boolean' ? parsed.panelVisible : previous.visible,
      }));
    } catch {
      // ignore malformed persisted layout state
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'codemind.layout',
      JSON.stringify({
        sidebarWidth: sidebarState.width,
        sidebarVisible: sidebarState.visible,
        panelHeight: panelState.height,
        panelVisible: panelState.visible,
      })
    );
  }, [panelState.height, panelState.visible, sidebarState.visible, sidebarState.width]);

  const allFilePaths = useMemo(() => flattenFilePaths(workspaceTree), [workspaceTree]);

  const quickOpenResults = useMemo(() => {
    const query = quickOpen.query.trim();
    const candidates = query.length > 0
      ? allFilePaths.filter((path) => fuzzyPathMatch(path, query))
      : allFilePaths;

    return candidates.slice(0, 100);
  }, [allFilePaths, quickOpen.query]);

  const activeDocument = activeTabPath ? documents[activeTabPath] : undefined;
  const activeTerminalSession = activeTerminalId ? terminalSessions[activeTerminalId] : undefined;

  const selectedFileNode = useMemo(() => {
    if (!activeTabPath) return null;
    return findNodeById(workspaceTree, activeTabPath);
  }, [activeTabPath, workspaceTree]);

  const tabs = useMemo<EditorTab[]>(
    () =>
      openTabs.map((path) => {
        const document = documents[path];
        return {
          id: path,
          name: document?.name || path.split('/').pop() || path,
          language: document?.language,
          isDirty: document?.isDirty,
        };
      }),
    [documents, openTabs]
  );

  const loadWorkspaceTree = useCallback(async (sessionId: string) => {
    const payload = await requestJson<WorkspaceTreePayload>(
      `${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/tree`
    );

    setWorkspaceTree(payload.tree || []);
    setExpandedDirs((previous) => {
      if (Object.keys(previous).length > 0) {
        return previous;
      }
      const expanded: Record<string, boolean> = {};
      for (const node of payload.tree || []) {
        if (node.type === 'directory') {
          expanded[node.id] = true;
        }
      }
      return expanded;
    });
  }, []);

  const loadWorkspaceMeta = useCallback(async (sessionId: string) => {
    const payload = await requestJson<WorkspaceMetaPayload>(
      `${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/meta`
    );

    setWorkspaceKind(payload.kind || 'repo');
    setWorkspaceDisplayName(payload.displayName || '');
    setWorkspaceProvider(payload.provider || 'github');
    setWorkspaceBranch(payload.branch || '');
    return payload;
  }, []);

  const refreshGitStatus = useCallback(
    async (sessionIdOverride?: string) => {
      const sessionId = sessionIdOverride || workspaceSessionIdRef.current;
      if (!sessionId) return;

      const status = await requestJson<GitStatusPayload>(
        `${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/status`
      );

      setGitStatus(status);
      setWorkspaceBranch((previous) => status.branch || previous || 'main');
    },
    []
  );

  const openWorkspace = useCallback(async () => {
    setIsWorkspaceLoading(true);
    setError('');
    clearProblems();

    try {
      if (forcedSessionId) {
        setWorkspaceSessionId(forcedSessionId);
        const meta = await loadWorkspaceMeta(forcedSessionId);
        appendOutput(`Workspace ready: ${meta.rootPath}`);

        await Promise.all([
          loadWorkspaceTree(forcedSessionId),
          refreshGitStatus(forcedSessionId),
        ]);
        return;
      }

      if (!owner || !repo) {
        throw new Error('Missing repository context for workspace open.');
      }

      const token = localStorage.getItem('github_token');
      if (!token) {
        router.push('/');
        return;
      }

      const payload = await requestJson<WorkspaceOpenPayload>(`${API_BASE_URL}/api/workspace/open-repo`, {
        method: 'POST',
        body: JSON.stringify({ owner, repo, token }),
      });

      setWorkspaceSessionId(payload.sessionId);
      setWorkspaceKind(payload.kind || 'repo');
      setWorkspaceProvider(payload.provider || 'github');
      setWorkspaceDisplayName(payload.displayName || `${owner}/${repo}`);
      setWorkspaceBranch(payload.branch || 'main');
      appendOutput(`Workspace ready: ${payload.rootPath}`);

      await Promise.all([
        loadWorkspaceTree(payload.sessionId),
        refreshGitStatus(payload.sessionId),
      ]);
    } catch (workspaceError) {
      const status = getErrorStatus(workspaceError);
      const message = status === 404
        ? `Backend route ${API_BASE_URL}/api/workspace/open-repo returned 404. Restart the backend on port 4000 with the latest server code.`
        : getErrorMessage(workspaceError, 'Failed to open workspace');
      setError(message);
      pushProblem({
        severity: 'error',
        source: 'workspace',
        message,
      });
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, [
    appendOutput,
    clearProblems,
    forcedSessionId,
    loadWorkspaceMeta,
    loadWorkspaceTree,
    owner,
    pushProblem,
    refreshGitStatus,
    repo,
    router,
  ]);

  useEffect(() => {
    const workspaceKey = forcedSessionId ? `session:${forcedSessionId}` : `${owner}/${repo}`;
    if (workspaceInitAttemptRef.current === workspaceKey) {
      return;
    }
    workspaceInitAttemptRef.current = workspaceKey;
    void openWorkspace();
  }, [forcedSessionId, openWorkspace, owner, repo]);

  useEffect(() => {
    const eventSources = terminalEventSourcesRef.current;

    return () => {
      const terminalIds = Object.keys(eventSources);
      for (const terminalId of terminalIds) {
        eventSources[terminalId].close();
        delete eventSources[terminalId];
        void fetch(`${API_BASE_URL}/api/terminal/${encodeURIComponent(terminalId)}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }

      const currentWorkspaceId = workspaceSessionIdRef.current;
      if (currentWorkspaceId) {
        void fetch(`${API_BASE_URL}/api/workspace/${encodeURIComponent(currentWorkspaceId)}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }
    };
  }, []);

  const ensurePathExpanded = useCallback((filePath: string) => {
    const pathSegments = normalizePath(filePath).split('/');

    setExpandedDirs((previous) => {
      const next = { ...previous };
      for (let i = 1; i < pathSegments.length; i += 1) {
        const directoryPath = pathSegments.slice(0, i).join('/');
        next[directoryPath] = true;
      }
      return next;
    });
  }, []);

  const openDocument = useCallback(
    async (path: string) => {
      const normalizedPath = normalizePath(path);
      if (!normalizedPath || !workspaceSessionId) {
        return;
      }

      setError('');
      ensurePathExpanded(normalizedPath);

      setOpenTabs((previous) => (previous.includes(normalizedPath) ? previous : [...previous, normalizedPath]));
      setActiveTabPath(normalizedPath);

      const existing = documents[normalizedPath];
      if (existing && !existing.isLoading) {
        return;
      }

      const fileName = normalizedPath.split('/').pop() || normalizedPath;
      setDocuments((previous) => ({
        ...previous,
        [normalizedPath]: {
          path: normalizedPath,
          name: fileName,
          language: getLanguage(fileName),
          content: previous[normalizedPath]?.content || '',
          savedContent: previous[normalizedPath]?.savedContent || '',
          isDirty: previous[normalizedPath]?.isDirty || false,
          isLoading: true,
        },
      }));

      setIsFileLoading(true);

      try {
        const payload = await requestJson<WorkspaceFilePayload>(
          `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/file?path=${encodeURIComponent(
            normalizedPath
          )}`
        );

        setDocuments((previous) => ({
          ...previous,
          [normalizedPath]: {
            path: normalizedPath,
            name: fileName,
            language: getLanguage(fileName),
            content: payload.content,
            savedContent: payload.content,
            isDirty: false,
            isLoading: false,
          },
        }));

        appendOutput(`Opened ${normalizedPath}`);
      } catch (fileError) {
        const message = getErrorMessage(fileError, `Failed to open ${normalizedPath}`);
        setError(message);
        pushProblem({
          severity: 'error',
          source: 'file',
          path: normalizedPath,
          message,
        });

        setDocuments((previous) => ({
          ...previous,
          [normalizedPath]: {
            path: normalizedPath,
            name: fileName,
            language: getLanguage(fileName),
            content: `// ${message}`,
            savedContent: `// ${message}`,
            isDirty: false,
            isLoading: false,
          },
        }));
      } finally {
        setIsFileLoading(false);
      }
    },
    [appendOutput, documents, ensurePathExpanded, pushProblem, workspaceSessionId]
  );

  const saveDocument = useCallback(
    async (pathOverride?: string) => {
      const pathToSave = pathOverride || activeTabPath;
      if (!pathToSave || !workspaceSessionId) {
        return;
      }

      const current = documents[pathToSave];
      if (!current || !current.isDirty) {
        return;
      }

      try {
        await requestJson<{ success: boolean }>(
          `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/file`,
          {
            method: 'PUT',
            body: JSON.stringify({
              path: pathToSave,
              content: current.content,
            }),
          }
        );

        setDocuments((previous) => {
          const document = previous[pathToSave];
          if (!document) return previous;
          return {
            ...previous,
            [pathToSave]: {
              ...document,
              savedContent: document.content,
              isDirty: false,
            },
          };
        });

        appendOutput(`Saved ${pathToSave}`);
        await refreshGitStatus();
      } catch (saveError) {
        const message = getErrorMessage(saveError, `Failed to save ${pathToSave}`);
        setError(message);
        pushProblem({
          severity: 'error',
          source: 'save',
          path: pathToSave,
          message,
        });
      }
    },
    [activeTabPath, appendOutput, documents, pushProblem, refreshGitStatus, workspaceSessionId]
  );

  const saveAllDocuments = useCallback(async () => {
    const dirtyPaths = openTabs.filter((path) => documents[path]?.isDirty);
    for (const path of dirtyPaths) {
      await saveDocument(path);
    }
  }, [documents, openTabs, saveDocument]);

  const closeTab = useCallback(
    (tabPath: string) => {
      const doc = documents[tabPath];
      if (doc?.isDirty) {
        const shouldClose = window.confirm(`Discard unsaved changes in ${doc.name}?`);
        if (!shouldClose) {
          return;
        }
      }

      setOpenTabs((previous) => {
        const next = previous.filter((path) => path !== tabPath);

        if (activeTabPath === tabPath) {
          const closedTabIndex = previous.indexOf(tabPath);
          const fallbackPath = next[closedTabIndex] || next[closedTabIndex - 1] || '';
          setActiveTabPath(fallbackPath);
        }

        return next;
      });
    },
    [activeTabPath, documents]
  );

  const onEditorChange = useCallback(
    (updatedContent: string | undefined) => {
      if (!activeTabPath) return;

      const nextContent = updatedContent ?? '';
      setDocuments((previous) => {
        const current = previous[activeTabPath];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [activeTabPath]: {
            ...current,
            content: nextContent,
            isDirty: nextContent !== current.savedContent,
          },
        };
      });
    },
    [activeTabPath]
  );

  const connectTerminalStream = useCallback(
    (nextTerminalId: string) => {
      const existingStream = terminalEventSourcesRef.current[nextTerminalId];
      if (existingStream) {
        existingStream.close();
      }

      const streamUrl = `${API_BASE_URL}/api/terminal/${encodeURIComponent(nextTerminalId)}/stream`;
      const stream = new EventSource(streamUrl);
      terminalEventSourcesRef.current[nextTerminalId] = stream;

      stream.addEventListener('ready', () => {
        setTerminalSessions((previous) => {
          const existingSession = previous[nextTerminalId];
          if (!existingSession) return previous;
          return {
            ...previous,
            [nextTerminalId]: {
              ...existingSession,
              connected: true,
            },
          };
        });
        appendOutput('Terminal stream connected');
      });

      stream.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data) as TerminalStreamPayload;
          const lines = payload.data.replace(/\r/g, '').split('\n');

          setTerminalSessions((previous) => {
            const existingSession = previous[nextTerminalId];
            if (!existingSession) return previous;
            return {
              ...previous,
              [nextTerminalId]: {
                ...existingSession,
                lines: [...existingSession.lines, ...lines].slice(-1800),
              },
            };
          });

          if (payload.type === 'stderr' || payload.type === 'error') {
            appendDebug(`terminal: ${payload.data}`);
          }

          if (payload.type === 'exit') {
            setTerminalSessions((previous) => {
              const existingSession = previous[nextTerminalId];
              if (!existingSession) return previous;
              return {
                ...previous,
                [nextTerminalId]: {
                  ...existingSession,
                  connected: false,
                },
              };
            });
            appendOutput(payload.data);
          }
        } catch (streamError) {
          appendDebug(getErrorMessage(streamError, 'Terminal stream parse error'));
        }
      });

      stream.onerror = () => {
        setTerminalSessions((previous) => {
          const existingSession = previous[nextTerminalId];
          if (!existingSession) return previous;
          return {
            ...previous,
            [nextTerminalId]: {
              ...existingSession,
              connected: false,
            },
          };
        });
      };
    },
    [appendDebug, appendOutput]
  );

  const ensureTerminalSession = useCallback(async () => {
    if (!workspaceSessionId) {
      return;
    }

    setPanelState((previous) => ({
      ...previous,
      visible: true,
      activeTab: 'terminal',
    }));

    try {
      const payload = await requestJson<TerminalSessionPayload>(`${API_BASE_URL}/api/terminal/session`, {
        method: 'POST',
        body: JSON.stringify({
          workspaceSessionId,
        }),
      });

      setTerminalSessions((previous) => ({
        ...previous,
        [payload.terminalId]: {
          id: payload.terminalId,
          name: payload.name || `Terminal ${Object.keys(previous).length + 1}`,
          connected: true,
          lines: [`# Terminal session started (${payload.shell})`],
          input: '',
        },
      }));
      setTerminalOrder((previous) => (
        previous.includes(payload.terminalId) ? previous : [...previous, payload.terminalId]
      ));
      setActiveTerminalId(payload.terminalId);
      appendOutput('Terminal session started');
      connectTerminalStream(payload.terminalId);
    } catch (terminalError) {
      const message = getErrorMessage(
        terminalError,
        'Failed to start terminal. Ensure TERMINAL_ENABLED=true on the server.'
      );
      setError(message);
      pushProblem({
        severity: 'warning',
        source: 'terminal',
        message,
      });
      appendDebug(message);
    }
  }, [appendDebug, appendOutput, connectTerminalStream, pushProblem, workspaceSessionId]);

  const setActiveTerminalInput = useCallback((nextInput: string) => {
    if (!activeTerminalId) return;
    setTerminalSessions((previous) => {
      const currentSession = previous[activeTerminalId];
      if (!currentSession) return previous;
      return {
        ...previous,
        [activeTerminalId]: {
          ...currentSession,
          input: nextInput,
        },
      };
    });
  }, [activeTerminalId]);

  const closeTerminalSession = useCallback(async (terminalSessionId: string) => {
    const stream = terminalEventSourcesRef.current[terminalSessionId];
    if (stream) {
      stream.close();
      delete terminalEventSourcesRef.current[terminalSessionId];
    }

    await fetch(`${API_BASE_URL}/api/terminal/${encodeURIComponent(terminalSessionId)}`, {
      method: 'DELETE',
    }).catch(() => undefined);

    setTerminalSessions((previous) => {
      const next = { ...previous };
      delete next[terminalSessionId];
      return next;
    });
    setTerminalOrder((previous) => {
      const next = previous.filter((id) => id !== terminalSessionId);
      if (activeTerminalId === terminalSessionId) {
        setActiveTerminalId(next[next.length - 1] || '');
      }
      return next;
    });
  }, [activeTerminalId]);

  const sendTerminalInput = useCallback(async () => {
    const command = activeTerminalSession?.input || '';
    if (!command.trim() || !activeTerminalId) {
      return;
    }

    try {
      await requestJson<{ success: boolean }>(
        `${API_BASE_URL}/api/terminal/${encodeURIComponent(activeTerminalId)}/input`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: `${command}\n`,
          }),
        }
      );

      setTerminalSessions((previous) => {
        const currentSession = previous[activeTerminalId];
        if (!currentSession) return previous;
        return {
          ...previous,
          [activeTerminalId]: {
            ...currentSession,
            input: '',
          },
        };
      });
    } catch (terminalError) {
      const message = getErrorMessage(terminalError, 'Failed to write to terminal');
      setError(message);
      pushProblem({
        severity: 'error',
        source: 'terminal',
        message,
      });
      appendDebug(message);
    }
  }, [activeTerminalId, activeTerminalSession?.input, appendDebug, pushProblem]);

  useEffect(() => {
    if (!workspaceSessionId) return;
    void requestJson<{ terminals: Array<{ terminalId: string; name: string; isClosed: boolean }> }>(
      `${API_BASE_URL}/api/terminal/workspace/${encodeURIComponent(workspaceSessionId)}`
    )
      .then((payload) => {
        const terminals = payload.terminals || [];
        setTerminalSessions((previous) => {
          const next = { ...previous };
          for (const terminal of terminals) {
            if (next[terminal.terminalId]) continue;
            next[terminal.terminalId] = {
              id: terminal.terminalId,
              name: terminal.name || `Terminal ${Object.keys(next).length + 1}`,
              connected: !terminal.isClosed,
              lines: [],
              input: '',
            };
            connectTerminalStream(terminal.terminalId);
          }
          return next;
        });
        setTerminalOrder((previous) => {
          const incomingOrder = terminals.map((terminal) => terminal.terminalId);
          const merged = [...previous];
          for (const terminalId of incomingOrder) {
            if (!merged.includes(terminalId)) {
              merged.push(terminalId);
            }
          }
          return merged;
        });
        if (!activeTerminalId && terminals[0]?.terminalId) {
          setActiveTerminalId(terminals[0].terminalId);
        }
      })
      .catch(() => undefined);
  }, [activeTerminalId, connectTerminalStream, workspaceSessionId]);

  const runSearch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (!workspaceSessionId || !normalizedQuery) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setError('');

      try {
        const payload = await requestJson<WorkspaceSearchPayload>(
          `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/search`,
          {
            method: 'POST',
            body: JSON.stringify({
              query: normalizedQuery,
              caseSensitive: false,
              regex: false,
            }),
          }
        );

        setSearchResults(payload.matches || []);
        appendOutput(`Search "${normalizedQuery}" returned ${payload.total} matches`);
      } catch (searchError) {
        const message = getErrorMessage(searchError, 'Search failed');
        setError(message);
        pushProblem({
          severity: 'error',
          source: 'search',
          message,
        });
      } finally {
        setIsSearching(false);
      }
    },
    [appendOutput, pushProblem, workspaceSessionId]
  );

  const stageFiles = useCallback(
    async (paths: string[]) => {
      if (!workspaceSessionId) return;
      await requestJson<{ success: boolean }>(
        `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/stage`,
        {
          method: 'POST',
          body: JSON.stringify({ paths }),
        }
      );
    },
    [workspaceSessionId]
  );

  const stageAll = useCallback(async () => {
    if (!workspaceSessionId) return;

    setGitBusy(true);
    try {
      await stageFiles(['*']);
      appendOutput('Staged all changes');
      await refreshGitStatus();
    } catch (gitError) {
      const message = getErrorMessage(gitError, 'Failed to stage all files');
      setError(message);
      pushProblem({
        severity: 'error',
        source: 'git',
        message,
      });
    } finally {
      setGitBusy(false);
    }
  }, [appendOutput, pushProblem, refreshGitStatus, stageFiles, workspaceSessionId]);

  const stageSingleFile = useCallback(
    async (path: string) => {
      setGitBusy(true);
      try {
        await stageFiles([path]);
        appendOutput(`Staged ${path}`);
        await refreshGitStatus();
      } catch (gitError) {
        const message = getErrorMessage(gitError, `Failed to stage ${path}`);
        setError(message);
        pushProblem({
          severity: 'error',
          source: 'git',
          path,
          message,
        });
      } finally {
        setGitBusy(false);
      }
    },
    [appendOutput, pushProblem, refreshGitStatus, stageFiles]
  );

  const commitChanges = useCallback(async () => {
    if (!workspaceSessionId) return;

    const message = commitMessage.trim();
    if (!message) {
      setError('Commit message is required.');
      pushProblem({
        severity: 'warning',
        source: 'git',
        message: 'Commit message is required.',
      });
      return;
    }

    setGitBusy(true);
    try {
      await requestJson<{ success: boolean; output?: string }>(
        `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/commit`,
        {
          method: 'POST',
          body: JSON.stringify({ message }),
        }
      );

      setCommitMessage('');
      appendOutput(`Committed: ${message}`);
      await refreshGitStatus();
    } catch (gitError) {
      const details = getErrorMessage(gitError, 'Commit failed');
      setError(details);
      pushProblem({
        severity: 'error',
        source: 'git',
        message: details,
      });
    } finally {
      setGitBusy(false);
    }
  }, [appendOutput, commitMessage, pushProblem, refreshGitStatus, workspaceSessionId]);

  const pushChanges = useCallback(async () => {
    if (!workspaceSessionId) return;

    setGitBusy(true);
    try {
      await requestJson<{ success: boolean; output?: string }>(
        `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/push`,
        {
          method: 'POST',
          body: JSON.stringify({
            remote: 'origin',
            branch: workspaceBranch,
          }),
        }
      );

      appendOutput(`Pushed ${workspaceBranch} to origin`);
      await refreshGitStatus();
    } catch (gitError) {
      const details = getErrorMessage(gitError, 'Push failed');
      const hint = /non-fast-forward/i.test(details)
        ? `${details}. Run Sync first, then retry push.`
        : details;

      setError(hint);
      pushProblem({
        severity: 'error',
        source: 'git',
        message: hint,
      });
    } finally {
      setGitBusy(false);
    }
  }, [appendOutput, pushProblem, refreshGitStatus, workspaceBranch, workspaceSessionId]);

  const syncWorkspace = useCallback(async () => {
    if (!workspaceSessionId) return;

    setGitBusy(true);
    try {
      await requestJson<{ success: boolean }>(
        `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/sync`,
        {
          method: 'POST',
          body: JSON.stringify({ mode: 'fetch' }),
        }
      );

      appendOutput('Synced with origin (fetch)');
      await refreshGitStatus();
    } catch (gitError) {
      const details = getErrorMessage(gitError, 'Sync failed');
      setError(details);
      pushProblem({
        severity: 'error',
        source: 'git',
        message: details,
      });
    } finally {
      setGitBusy(false);
    }
  }, [appendOutput, pushProblem, refreshGitStatus, workspaceSessionId]);

  const repositoryIdentity = useMemo(() => {
    const display = (workspaceDisplayName || '').trim();
    if (workspaceKind === 'repo' && display.includes('/')) {
      const [derivedOwner, ...derivedRepoParts] = display.split('/');
      const derivedRepo = derivedRepoParts.join('/');
      if (derivedOwner && derivedRepo) {
        return {
          owner: derivedOwner,
          repo: derivedRepo,
        };
      }
    }

    return {
      owner,
      repo,
    };
  }, [owner, repo, workspaceDisplayName, workspaceKind]);

  const analyzeRepository = useCallback(async () => {
    if (!workspaceSessionId) {
      return;
    }
    if (workspaceKind !== 'repo') {
      setError('AI repository analysis is only available for repository workspaces.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisOutput('');
    setError('');

    try {
      const token = localStorage.getItem('github_token');
      if (!token) {
        router.push('/');
        return;
      }

      const candidatePaths = allFilePaths
        .filter((path) => {
          const extension = getExtension(path);
          return FILE_EXTENSIONS_FOR_ANALYSIS.has(extension) || path.endsWith('README.md');
        })
        .slice(0, 12);

      if (candidatePaths.length === 0) {
        throw new Error('No supported files found for analysis');
      }

      const files = await Promise.all(
        candidatePaths.map(async (path) => {
          const payload = await requestJson<WorkspaceFilePayload>(
            `${API_BASE_URL}/api/workspace/${encodeURIComponent(workspaceSessionId)}/file?path=${encodeURIComponent(
              path
            )}`
          );

          return {
            path,
            name: path.split('/').pop() || path,
            content: payload.content,
            language: getExtension(path) || 'text',
            size: payload.size,
          };
        })
      );

      const response = await fetch(`${API_BASE_URL}/api/ai/analyze-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          owner: repositoryIdentity.owner,
          repo: repositoryIdentity.repo,
          files,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as AiAnalysisPayload;
      if (!payload.success) {
        throw new Error(payload.error || 'Analysis failed');
      }

      setAnalysisOutput(payload.analysis || 'No analysis output received');
      appendOutput(`AI analysis complete for ${candidatePaths.length} files`);
    } catch (analysisError) {
      const message = getErrorMessage(analysisError, 'Repository analysis failed');
      setError(message);
      pushProblem({
        severity: 'error',
        source: 'analysis',
        message,
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [allFilePaths, appendOutput, pushProblem, repositoryIdentity.owner, repositoryIdentity.repo, router, workspaceKind, workspaceSessionId]);

  const openSearchMatch = useCallback(
    async (match: SearchMatch) => {
      await openDocument(match.path);
      setSidebarState((previous) => ({ ...previous, activeView: 'explorer', visible: true }));
      appendOutput(`Opened ${match.path}:${match.line}:${match.column}`);
    },
    [appendOutput, openDocument]
  );

  const runQuickOpenSelection = useCallback(async () => {
    const selectedPath = quickOpenResults[quickOpen.selectedIndex];
    if (!selectedPath) return;

    await openDocument(selectedPath);
    setQuickOpen({ open: false, query: '', selectedIndex: 0 });
  }, [openDocument, quickOpen.selectedIndex, quickOpenResults]);

  const setSidebarView = useCallback((view: SidebarView) => {
    setSidebarState((previous) => ({
      ...previous,
      visible: true,
      activeView: view,
    }));
  }, []);

  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'save-active',
        label: 'File: Save',
        keywords: ['save', 'file'],
        run: () => saveDocument(),
      },
      {
        id: 'save-all',
        label: 'File: Save All',
        keywords: ['save', 'all'],
        run: () => saveAllDocuments(),
      },
      {
        id: 'quick-open',
        label: 'Go to File: Quick Open',
        keywords: ['quick', 'open', 'file'],
        run: () => {
          setQuickOpen({ open: true, query: '', selectedIndex: 0 });
          setCommandPalette({ open: false, query: '', selectedIndex: 0 });
        },
      },
      {
        id: 'toggle-sidebar',
        label: 'View: Toggle Primary Side Bar',
        keywords: ['toggle', 'sidebar'],
        run: () => setSidebarState((previous) => ({ ...previous, visible: !previous.visible })),
      },
      {
        id: 'toggle-panel',
        label: 'View: Toggle Panel',
        keywords: ['toggle', 'panel'],
        run: () => setPanelState((previous) => ({ ...previous, visible: !previous.visible })),
      },
      {
        id: 'open-terminal',
        label: 'Terminal: New Terminal',
        keywords: ['terminal', 'shell'],
        run: () => ensureTerminalSession(),
      },
      {
        id: 'explorer-view',
        label: 'View: Show Explorer',
        keywords: ['explorer', 'sidebar'],
        run: () => setSidebarView('explorer'),
      },
      {
        id: 'search-view',
        label: 'View: Show Search',
        keywords: ['search', 'sidebar'],
        run: () => setSidebarView('search'),
      },
      {
        id: 'stage-all',
        label: 'Source Control: Stage All',
        keywords: ['git', 'stage'],
        run: () => stageAll(),
      },
      {
        id: 'commit',
        label: 'Source Control: Commit',
        keywords: ['git', 'commit'],
        run: () => commitChanges(),
      },
      {
        id: 'push',
        label: 'Source Control: Push',
        keywords: ['git', 'push'],
        run: () => pushChanges(),
      },
      {
        id: 'analyze-repo',
        label: 'AI: Run Repository Analysis',
        keywords: ['ai', 'analysis', 'repository'],
        run: () => analyzeRepository(),
      },
    ],
    [
      analyzeRepository,
      commitChanges,
      ensureTerminalSession,
      pushChanges,
      saveAllDocuments,
      saveDocument,
      setSidebarView,
      stageAll,
    ]
  );

  const filteredCommandActions = useMemo(() => {
    const query = commandPalette.query.trim().toLowerCase();
    if (!query) return commandActions;

    return commandActions.filter((action) => {
      if (action.label.toLowerCase().includes(query)) return true;
      return action.keywords.some((keyword) => keyword.includes(query));
    });
  }, [commandActions, commandPalette.query]);

  const topMenuSections = useMemo<TopMenuSection[]>(() => [
    {
      id: 'file',
      label: 'File',
      actions: [
        {
          id: 'file-save',
          label: 'Save',
          shortcut: 'Ctrl+S',
          run: () => {
            void saveDocument();
          },
        },
        {
          id: 'file-save-all',
          label: 'Save All',
          shortcut: 'Ctrl+Shift+S',
          run: () => {
            void saveAllDocuments();
          },
        },
        {
          id: 'file-quick-open',
          label: 'Quick Open',
          shortcut: 'Ctrl+P',
          run: () => {
            setQuickOpen({ open: true, query: '', selectedIndex: 0 });
            setCommandPalette({ open: false, query: '', selectedIndex: 0 });
          },
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      actions: [
        {
          id: 'edit-command-palette',
          label: 'Command Palette',
          shortcut: 'Ctrl+Shift+P',
          run: () => {
            setCommandPalette({ open: true, query: '', selectedIndex: 0 });
            setQuickOpen({ open: false, query: '', selectedIndex: 0 });
          },
        },
        {
          id: 'edit-search',
          label: 'Search in Files',
          shortcut: 'Ctrl+Shift+F',
          run: () => {
            setSidebarView('search');
          },
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      actions: [
        {
          id: 'view-explorer',
          label: 'Explorer',
          shortcut: 'Ctrl+Shift+E',
          run: () => {
            setSidebarView('explorer');
          },
        },
        {
          id: 'view-source-control',
          label: 'Source Control',
          run: () => {
            setSidebarView('git');
          },
        },
        {
          id: 'view-toggle-sidebar',
          label: 'Toggle Side Bar',
          shortcut: 'Ctrl+B',
          run: () => {
            setSidebarState((previous) => ({ ...previous, visible: !previous.visible }));
          },
        },
        {
          id: 'view-toggle-panel',
          label: 'Toggle Panel',
          shortcut: 'Ctrl+J',
          run: () => {
            setPanelState((previous) => ({ ...previous, visible: !previous.visible }));
          },
        },
      ],
    },
    {
      id: 'terminal',
      label: 'Terminal',
      actions: [
        {
          id: 'terminal-new',
          label: 'New Terminal',
          shortcut: 'Ctrl+`',
          run: () => {
            void ensureTerminalSession();
          },
        },
        {
          id: 'terminal-focus',
          label: 'Focus Terminal Panel',
          run: () => {
            setPanelState((previous) => ({ ...previous, visible: true, activeTab: 'terminal' }));
          },
        },
        {
          id: 'terminal-close-active',
          label: 'Close Active Terminal',
          disabled: !activeTerminalId,
          run: () => {
            if (!activeTerminalId) return;
            void closeTerminalSession(activeTerminalId);
          },
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      actions: [
        {
          id: 'help-ai-analysis',
          label: 'Run AI Analysis',
          disabled: workspaceKind !== 'repo' || isAnalyzing || allFilePaths.length === 0,
          run: () => {
            void analyzeRepository();
          },
        },
        {
          id: 'help-shortcuts',
          label: 'Keyboard Shortcuts',
          run: () => {
            appendOutput('Shortcuts: Ctrl+P Quick Open, Ctrl+Shift+P Command Palette, Ctrl+` Terminal.');
          },
        },
        {
          id: 'help-docs',
          label: 'VS Code Shortcuts Reference',
          run: () => {
            window.open('https://code.visualstudio.com/docs/getstarted/keybindings', '_blank', 'noopener,noreferrer');
          },
        },
      ],
    },
  ], [
    activeTerminalId,
    allFilePaths.length,
    analyzeRepository,
    appendOutput,
    closeTerminalSession,
    ensureTerminalSession,
    isAnalyzing,
    saveAllDocuments,
    saveDocument,
    setSidebarView,
    workspaceKind,
  ]);

  const executeCommand = useCallback(
    async (action: CommandAction | undefined) => {
      if (!action) return;
      await action.run();
      setCommandPalette({ open: false, query: '', selectedIndex: 0 });
    },
    []
  );

  const handleGenerateVisualization = useCallback(
    async (node: FileNode, type: 'flowchart' | 'mindmap') => {
      if (node.type !== 'file') return;
      await openDocument(node.id);
      setVisualizationTrigger({ type, timestamp: Date.now() });
    },
    [openDocument]
  );

  useEffect(() => {
    if (quickOpen.open) {
      const timeout = setTimeout(() => quickOpenInputRef.current?.focus(), 10);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [quickOpen.open]);

  useEffect(() => {
    if (commandPalette.open) {
      const timeout = setTimeout(() => commandPaletteInputRef.current?.focus(), 10);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [commandPalette.open]);

  useEffect(() => {
    if (!openTopMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!topMenuContainerRef.current) return;
      if (!topMenuContainerRef.current.contains(event.target as Node)) {
        setOpenTopMenu(null);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenTopMenu(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [openTopMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if (quickOpen.open) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setQuickOpen({ open: false, query: '', selectedIndex: 0 });
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setQuickOpen((previous) => ({
            ...previous,
            selectedIndex: Math.min(previous.selectedIndex + 1, Math.max(0, quickOpenResults.length - 1)),
          }));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setQuickOpen((previous) => ({
            ...previous,
            selectedIndex: Math.max(previous.selectedIndex - 1, 0),
          }));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          void runQuickOpenSelection();
          return;
        }
      }

      if (commandPalette.open) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setCommandPalette({ open: false, query: '', selectedIndex: 0 });
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCommandPalette((previous) => ({
            ...previous,
            selectedIndex: Math.min(previous.selectedIndex + 1, Math.max(0, filteredCommandActions.length - 1)),
          }));
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCommandPalette((previous) => ({
            ...previous,
            selectedIndex: Math.max(previous.selectedIndex - 1, 0),
          }));
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          void executeCommand(filteredCommandActions[commandPalette.selectedIndex]);
          return;
        }
      }

      if (!mod) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          void saveAllDocuments();
        } else {
          void saveDocument();
        }
        return;
      }

      if (key === 'p') {
        event.preventDefault();

        if (event.shiftKey) {
          setCommandPalette({ open: true, query: '', selectedIndex: 0 });
          setQuickOpen({ open: false, query: '', selectedIndex: 0 });
        } else {
          setQuickOpen({ open: true, query: '', selectedIndex: 0 });
          setCommandPalette({ open: false, query: '', selectedIndex: 0 });
        }
        return;
      }

      if (key === 'b') {
        event.preventDefault();
        setSidebarState((previous) => ({ ...previous, visible: !previous.visible }));
        return;
      }

      if (key === 'j') {
        event.preventDefault();
        setPanelState((previous) => ({ ...previous, visible: !previous.visible }));
        return;
      }

      if (key === '`') {
        event.preventDefault();
        void ensureTerminalSession();
        return;
      }

      if (key === 'w') {
        event.preventDefault();
        if (activeTabPath) {
          closeTab(activeTabPath);
        }
        return;
      }

      if (event.shiftKey && key === 'e') {
        event.preventDefault();
        setSidebarView('explorer');
        return;
      }

      if (event.shiftKey && key === 'f') {
        event.preventDefault();
        setSidebarView('search');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTabPath,
    closeTab,
    commandPalette.open,
    commandPalette.selectedIndex,
    ensureTerminalSession,
    executeCommand,
    filteredCommandActions,
    quickOpen.open,
    quickOpenResults.length,
    runQuickOpenSelection,
    saveAllDocuments,
    saveDocument,
    setSidebarView,
  ]);

  const fileBreadcrumb = activeTabPath ? activeTabPath.split('/') : [];
  const isSessionProxyRoute = owner === 'workspace' && repo === 'session';
  const workspacePrimaryLabel =
    workspaceKind === 'local'
      ? 'Local'
      : isSessionProxyRoute
      ? 'Repository'
      : owner || 'Repository';
  const workspaceSecondaryLabel =
    workspaceKind === 'local'
      ? workspaceDisplayName || 'Workspace'
      : workspaceDisplayName || (isSessionProxyRoute ? 'Workspace' : repo || 'Repository');
  const workspaceProviderLabel = workspaceKind === 'local'
    ? 'local'
    : workspaceProvider || 'github';
  const terminalTabs = useMemo(
    () => terminalOrder
      .map((terminalId) => {
        const session = terminalSessions[terminalId];
        if (!session) return null;
        return {
          id: session.id,
          name: session.name,
          connected: session.connected,
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; connected: boolean }>,
    [terminalOrder, terminalSessions]
  );

  const headerContent = (
    <header className="border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-md relative z-20">
      <div className="h-9 px-4 border-b border-[#30363d] flex items-center justify-between gap-3">
        <div ref={topMenuContainerRef} className="flex items-center gap-5">
          <span className="text-[12px] font-semibold tracking-[0.14em] text-slate-300">CODEMIND.AI</span>

          <div className="flex items-center gap-0.5">
            {topMenuSections.map((section) => (
              <div key={section.id} className="relative">
                <button
                  onClick={() =>
                    setOpenTopMenu((previous) => (previous === section.id ? null : section.id))
                  }
                  className={`h-7 px-2 rounded text-[12px] transition-colors ${
                    openTopMenu === section.id
                      ? 'bg-white/10 text-slate-100'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                  }`}
                >
                  {section.label}
                </button>

                {openTopMenu === section.id && (
                  <div className="absolute left-0 top-8 min-w-[230px] rounded-md border border-[#30363d] bg-[#0b111a] shadow-xl shadow-black/40 py-1 z-30">
                    {section.actions.map((action) => (
                      <button
                        key={action.id}
                        disabled={action.disabled}
                        onClick={() => {
                          setOpenTopMenu(null);
                          action.run();
                        }}
                        className="w-full px-3 h-8 flex items-center justify-between text-left text-[12px] text-slate-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>{action.label}</span>
                        {action.shortcut && (
                          <span className="text-[10px] text-slate-500">{action.shortcut}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setCommandPalette({ open: true, query: '', selectedIndex: 0 })}
          className="h-7 min-w-[320px] max-w-[420px] px-3 rounded border border-[#30363d] bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 flex items-center gap-2 text-[12px]"
          title="Command Palette (Ctrl+Shift+P)"
        >
          <Search size={14} />
          <span className="truncate">Search files, settings, or commands</span>
          <span className="ml-auto text-[10px] text-slate-500">Ctrl+K</span>
        </button>
      </div>

      <div className="h-12 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs min-w-0 text-slate-500">
          <span className="truncate hover:text-slate-300 cursor-pointer transition-colors">{workspacePrimaryLabel}</span>
          <span className="text-slate-700">/</span>
          <span className="truncate hover:text-slate-300 cursor-pointer transition-colors">{workspaceSecondaryLabel}</span>
          <span className="text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded border border-[#30363d] text-slate-500">
            {workspaceProviderLabel}
          </span>
          {fileBreadcrumb.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-2 min-w-0">
              <ChevronRight size={10} className="text-slate-600 shrink-0" />
              <span
                className={
                  index === fileBreadcrumb.length - 1
                    ? 'text-slate-200 truncate'
                    : 'text-slate-500 truncate'
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void analyzeRepository()}
            disabled={workspaceKind !== 'repo' || isAnalyzing || allFilePaths.length === 0}
            className="h-8 px-3 rounded border border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#58a6ff] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3b82f6]/20 transition-all"
          >
            {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {isAnalyzing ? 'Analyzing...' : 'Run AI Analysis'}
          </button>

          <button
            onClick={() => void saveDocument()}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400"
            title="Save (Cmd/Ctrl+S)"
          >
            <Save size={18} />
          </button>

          <button
            onClick={() => setQuickOpen({ open: true, query: '', selectedIndex: 0 })}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400"
            title="Quick Open (Cmd/Ctrl+P)"
          >
            <Search size={18} />
          </button>

          <button
            onClick={() => setSidebarState((previous) => ({ ...previous, visible: !previous.visible }))}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400"
            title="Toggle Sidebar (Cmd/Ctrl+B)"
          >
            <PanelLeft size={18} />
          </button>

          <button
            onClick={() => void ensureTerminalSession()}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400"
            title="New Terminal"
          >
            <TerminalSquare size={18} />
          </button>

          <button
            onClick={() => setCommandPalette({ open: true, query: '', selectedIndex: 0 })}
            className="p-1.5 hover:bg-white/5 rounded text-slate-400"
            title="Command Palette (Cmd/Ctrl+Shift+P)"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>
    </header>
  );

  if (isWorkspaceLoading) {
    return (
      <div className="flex items-center justify-center h-screen cm-shell">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[var(--cm-primary)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--cm-text-muted)]">Opening workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <IDELayout
        files={workspaceTree}
        expandedDirs={expandedDirs}
        onFileClick={(file) => {
          if (file.type === 'directory') {
            setExpandedDirs((previous) => ({
              ...previous,
              [file.id]: !previous[file.id],
            }));
            return;
          }
          void openDocument(file.id);
        }}
        onDirToggle={(path) => {
          setExpandedDirs((previous) => ({
            ...previous,
            [path]: !previous[path],
          }));
        }}
        selectedFile={selectedFileNode}
        tabs={tabs}
        headerContent={headerContent}
        activeTabId={activeTabPath}
        onTabClick={(tabId) => setActiveTabPath(tabId)}
        onTabClose={closeTab}
        onGenerateVisualization={(node, type) => void handleGenerateVisualization(node, type)}
        selectedFileContent={activeDocument?.content || null}
        sidebarState={sidebarState}
        onSidebarStateChange={setSidebarState}
        onSidebarResize={(width) =>
          setSidebarState((previous) => ({
            ...previous,
            width,
          }))
        }
        panelState={panelState}
        onPanelStateChange={setPanelState}
        onPanelResize={(height) =>
          setPanelState((previous) => ({
            ...previous,
            height,
          }))
        }
        searchViewProps={{
          query: searchQuery,
          isSearching,
          results: searchResults,
          onQueryChange: (value) => {
            setSearchQuery(value);
            setSearchResults([]);
          },
          onSearch: (query) => void runSearch(query),
          onSelectResult: (result) => void openSearchMatch(result),
        }}
        gitViewProps={{
          status: gitStatus,
          commitMessage,
          isBusy: gitBusy,
          onCommitMessageChange: setCommitMessage,
          onStageAll: () => void stageAll(),
          onStageFile: (path) => void stageSingleFile(path),
          onCommit: () => void commitChanges(),
          onPush: () => void pushChanges(),
          onSync: () => void syncWorkspace(),
        }}
        extensionsViewProps={{
          workspaceSessionId,
        }}
        panelContent={{
          problems,
          outputLines,
          debugLines,
          terminalLines: activeTerminalSession?.lines || [],
          terminalConnected: activeTerminalSession?.connected || false,
          terminalInput: activeTerminalSession?.input || '',
          onTerminalInputChange: setActiveTerminalInput,
          onTerminalSubmit: () => void sendTerminalInput(),
          terminalTabs,
          activeTerminalId,
          onTerminalTabSelect: setActiveTerminalId,
          onTerminalCreate: () => void ensureTerminalSession(),
          onTerminalClose: (terminalId) => {
            void closeTerminalSession(terminalId);
          },
        }}
        statusBarProps={{
          language: activeDocument?.language || 'plaintext',
          branch: workspaceBranch,
          aiStatus: isAnalyzing ? 'processing' : 'ready',
          workspaceKind,
          terminalCount: terminalOrder.length,
          extensionHostStatus: 'off',
        }}
        analysisPanel={analysisOutput || isAnalyzing ? {
          content: analysisOutput,
          isAnalyzing,
          onClose: () => {
            setAnalysisOutput('');
            setIsAnalyzing(false);
          },
        } : undefined}
      >
        <div className="h-full flex flex-row overflow-hidden">
          <div className="flex-1 flex flex-col border-r border-[#30363d] min-w-0">
            {error && (
              <div className="mx-4 mt-3 p-3 bg-red-500/15 border border-red-400/45 rounded-lg text-red-200 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{error}</span>
                <button
                  onClick={() => setError('')}
                  className="ml-auto h-5 w-5 rounded hover:bg-red-500/20 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {activeDocument ? (
              <CodeEditor
                code={activeDocument.content}
                language={activeDocument.language}
                height="100%"
                onChange={onEditorChange}
                readOnly={false}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 bg-[#0d1117]">
                {isFileLoading ? (
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-[#58a6ff] animate-spin mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">Loading file...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center max-w-md w-full text-center">
                    <div className="mb-8 relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-blue-600 flex items-center justify-center shadow-2xl shadow-[#3b82f6]/20">
                        <Code className="w-9 h-9 text-white" />
                      </div>
                      <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full border-4 border-[#0d1117] flex items-center justify-center">
                        <span className="w-1.5 h-1.5 bg-white rounded-full" />
                      </div>
                    </div>
                    <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">CodeMind</h1>
                    <p className="text-slate-500 text-sm mb-10">
                      Select a file to start editing or use AI to generate new components.
                    </p>

                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="hidden xl:flex w-[400px] flex-shrink-0 bg-[#010409] flex-col border-l border-[#30363d]">
            <MindMapView
              selectedFileContent={activeDocument?.content || null}
              triggerGeneration={visualizationTrigger}
            />
          </aside>
        </div>
      </IDELayout>

      {quickOpen.open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4">
          <div className="w-full max-w-2xl cm-card rounded-xl overflow-hidden border border-[var(--cm-border)]">
            <div className="h-11 px-3 border-b border-[var(--cm-border)] bg-[rgba(2,6,23,0.55)] flex items-center gap-2">
              <Search size={14} className="text-[var(--cm-text-muted)]" />
              <input
                ref={quickOpenInputRef}
                value={quickOpen.query}
                onChange={(event) =>
                  setQuickOpen((previous) => ({
                    ...previous,
                    query: event.target.value,
                    selectedIndex: 0,
                  }))
                }
                placeholder="Type to quickly open files"
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-[var(--cm-text-muted)] focus:outline-none"
              />
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--cm-text-muted)]">Quick Open</span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {quickOpenResults.length === 0 && (
                <div className="text-sm text-[var(--cm-text-muted)] p-4">No matching files.</div>
              )}

              {quickOpenResults.map((path, index) => (
                <button
                  key={path}
                  onClick={() => {
                    setQuickOpen((previous) => ({
                      ...previous,
                      selectedIndex: index,
                    }));
                    void runQuickOpenSelection();
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm cm-mono ${
                    quickOpen.selectedIndex === index
                      ? 'bg-[rgba(14,165,233,0.2)] text-[var(--cm-primary)]'
                      : 'text-[var(--cm-text)] hover:bg-[rgba(148,163,184,0.12)]'
                  }`}
                >
                  {path}
                </button>
              ))}
            </div>

            <div className="h-8 border-t border-[var(--cm-border)] px-3 text-[11px] text-[var(--cm-text-muted)] flex items-center justify-between">
              <span>Enter: open file</span>
              <span>Esc: close</span>
            </div>
          </div>

          <button
            aria-label="Close quick open"
            onClick={() => setQuickOpen({ open: false, query: '', selectedIndex: 0 })}
            className="absolute inset-0 -z-10"
          />
        </div>
      )}

      {commandPalette.open && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4">
          <div className="w-full max-w-2xl cm-card rounded-xl overflow-hidden border border-[var(--cm-border)]">
            <div className="h-11 px-3 border-b border-[var(--cm-border)] bg-[rgba(2,6,23,0.55)] flex items-center gap-2">
              <Command size={14} className="text-[var(--cm-text-muted)]" />
              <input
                ref={commandPaletteInputRef}
                value={commandPalette.query}
                onChange={(event) =>
                  setCommandPalette((previous) => ({
                    ...previous,
                    query: event.target.value,
                    selectedIndex: 0,
                  }))
                }
                placeholder="Type a command"
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-[var(--cm-text-muted)] focus:outline-none"
              />
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--cm-text-muted)]">Command Palette</span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filteredCommandActions.length === 0 && (
                <div className="text-sm text-[var(--cm-text-muted)] p-4">No commands found.</div>
              )}

              {filteredCommandActions.map((action, index) => (
                <button
                  key={action.id}
                  onClick={() => void executeCommand(action)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                    commandPalette.selectedIndex === index
                      ? 'bg-[rgba(14,165,233,0.2)] text-[var(--cm-primary)]'
                      : 'text-[var(--cm-text)] hover:bg-[rgba(148,163,184,0.12)]'
                  }`}
                >
                  <span>{action.label}</span>
                  <Check size={12} className={commandPalette.selectedIndex === index ? 'opacity-90' : 'opacity-0'} />
                </button>
              ))}
            </div>

            <div className="h-8 border-t border-[var(--cm-border)] px-3 text-[11px] text-[var(--cm-text-muted)] flex items-center justify-between">
              <span>Enter: run command</span>
              <span>Esc: close</span>
            </div>
          </div>

          <button
            aria-label="Close command palette"
            onClick={() => setCommandPalette({ open: false, query: '', selectedIndex: 0 })}
            className="absolute inset-0 -z-10"
          />
        </div>
      )}
    </>
  );
}

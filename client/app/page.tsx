'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  ChevronRight,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  Github,
  Loader2,
  Pin,
  Puzzle,
  Search,
  Settings,
  X,
} from '@/lib/icons';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const RECENT_LOCAL_KEY = 'codemind.recentLocalPaths';

type WorkspaceView = 'launcher' | 'repos';
type FolderModalTab = 'browse' | 'manual';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  language: string | null;
  owner: {
    login: string;
  };
}

interface LocalRoot {
  id: string;
  label: string;
  absolutePath: string;
}

interface LocalBrowseEntry {
  name: string;
  type: 'directory' | 'file';
  relativePath: string;
  hasChildren: boolean;
}

interface LocalBrowsePayload {
  rootId: string;
  label: string;
  rootPath: string;
  relativePath: string;
  entries: LocalBrowseEntry[];
}

interface LocalOpenPayload {
  sessionId: string;
  kind: 'local' | 'repo';
  provider: string;
  displayName: string;
  rootPath: string;
  branch: string;
  isGitRepo: boolean;
}

interface LocalPickerPayload {
  supported: boolean;
  canceled: boolean;
  absolutePath: string | null;
  opened?: boolean;
  sessionId?: string;
  kind?: 'local' | 'repo';
  provider?: string;
  displayName?: string;
  rootPath?: string;
  branch?: string;
  isGitRepo?: boolean;
  reason?: string;
}

interface WorkspaceOpenPayload {
  sessionId: string;
  kind?: 'repo' | 'local';
  provider?: string;
  displayName?: string;
  rootPath: string;
  branch: string;
  isGitRepo?: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch {
    throw new Error(
      `Cannot reach backend at ${API_BASE_URL}. Start it with: cd /Users/junedalipatel/code/codemind1/server && npm run dev`
    );
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string; message?: string };
      message = payload.details || payload.error || payload.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function loadRecentLocalPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function saveRecentLocalPath(nextPath: string) {
  const normalizedPath = String(nextPath || '').trim();
  if (!normalizedPath) return;

  const current = loadRecentLocalPaths();
  const next = [normalizedPath, ...current.filter((item) => item !== normalizedPath)].slice(0, 8);
  localStorage.setItem(RECENT_LOCAL_KEY, JSON.stringify(next));
}

function workspaceNameFromPath(absolutePath: string): string {
  const normalized = String(absolutePath || '').trim().replace(/\/+$/, '');
  if (!normalized) return 'workspace';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

export default function HomePage() {
  const router = useRouter();

  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<WorkspaceView>('launcher');

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalTab, setFolderModalTab] = useState<FolderModalTab>('browse');
  const [isOpeningLocal, setIsOpeningLocal] = useState(false);
  const [isPickingLocalFolder, setIsPickingLocalFolder] = useState(false);
  const [localRoots, setLocalRoots] = useState<LocalRoot[]>([]);
  const [selectedRootId, setSelectedRootId] = useState('');
  const [browseRelativePath, setBrowseRelativePath] = useState('');
  const [browseEntries, setBrowseEntries] = useState<LocalBrowseEntry[]>([]);
  const [manualAbsolutePath, setManualAbsolutePath] = useState('');
  const [manualValidationMessage, setManualValidationMessage] = useState('');
  const [recentLocalPaths, setRecentLocalPaths] = useState<string[]>([]);

  const fetchUserRepos = useCallback(async (token: string) => {
    setIsLoadingRepos(true);
    setError('');

    try {
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('github_token');
          setIsAuthenticated(false);
          throw new Error('GitHub token expired. Please sign in again.');
        }
        throw new Error(`Failed to load repositories (${response.status})`);
      }

      const data = (await response.json()) as Repository[];
      setRepos(Array.isArray(data) ? data : []);
    } catch (repoError) {
      setError(getErrorMessage(repoError, 'Failed to load repositories'));
    } finally {
      setIsLoadingRepos(false);
    }
  }, []);

  const loadBrowseEntries = useCallback(async (rootId: string, relativePath: string) => {
    const payload = await requestJson<LocalBrowsePayload>(`${API_BASE_URL}/api/workspace/local-browse`, {
      method: 'POST',
      body: JSON.stringify({
        rootId,
        relativePath,
      }),
    });
    setBrowseRelativePath(payload.relativePath || '');
    setBrowseEntries(payload.entries || []);
  }, []);

  const loadLocalRoots = useCallback(async () => {
    const payload = await requestJson<{ roots: LocalRoot[] }>(`${API_BASE_URL}/api/workspace/local-roots`);
    const roots = payload.roots || [];
    setLocalRoots(roots);

    if (roots.length > 0) {
      const firstRootId = roots[0].id;
      setSelectedRootId(firstRootId);
      await loadBrowseEntries(firstRootId, '');
    } else {
      setSelectedRootId('');
      setBrowseEntries([]);
      setBrowseRelativePath('');
    }
  }, [loadBrowseEntries]);

  useEffect(() => {
    const token = localStorage.getItem('github_token');
    if (token) {
      setIsAuthenticated(true);
      fetchUserRepos(token);
      setRecentLocalPaths(loadRecentLocalPaths());
    }

    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    if (callbackToken) {
      localStorage.setItem('github_token', callbackToken);
      setIsAuthenticated(true);
      fetchUserRepos(callbackToken);
      setRecentLocalPaths(loadRecentLocalPaths());
      window.history.replaceState({}, document.title, '/');
    }
  }, [fetchUserRepos]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    void requestJson<{ roots: LocalRoot[] }>(`${API_BASE_URL}/api/workspace/local-roots`)
      .then((payload) => {
        if (cancelled) return;
        const roots = payload.roots || [];
        setLocalRoots(roots);
        if (roots.length > 0) {
          setSelectedRootId((previous) => previous || roots[0].id);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleGitHubLogin = async () => {
    setIsSigningIn(true);
    setError('');

    try {
      const payload = await requestJson<{ url: string }>(`${API_BASE_URL}/api/github/auth/github-url`);
      if (!payload.url) {
        throw new Error('Missing GitHub OAuth URL');
      }
      window.location.href = payload.url;
    } catch (authError) {
      setError(getErrorMessage(authError, 'Failed to initiate GitHub sign-in'));
      setIsSigningIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('github_token');
    setIsAuthenticated(false);
    setRepos([]);
    setView('launcher');
    setSearchQuery('');
    setError('');
  };

  const handleOpenRepoWorkspace = async (owner: string, repo: string) => {
    const token = localStorage.getItem('github_token');
    if (!token) {
      router.push('/');
      return;
    }

    try {
      setError('');
      const payload = await requestJson<WorkspaceOpenPayload>(`${API_BASE_URL}/api/workspace/open-repo`, {
        method: 'POST',
        body: JSON.stringify({ owner, repo, token }),
      });
      router.push(`/workspace/${encodeURIComponent(payload.sessionId)}`);
    } catch (openError) {
      const details = getErrorMessage(openError, `Failed to open ${owner}/${repo}`);
      setError(details);
      if (details.includes('Cannot reach backend')) {
        setView('launcher');
      }
    }
  };

  const openLocalWorkspaceByRoot = async (rootId: string, relativePath: string) => {
    try {
      setIsOpeningLocal(true);
      setManualValidationMessage('');
      const payload = await requestJson<LocalOpenPayload>(`${API_BASE_URL}/api/workspace/open-local`, {
        method: 'POST',
        body: JSON.stringify({
          rootId,
          relativePath,
        }),
      });

      saveRecentLocalPath(payload.rootPath);
      setRecentLocalPaths(loadRecentLocalPaths());
      setShowFolderModal(false);
      router.push(`/workspace/${encodeURIComponent(payload.sessionId)}`);
    } catch (openError) {
      setError(getErrorMessage(openError, 'Failed to open local workspace'));
    } finally {
      setIsOpeningLocal(false);
    }
  };

  const openLocalWorkspaceByAbsolutePath = async (absolutePath: string) => {
    const normalizedPath = absolutePath.trim();
    if (!normalizedPath) {
      const message = 'Please enter a local folder path.';
      setManualValidationMessage(message);
      setError(message);
      return;
    }

    try {
      setIsOpeningLocal(true);
      setError('');
      const payload = await requestJson<LocalOpenPayload>(`${API_BASE_URL}/api/workspace/open-local`, {
        method: 'POST',
        body: JSON.stringify({
          absolutePath: normalizedPath,
          confirm: true,
        }),
      });

      saveRecentLocalPath(payload.rootPath);
      setRecentLocalPaths(loadRecentLocalPaths());
      setShowFolderModal(false);
      setManualValidationMessage('');
      setError('');
      router.push(`/workspace/${encodeURIComponent(payload.sessionId)}`);
    } catch (openError) {
      const message = getErrorMessage(openError, 'Failed to open local workspace.');
      setManualValidationMessage(message);
      setError(message);
    } finally {
      setIsOpeningLocal(false);
    }
  };

  const handleOpenFolder = async () => {
    setError('');
    setManualValidationMessage('');
    setRecentLocalPaths(loadRecentLocalPaths());
    setIsPickingLocalFolder(true);

    try {
      const picker = await requestJson<LocalPickerPayload>(`${API_BASE_URL}/api/workspace/open-local-picker`, {
        method: 'POST',
      });

      if (picker.canceled) {
        return;
      }

      if (picker.supported && picker.opened && picker.sessionId && picker.rootPath) {
        saveRecentLocalPath(picker.rootPath);
        setRecentLocalPaths(loadRecentLocalPaths());
        setShowFolderModal(false);
        setManualValidationMessage('');
        setError('');
        router.push(`/workspace/${encodeURIComponent(picker.sessionId)}`);
        return;
      }

      await handleOpenFolderModal();
    } catch (pickerError) {
      setError(getErrorMessage(pickerError, 'Could not open native folder picker.'));
      await handleOpenFolderModal();
    } finally {
      setIsPickingLocalFolder(false);
    }
  };

  const handleOpenFolderModal = async () => {
    setShowFolderModal(true);
    setFolderModalTab('browse');
    setManualAbsolutePath('');
    setManualValidationMessage('');
    setError('');
    setRecentLocalPaths(loadRecentLocalPaths());

    try {
      await loadLocalRoots();
    } catch (rootsError) {
      setError(getErrorMessage(rootsError, 'Failed to load local roots'));
    }
  };

  const filteredRepos = useMemo(
    () =>
      repos.filter((repo) => {
        const query = searchQuery.toLowerCase();
        return (
          repo.name.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query) ||
          (repo.description || '').toLowerCase().includes(query)
        );
      }),
    [repos, searchQuery]
  );

  const browseBreadcrumb = browseRelativePath ? browseRelativePath.split('/').filter(Boolean) : [];

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] cm-shell flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-12%] left-[-8%] w-[34vw] h-[34vw] max-w-[380px] max-h-[380px] bg-blue-500/10 rounded-full blur-3xl cm-pulse-soft" />
        <div className="absolute bottom-[-12%] right-[-8%] w-[34vw] h-[34vw] max-w-[380px] max-h-[380px] bg-indigo-500/10 rounded-full blur-3xl cm-pulse-soft" />

        <div className="relative z-10 w-full max-w-[430px] min-h-[500px] cm-card backdrop-blur-xl p-8 rounded-2xl flex flex-col items-center justify-center gap-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 rounded-xl bg-[linear-gradient(145deg,#2f81f7,#5167ff)] shadow-lg shadow-blue-500/20">
                <Brain className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">CodeMind.AI</h1>
            <p className="text-[var(--cm-text-muted)] text-sm px-4">
              Open repositories and local folders in a VS Code-style workspace.
            </p>
          </div>

          <button
            onClick={handleGitHubLogin}
            disabled={isSigningIn}
            className="h-11 px-8 rounded-lg cm-btn-primary text-sm font-semibold flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Github size={18} />
                Sign in with GitHub
              </>
            )}
          </button>

          {error && (
            <div className="w-full p-3 rounded-lg text-xs text-red-200 border border-red-400/40 bg-red-500/10 text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen bg-[#0a0c10] text-slate-300 flex overflow-hidden">
        <aside className="w-12 flex flex-col items-center py-4 border-r border-[#30363d] bg-[#161b22] z-20">
          <div className="mb-8 text-[#3b82f6]">
            <Brain className="w-6 h-6" />
          </div>
          <nav className="flex flex-col gap-6 items-center flex-1">
            <button
              onClick={() => setView('launcher')}
              className={`relative px-3 text-slate-500 transition-colors ${
                view === 'launcher' ? 'text-white' : 'hover:text-white'
              }`}
            >
              {view === 'launcher' && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-[#3b82f6]" />
              )}
              <FolderOpen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setView('repos')}
              className={`relative px-3 text-slate-500 transition-colors ${
                view === 'repos' ? 'text-white' : 'hover:text-white'
              }`}
            >
              {view === 'repos' && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-[#3b82f6]" />
              )}
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => setView('repos')} className="px-3 text-slate-500 hover:text-white transition-colors">
              <FileCode2 className="w-5 h-5" />
            </button>
            <button onClick={() => void handleOpenFolder()} className="px-3 text-slate-500 hover:text-white transition-colors">
              <Download className="w-5 h-5" />
            </button>
            <button className="px-3 text-slate-500 hover:text-white transition-colors">
              <Puzzle className="w-5 h-5" />
            </button>
          </nav>
          <div className="mt-auto flex flex-col gap-6 items-center">
            <button className="px-3 text-slate-500 hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
              JD
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative overflow-y-auto">
          <header className="h-12 border-b border-[#30363d] flex items-center justify-between px-6 bg-[#0a0c10]/70 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-[0.18em]">CodeMind.ai</span>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-medium text-slate-500">
                {view === 'launcher' ? 'Launcher' : 'Repositories'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-xs text-slate-500 hover:text-[#3b82f6] transition-colors">Documentation</button>
              <button
                onClick={handleLogout}
                className="px-3 py-1 bg-[#3b82f6] text-white text-xs font-medium rounded hover:bg-blue-600 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </header>

          <div className="max-w-4xl mx-auto w-full px-8 py-16 flex flex-col gap-12">
            {error && (
              <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
                {error}
              </div>
            )}

            {view === 'launcher' ? (
              <>
                <section className="space-y-2">
                  <h1 className="text-4xl font-light tracking-tight text-white flex items-center gap-2.5">
                    Code<span className="font-semibold text-[#3b82f6]">Mind</span>.ai
                  </h1>
                  <p className="text-slate-400 text-lg">Your intelligent workspace for modern development.</p>
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => void handleOpenFolder()}
                    disabled={isPickingLocalFolder}
                    className="flex flex-col p-6 text-left border border-[#30363d] bg-[#161b22] rounded-xl transition-all hover:border-[#3b82f6] hover:bg-[rgba(59,130,246,0.04)] group disabled:opacity-80"
                  >
                    <div className="w-12 h-12 rounded-lg bg-blue-900/30 text-[#3b82f6] flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                      {isPickingLocalFolder ? <Loader2 className="w-6 h-6 animate-spin" /> : <FolderOpen className="w-6 h-6" />}
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Open Local Folder</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Browse approved local roots or enter an absolute path to open your existing local projects.
                    </p>
                  </button>

                  <button
                    onClick={() => setView('repos')}
                    className="flex flex-col p-6 text-left border border-[#30363d] bg-[#161b22] rounded-xl transition-all hover:border-[#3b82f6] hover:bg-[rgba(59,130,246,0.04)] group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-indigo-900/30 text-indigo-400 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                      <Github className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Explore Repositories</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Open GitHub repositories in a cloud workspace session with full editor and terminal workflows.
                    </p>
                  </button>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recent Local Folders</h2>
                    <button
                      onClick={() => {
                        localStorage.removeItem(RECENT_LOCAL_KEY);
                        setRecentLocalPaths([]);
                      }}
                      className="text-xs text-[#3b82f6] hover:underline"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-1">
                    {recentLocalPaths.length > 0 ? (
                      recentLocalPaths.map((absolutePath, index) => (
                        <button
                          key={absolutePath}
                          onClick={() => void openLocalWorkspaceByAbsolutePath(absolutePath)}
                          className="group w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <Folder className="w-5 h-5 text-slate-400 group-hover:text-[#3b82f6]" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium text-slate-300 truncate">{workspaceNameFromPath(absolutePath)}</span>
                              <span className="text-xs font-mono text-slate-500 truncate">{absolutePath}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="hidden group-hover:block text-[10px] text-slate-500">
                              {index === 0 ? '2 hours ago' : index === 1 ? 'Yesterday' : '3 days ago'}
                            </span>
                            <span className="p-1.5 text-slate-600 group-hover:text-[#3b82f6]">
                              <Pin className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-slate-500">No recent local folders yet.</div>
                    )}
                  </div>
                </section>

                <footer className="mt-auto border-t border-[#30363d] pt-8 pb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Shortcuts</h4>
                      <ul className="text-xs space-y-2 text-slate-400">
                        <li className="flex justify-between">
                          <span>Open Project</span>
                          <kbd className="px-1 bg-slate-800 rounded border border-slate-700">⌘ O</kbd>
                        </li>
                        <li className="flex justify-between">
                          <span>Command Palette</span>
                          <kbd className="px-1 bg-slate-800 rounded border border-slate-700">⌘ ⇧ P</kbd>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">AI Support</h4>
                      <ul className="text-xs space-y-2 text-slate-400">
                        <li className="hover:text-[#3b82f6] transition-colors">Ask CodeMind Assistant</li>
                        <li className="hover:text-[#3b82f6] transition-colors">Setup Custom Models</li>
                      </ul>
                    </div>
                    <div className="flex flex-col items-end justify-center">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Connected to Local Engine
                      </div>
                    </div>
                  </div>
                </footer>
              </>
            ) : (
              <section className="space-y-5">
                <h1 className="text-4xl font-light tracking-tight text-white">Repositories</h1>
                <div className="h-10 rounded-lg border border-[#30363d] bg-[#161b22] flex items-center gap-2 px-3">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search repositories..."
                    className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                {isLoadingRepos ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
                  </div>
                ) : filteredRepos.length > 0 ? (
                  <div className="space-y-2">
                    {filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => void handleOpenRepoWorkspace(repo.owner.login, repo.name)}
                        className="w-full text-left p-4 rounded-lg border border-[#30363d] bg-[#161b22] hover:border-[#3b82f6] transition-colors"
                      >
                        <div className="text-base font-medium text-white">{repo.full_name}</div>
                        <div className="text-xs text-slate-500 mt-1">{repo.description || 'No description'}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No repositories found.</div>
                )}
              </section>
            )}
          </div>
        </main>

        <div className="fixed bottom-4 left-4 z-50">
          <button className="w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center font-bold text-xs shadow-lg">
            N
          </button>
        </div>
      </div>

      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-start justify-center pt-[8vh] px-4">
          <div className="w-full max-w-3xl cm-card rounded-xl overflow-hidden border border-[var(--cm-border)]">
            <div className="h-12 px-4 border-b border-[var(--cm-border)] flex items-center justify-between bg-[rgba(2,6,23,0.6)]">
              <div className="flex items-center gap-2">
                <FolderOpen size={15} className="text-[var(--cm-primary)]" />
                <span className="text-sm font-semibold text-slate-100">Open Local Folder</span>
              </div>
              <button
                onClick={() => setShowFolderModal(false)}
                className="h-7 w-7 rounded-md cm-btn-ghost flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <div className="h-11 px-4 border-b border-[var(--cm-border)] flex items-center gap-2">
              <button
                onClick={() => setFolderModalTab('browse')}
                className={`h-8 px-3 rounded-md text-xs font-semibold ${
                  folderModalTab === 'browse'
                    ? 'bg-[rgba(14,165,233,0.2)] text-[var(--cm-primary)]'
                    : 'cm-btn-ghost'
                }`}
              >
                Browse Roots
              </button>
              <button
                onClick={() => setFolderModalTab('manual')}
                className={`h-8 px-3 rounded-md text-xs font-semibold ${
                  folderModalTab === 'manual'
                    ? 'bg-[rgba(14,165,233,0.2)] text-[var(--cm-primary)]'
                    : 'cm-btn-ghost'
                }`}
              >
                Manual Path
              </button>
            </div>

            {folderModalTab === 'browse' ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRootId}
                    onChange={async (event) => {
                      const nextRootId = event.target.value;
                      setSelectedRootId(nextRootId);
                      await loadBrowseEntries(nextRootId, '');
                    }}
                    className="h-9 rounded-md bg-[rgba(15,23,42,0.7)] border border-[var(--cm-border)] px-2 text-sm text-slate-100"
                  >
                    {localRoots.map((root) => (
                      <option key={root.id} value={root.id}>
                        {root.label} ({root.absolutePath})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      if (!selectedRootId) return;
                      const parts = browseRelativePath.split('/').filter(Boolean);
                      parts.pop();
                      await loadBrowseEntries(selectedRootId, parts.join('/'));
                    }}
                    disabled={!selectedRootId || !browseRelativePath}
                    className="h-9 px-3 rounded-md cm-btn-ghost text-xs font-semibold disabled:opacity-50"
                  >
                    Up
                  </button>
                  <button
                    onClick={() => void openLocalWorkspaceByRoot(selectedRootId, browseRelativePath)}
                    disabled={!selectedRootId || isOpeningLocal}
                    className="h-9 px-3 rounded-md cm-btn-primary text-xs font-semibold disabled:opacity-50 ml-auto"
                  >
                    {isOpeningLocal ? 'Opening...' : 'Open This Folder'}
                  </button>
                </div>

                <div className="h-8 px-3 rounded-md bg-[rgba(2,6,23,0.5)] border border-[var(--cm-border)] text-xs text-[var(--cm-text-muted)] flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                  <span>/</span>
                  {browseBreadcrumb.map((segment, index) => (
                    <span key={`${segment}-${index}`} className="flex items-center gap-2">
                      <ChevronRight size={12} />
                      <span>{segment}</span>
                    </span>
                  ))}
                  {browseBreadcrumb.length === 0 && <span>root</span>}
                </div>

                <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-[var(--cm-border)] bg-[rgba(2,6,23,0.42)] p-2 space-y-1">
                  {browseEntries
                    .filter((entry) => entry.type === 'directory')
                    .map((entry) => (
                      <button
                        key={entry.relativePath}
                        onClick={async () => {
                          if (!selectedRootId) return;
                          await loadBrowseEntries(selectedRootId, entry.relativePath);
                        }}
                        className="w-full h-9 px-3 rounded-md text-left text-sm text-slate-100 hover:bg-[rgba(148,163,184,0.14)] flex items-center gap-2"
                      >
                        <FolderOpen size={14} className="text-amber-300" />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    ))}
                  {browseEntries.filter((entry) => entry.type === 'directory').length === 0 && (
                    <div className="px-3 py-6 text-xs text-[var(--cm-text-muted)] text-center">
                      No subfolders here. You can open this folder directly.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <input
                  value={manualAbsolutePath}
                  onChange={(event) => {
                    setManualAbsolutePath(event.target.value);
                    setManualValidationMessage('');
                  }}
                  placeholder="Enter absolute folder path (e.g. /Users/name/code/project)"
                  className="w-full h-10 rounded-md border border-[var(--cm-border)] bg-[rgba(15,23,42,0.75)] px-3 text-sm text-slate-100 placeholder:text-[var(--cm-text-muted)] focus:outline-none focus:border-[var(--cm-primary)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void openLocalWorkspaceByAbsolutePath(manualAbsolutePath)}
                    disabled={isOpeningLocal}
                    className="h-9 px-4 rounded-md cm-btn-primary text-xs font-semibold disabled:opacity-50"
                  >
                    {isOpeningLocal ? 'Opening...' : 'Validate & Open'}
                  </button>
                </div>
                {manualValidationMessage && (
                  <div className="p-3 rounded-md border border-red-400/40 bg-red-500/10 text-xs text-red-200">
                    {manualValidationMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

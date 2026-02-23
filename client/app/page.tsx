'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  ChevronRight,
  FolderOpen,
  Github,
  Loader2,
  Search,
  Star,
  GitFork,
  Eye,
  X,
} from 'lucide-react';

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
      setError(getErrorMessage(openError, `Failed to open ${owner}/${repo}`));
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
    <div className="h-screen cm-shell flex overflow-hidden">
      <aside className="w-12 cm-sidebar border-r border-[var(--cm-border)] flex flex-col items-center py-2">
        <div className="mb-6">
          <Brain className="w-7 h-7 text-[var(--cm-primary)]" />
        </div>
        <nav className="flex-1 flex flex-col gap-1.5">
          <button
            onClick={() => setView('launcher')}
            className={`h-9 w-9 rounded-md flex items-center justify-center ${
              view === 'launcher'
                ? 'text-[var(--cm-text)] bg-[rgba(79,142,247,0.16)]'
                : 'text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]'
            }`}
            title="Workspace Launcher"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <button
            onClick={() => setView('repos')}
            className={`h-9 w-9 rounded-md flex items-center justify-center ${
              view === 'repos'
                ? 'text-[var(--cm-text)] bg-[rgba(79,142,247,0.16)]'
                : 'text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]'
            }`}
            title="Explore Repositories"
          >
            <Github className="w-5 h-5" />
          </button>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <nav className="h-11 border-b border-[var(--cm-border)] bg-[rgba(12,18,28,0.94)] px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-1.5 rounded-md bg-[linear-gradient(145deg,#2f81f7,#5167ff)] shrink-0">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-100 truncate tracking-[0.02em]">CodeMind.AI</span>
          </div>

          <div className="flex items-center gap-3">
            {view === 'repos' && (
              <div className="hidden md:flex items-center gap-2 h-8 w-[320px] px-3 rounded-md border border-[var(--cm-border-soft)] bg-[rgba(9,13,21,0.78)]">
                <Search className="w-4 h-4 text-[var(--cm-text-muted)]" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search repositories..."
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-[var(--cm-text-muted)] focus:outline-none"
                />
              </div>
            )}
            <button
              onClick={handleLogout}
              className="h-8 px-3 rounded-md text-[11px] font-semibold border border-red-400/35 text-red-300 hover:bg-red-500/10"
            >
              Sign Out
            </button>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-400/45 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            {view === 'launcher' ? (
              <>
                <div className="flex items-end gap-3 mb-6">
                  <h2 className="text-3xl font-bold text-slate-100">Open Workspace</h2>
                  <span className="mb-1 px-2.5 py-1 rounded-full text-xs bg-[rgba(148,163,184,0.15)] text-[var(--cm-text-muted)]">
                    VS Code-style
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                  <button
                    onClick={() => void handleOpenFolder()}
                    disabled={isPickingLocalFolder}
                    className="cm-card rounded-xl p-5 text-left hover:border-[var(--cm-primary)]/60 transition-all disabled:opacity-80 disabled:cursor-wait"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {isPickingLocalFolder ? (
                        <Loader2 className="w-5 h-5 text-[var(--cm-primary)] animate-spin" />
                      ) : (
                        <FolderOpen className="w-5 h-5 text-[var(--cm-primary)]" />
                      )}
                      <h3 className="text-base font-semibold text-slate-100">
                        {isPickingLocalFolder ? 'Opening Finder / Explorer...' : 'Open Folder'}
                      </h3>
                    </div>
                    <p className="text-sm text-[var(--cm-text-muted)]">
                      Open Finder/File Explorer directly. If unavailable, fallback to in-app folder browser.
                    </p>
                  </button>

                  <button
                    onClick={() => setView('repos')}
                    className="cm-card rounded-xl p-5 text-left hover:border-[var(--cm-primary)]/60 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Github className="w-5 h-5 text-[var(--cm-primary)]" />
                      <h3 className="text-base font-semibold text-slate-100">Explore Repositories</h3>
                    </div>
                    <p className="text-sm text-[var(--cm-text-muted)]">
                      Open GitHub repositories in a workspace session with full editor and terminal workflows.
                    </p>
                  </button>
                </div>

                <div className="cm-card rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-100 mb-3">Recent Local Folders</h3>
                  {recentLocalPaths.length === 0 ? (
                    <p className="text-sm text-[var(--cm-text-muted)]">No recent local folders yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentLocalPaths.map((absolutePath) => (
                        <button
                          key={absolutePath}
                          onClick={() => void openLocalWorkspaceByAbsolutePath(absolutePath)}
                          className="w-full h-10 px-3 rounded-lg border border-[var(--cm-border)] text-left text-sm text-slate-100 hover:border-[var(--cm-primary)]/60 bg-[rgba(2,6,23,0.45)] truncate"
                        >
                          {absolutePath}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-end gap-3">
                    <h2 className="text-3xl font-bold text-slate-100">Your repositories</h2>
                    <span className="mb-1 px-2.5 py-1 rounded-full text-xs bg-[rgba(148,163,184,0.15)] text-[var(--cm-text-muted)]">
                      {repos.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setView('launcher')}
                    className="h-9 px-4 rounded-full cm-btn-ghost text-xs font-semibold flex items-center gap-1.5"
                  >
                    <ArrowLeft size={14} />
                    Back to Launcher
                  </button>
                </div>

                {isLoadingRepos ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-[var(--cm-primary)] animate-spin mx-auto mb-4" />
                      <p className="text-[var(--cm-text-muted)] text-sm">Loading your repositories...</p>
                    </div>
                  </div>
                ) : filteredRepos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => void handleOpenRepoWorkspace(repo.owner.login, repo.name)}
                        className="cm-card rounded-xl p-4 text-left flex flex-col h-full hover:border-[var(--cm-primary)]/60 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3 w-full gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Github className="w-5 h-5 text-[var(--cm-text-muted)]" />
                            <h3 className="text-sm font-semibold text-slate-100 truncate">{repo.name}</h3>
                          </div>
                          {repo.language && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-sky-400/30 text-sky-300 bg-sky-500/10 shrink-0">
                              {repo.language}
                            </span>
                          )}
                        </div>

                        {repo.description && (
                          <p className="text-xs text-[var(--cm-text-muted)] line-clamp-2 mb-4 flex-1">{repo.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-[var(--cm-text-muted)] mt-auto pt-2 border-t border-[var(--cm-border)]">
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5" />
                            {repo.stargazers_count}
                          </div>
                          <div className="flex items-center gap-1">
                            <GitFork className="w-3.5 h-3.5" />
                            {repo.forks_count}
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            {repo.watchers_count}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 rounded-xl border border-dashed border-[var(--cm-border-soft)] bg-[rgba(15,23,42,0.5)]">
                    <p className="text-[var(--cm-text-muted)] mb-3 text-sm">
                      {searchQuery ? 'No repositories match your search' : 'No repositories found'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
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
    </div>
  );
}

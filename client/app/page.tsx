// C:\codemind1\client\app\page.tsx (COMPLETE - HOME PAGE WITH OAUTH - UPDATED)
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Github, Code, Brain, Zap, Loader, Search, Star, GitFork, Eye } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

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

export default function HomePage() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  // Check for existing token and handle OAuth callback
  useEffect(() => {
    const token = localStorage.getItem('github_token');
    if (token) {
      setIsAuthenticated(true);
      fetchUserRepos(token);
    }

    // Check for auth-success callback from backend with token
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    if (callbackToken) {
      console.log('[Auth Success] Token received from backend callback');
      localStorage.setItem('github_token', callbackToken);
      setIsAuthenticated(true);
      window.history.replaceState({}, document.title, '/');
      fetchUserRepos(callbackToken);
    }
  }, []);

  const fetchUserRepos = async (token: string) => {
    try {
      setIsLoading(true);
      setError('');
      console.log('[Repos] Fetching user repositories...');

      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('github_token');
          setIsAuthenticated(false);
          setError('Token expired. Please sign in again.');
          return;
        }
        throw new Error('Failed to fetch repos');
      }

      const data = await response.json();
      console.log(`[Repos] Successfully fetched ${data.length} repositories`);
      setRepos(data);
    } catch (error) {
      console.error('[Repos Error]', error);
      setError('Failed to fetch repositories');
      localStorage.removeItem('github_token');
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      console.log('[Login] Requesting GitHub OAuth URL from backend...');
      // FIXED: Correct endpoint to match backend route /api/github/auth/github-url
      const response = await fetch(`${API_BASE_URL}/api/github/auth/github-url`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = `Backend returned status ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
          if (errorData.details) {
            errorMessage += `: ${errorData.details}`;
          }
        } catch (e) {
          // If response is not JSON, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error('No OAuth URL returned from backend');
      }

      console.log('[Login] Redirecting to GitHub OAuth...');
      // Backend will redirect from GitHub back to http://localhost:4000/api/github/callback
      // Then backend redirects to http://localhost:3000/?token=... or /auth-success?token=...
      window.location.href = data.url;
    } catch (error: any) {
      console.error('[Login Error]', error);
      // Display the actual error message from the server if available
      const errorMessage = error?.message || 'Failed to initiate GitHub login';
      setError(errorMessage.includes('not configured') || errorMessage.includes('required')
        ? errorMessage
        : `Failed to initiate GitHub login: ${errorMessage}`);
      setIsSigningIn(false);
    }
  };

  const handleRepoSelect = (owner: string, repo: string) => {
    router.push(`/repo/${owner}/${repo}`);
  };

  const handleLogout = () => {
    console.log('[Logout] User logging out...');
    localStorage.removeItem('github_token');
    setIsAuthenticated(false);
    setRepos([]);
    setError('');
  };

  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Not authenticated - show login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-[#0d1117] via-[#1a1a2e] to-[#16213e] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute top-0 left-0 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animation: 'pulse 8s ease-in-out infinite' }} />
        <div className="absolute bottom-0 right-0 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animation: 'pulse 8s ease-in-out 2s infinite' }} />

        <div className="relative z-10 w-full max-w-[400px] min-h-[490px] bg-[#161b22]/80 backdrop-blur-xl border border-[#30363d] p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center gap-8">
          {/* Added 'flex flex-col items-center' to the parent wrapper to force everything to center */}
          {/* Logo Section */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/20">
                <Brain className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-[#f0f6fc] mb-3">CodeMind.AI</h1>
            <p className="text-[#7d8590] text-sm leading-relaxed px-4">
              Your Intelligent Cloud IDE with integrated AI assistance.
            </p>
          </div>

          <div className="w-full flex justify-center">
            <button
              onClick={handleGitHubLogin}
              disabled={isSigningIn}
              className="w-auto px-8 bg-gradient-to-r from-[#2f81f7] to-[#1f6feb] hover:from-[#1f6feb] hover:to-[#0d47a1] disabled:from-gray-600 disabled:to-gray-500 text-white font-semibold py-3 rounded-[6px] flex items-center justify-center gap-2 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-blue-500/25 text-sm"
            >
              {isSigningIn ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <Github size={18} />
                  <span>Sign in with GitHub</span>
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs text-center">
              {error}
            </div>
          )}

          {/* Features Grid */}
          <div className="w-full h-px bg-[#30363d]/50" />

          {/* Features List - Vertically Aligned */}
          <div className="w-full space-y-6">
            <div className="flex flex-col items-center text-center group">
              <div className="mb-2 text-[#2f81f7] group-hover:scale-110 transition-transform duration-300">
                <Code className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Browse & Edit</h3>
              <p className="text-xs text-[#7d8590] mt-1">Intuitive file tree navigation</p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="mb-2 text-purple-400 group-hover:scale-110 transition-transform duration-300">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">AI Analysis</h3>
              <p className="text-xs text-[#7d8590] mt-1">Ollama-powered insights</p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="mb-2 text-green-400 group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Monaco Editor</h3>
              <p className="text-xs text-[#7d8590] mt-1">Pro syntax highlighting</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - show repositories
  return (
    <div className="h-screen bg-[#0d1117] flex flex-col overflow-hidden">
      {/* NEW NAVBAR: Properly aligned with uniform sizing */}
      <nav className="sticky top-0 z-50 w-full border-b border-[#30363d] bg-[#161b22]/95 backdrop-blur-md">
        <div className="w-full max-w-[1400px] mx-auto px-6">
          <div className="flex items-center justify-between h-[60px]">
            {/* LEFT */}
            <div className="flex items-center gap-6">
              <div className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <Brain className="w-12 h-12 text-white" />
              </div>
              <span className="text-4xl font-bold text-[#f0f6fc] tracking-tight">
                CodeMind.AI
              </span>
            </div>
            {/* RIGHT */}
            <div className="flex items-center gap-16">
              {/* SEARCH */}
              <button className="flex items-center gap-2 h-[38px] w-[420px] px-8 bg-[#0d1117] hover:bg-[#1c2128] border border-[#30363d] text-[#e6edf3] rounded-full">

                <Search className="w-6 h-6" />
                Search
              </button>
              {/* SIGN OUT */}
              <button
                onClick={handleLogout}
                className="h-[38px] w-[97px] px-8 text-xs py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-full"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-8xl mx-auto px-10 pt-8 pb-14">
          <div className="flex flex-col gap-2">

            <div className="flex items-end gap-4">

              <div className="text-[36px] font-bold text-[#f0f6fc]">
                Your repositories
              </div>

              <span className="mb-2 px-3 py-1 text-sm font-medium bg-[#21262d] text-[#e6edf3]/50 rounded-full">
                {repos.length}
              </span>

            </div>

          </div>
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Loading & Grid State */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Loader className="w-10 h-10 text-[#2f81f7] animate-spin mx-auto mb-4" />
                <p className="text-[#7d8590] text-sm">Loading your repositories...</p>
              </div>
            </div>
          ) : filteredRepos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {filteredRepos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleRepoSelect(repo.owner.login, repo.name)}
                  className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] 
                  hover:border-[#2f81f7]/50 hover:bg-[#1c2128]
                  transition-all duration-200 group text-left flex flex-col h-full"
                >
                  <div className="flex items-start justify-between mb-3 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <Github className="w-5 h-5 text-[#7d8590] group-hover:text-[#2f81f7] transition-colors flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-[#f0f6fc] group-hover:text-[#2f81f7] transition-colors truncate">
                        {repo.name}
                      </h3>
                    </div>
                    {repo.language && (
                      <span className="px-2 py-0.5 bg-[#2f81f7]/10 text-[#2f81f7] rounded-full text-[10px] font-medium border border-[#2f81f7]/20 flex-shrink-0">
                        {repo.language}
                      </span>
                    )}
                  </div>

                  {repo.description && (
                    <p className="text-xs text-[#7d8590] line-clamp-2 mb-4 flex-1">
                      {repo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-[#7d8590] mt-auto pt-2 border-t border-[#30363d]/50">
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
            <div className="text-center py-20 bg-[#161b22]/50 rounded-xl border border-[#30363d] border-dashed">
              <p className="text-[#7d8590] mb-3 text-sm">
                {searchQuery ? 'No repositories found matching your search' : 'No repositories found'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[#2f81f7] hover:underline text-sm"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

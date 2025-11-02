'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  GithubAuthProvider, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  Github, 
  Code, 
  GitBranch, 
  Zap, 
  BookOpen, 
  Settings, 
  ChevronRight,
  Clock,
  Star,
  Search,
  Plus,
  FolderOpen,
  FileText,
  FileCode,
  FileType2,
  FileArchive,
  FileImage,
  FileJson,
  FileVideo,
  FileAudio,
  FileCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { auth, githubProvider } from '../lib/firebase';
import axios from 'axios';
import IDELayout from '../components/layout/IDELayout';
import { FileNode } from '../components/views/ExplorerView';
import { EditorTab } from '../components/layout/EditorTabs';
import CodeEditor from '@/components/CodeEditor';

interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name?: string;
  email?: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  updated_at: string;
  created_at: string;
  pushed_at: string;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  owner: GitHubUser;
  topics?: string[];
  license?: {
    key: string;
    name: string;
    spdx_id: string;
    url: string;
    node_id: string;
  };
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export default function Home() {
  // State management
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [codeContent, setCodeContent] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('markdown');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [fetchingRepos, setFetchingRepos] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'stars'>('updated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Derived state
  const isAuthenticated = !!user;
  const repoCount = filteredRepos.length;

  // Handle GitHub login
  const handleGitHubLogin = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Sign in with GitHub using Firebase
      const result = await signInWithPopup(auth, githubProvider);
      
      // Get the OAuth credential from the result
      const credential = GithubAuthProvider.credentialFromResult(result);
      const oauthToken = credential?.accessToken;
      
      if (oauthToken) {
        // Store the OAuth token in localStorage
        localStorage.setItem('github_token', oauthToken);
        
        // Get the user's GitHub profile
        const user = result.user;
        const token = await user.getIdToken();
        
        // Store user info in state
        setUser({
          login: user.providerData[0]?.uid || '',
          avatar_url: user.photoURL || '',
          html_url: `https://github.com/${user.providerData[0]?.uid || ''}`,
          name: user.displayName || '',
          email: user.email || ''
        });
      } else {
        throw new Error('Failed to get OAuth token from GitHub');
      }
    } catch (error) {
      console.error('GitHub login error:', error);
      setError('Failed to sign in with GitHub');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setRepos([]);
      setFilteredRepos([]);
      setSelectedRepo(null);
      setCodeContent('');
      localStorage.removeItem('github_token');
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to sign out');
    }
  }, []);

  // Fetch user's repositories
  const fetchUserRepos = useCallback(async (token: string) => {
    try {
      setFetchingRepos(true);
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: { 'Authorization': `token ${token}` },
        params: { 
          sort: 'updated',
          direction: 'desc',
          per_page: 100 
        }
      });
      setRepos(response.data);
      setFilteredRepos(response.data);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      setError('Failed to fetch repositories');
    } finally {
      setFetchingRepos(false);
    }
  }, []);

  // Handle repository selection
  const handleRepoSelect = useCallback((repo: Repository) => {
    // Navigate to the repository page
    window.location.href = `/repo/${repo.owner.login}/${repo.name}`;
  }, []);

  // Format date
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Get color for programming language
  const getLanguageColor = (language: string | null) => {
    if (!language) return '#cccccc';
    
    const colors: Record<string, string> = {
      'JavaScript': '#f1e05a',
      'TypeScript': '#3178c6',
      'Python': '#3572A5',
      'Java': '#b07219',
      'C++': '#f34b7d',
      'C#': '#178600',
      'PHP': '#4F5D95',
      'Ruby': '#701516',
      'Go': '#00ADD8',
      'Rust': '#dea584',
      'Swift': '#F05138',
      'Kotlin': '#A97BFF',
      'Dart': '#00B4AB',
      'HTML': '#e34c26',
      'CSS': '#563d7c',
      'SCSS': '#c6538c',
      'Shell': '#89e051',
      'Dockerfile': '#384d54',
      'Makefile': '#427819',
      'Vue': '#2c3e50',
      'React': '#61dafb',
      'Angular': '#DD0031',
      'Svelte': '#FF3E00',
      'JSON': '#292929',
      'YAML': '#cb171e',
      'Markdown': '#083fa1',
      'SQL': '#e38c00',
      'XML': '#0060ac'
    };
    
    return colors[language] || '#cccccc';
  };

  // Filter repositories based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredRepos(repos);
    } else {
      const filtered = repos.filter(repo => 
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredRepos(filtered);
    }
  }, [searchQuery, repos]);

  // Handle authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          // Get the stored GitHub OAuth token from localStorage
          const token = localStorage.getItem('github_token');
          
          if (!token) {
            console.log('No GitHub token found in localStorage, signing out...');
            await signOut(auth);
            return;
          }

          try {
            // Verify the token is valid by fetching user data
            const userResponse = await axios.get('https://api.github.com/user', {
              headers: { 
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}` 
              }
            });
            
            // Update user state with GitHub user data
            setUser({
              login: userResponse.data.login,
              avatar_url: userResponse.data.avatar_url,
              html_url: userResponse.data.html_url,
              name: userResponse.data.name || firebaseUser.displayName || userResponse.data.login,
              email: userResponse.data.email || firebaseUser.email || ''
            });

            // Fetch user repositories after successful authentication
            fetchUserRepos(token);
          } catch (error) {
            console.error('Error fetching GitHub user data:', error);
            // If there's an error with the GitHub API, sign out to clear invalid token
            await signOut(auth);
          }
          
          // Fetch user's repositories
          await fetchUserRepos(token);
        } catch (error) {
          console.error('Authentication error:', error);
          // If there's an error with the token, sign out to clear invalid state
          await signOut(auth);
          localStorage.removeItem('github_token');
          setError('Failed to authenticate with GitHub. Please sign in again.');
        }
      } else {
        // User is signed out
        setUser(null);
        setRepos([]);
        setFilteredRepos([]);
        setSelectedRepo(null);
        setCodeContent('');
      }
    });

    return () => unsubscribe();
  }, [fetchUserRepos]);

  // Render header component
  const renderHeader = () => (
    <header className="bg-[#0d1117] border-b border-[#30363d] py-4 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-white">CodeMind</h1>
        {user ? (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-300">{user.login}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={handleGitHubLogin}
            className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in with GitHub'}
          </button>
        )}
      </div>
    </header>
  );

  // Render main content
  const renderMainContent = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              <h2 className="mt-6 text-3xl font-extrabold text-white">
                Welcome to CodeMind
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Sign in with your GitHub account to access your repositories
              </p>
            </div>
            <div>
              <button
                onClick={handleGitHubLogin}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in with GitHub'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Repository List */}
          <div className="w-full lg:w-1/3">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-4 h-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Your Repositories</h2>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    className="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-white placeholder-[#484f58] focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                {filteredRepos.length > 0 ? (
                  filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className={`p-3 rounded-md cursor-pointer transition-colors duration-150 ${
                        selectedRepo?.id === repo.id
                          ? 'bg-[#1f6feb] text-white'
                          : 'hover:bg-[#161b22] text-[#e6edf3]'
                      }`}
                      onClick={() => handleRepoSelect(repo)}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm truncate">{repo.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e] whitespace-nowrap ml-2">
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                      </div>
                      {repo.description && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{repo.description}</p>
                      )}
                      <div className="flex items-center mt-2 text-xs text-gray-500">
                        {repo.language && (
                          <span className="flex items-center mr-4">
                            <span 
                              className="w-3 h-3 rounded-full mr-1" 
                              style={{ backgroundColor: getLanguageColor(repo.language) }}
                            ></span>
                            {repo.language}
                          </span>
                        )}
                        <span>Updated {formatDate(repo.updated_at)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {fetchingRepos ? 'Loading repositories...' : 'No repositories found'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Code Editor */}
          <div className="w-full lg:w-2/3">
            {selectedRepo ? (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-4 h-full">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">
                    {selectedRepo.name} - README.md
                  </h2>
                </div>
                <div className="h-[calc(100vh-200px)]">
                  <CodeEditor
                    code={codeContent}
                    language={selectedLanguage}
                    height="100%"
                    onChange={(value) => setCodeContent(value || '')}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 border-2 border-dashed border-[#30363d] rounded-lg">
                <div className="text-center">
                  <p className="text-gray-500">Select a repository to view its contents</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <div className="max-w-md w-full space-y-8 text-center p-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">CodeMind.AI</h1>
            <h2 className="mt-6 text-2xl font-semibold text-[#cccccc]">
              AI-Powered Code Editor
            </h2>
            <p className="mt-4 text-sm text-[#858585]">
              A VS Code-like IDE with integrated AI assistance for code analysis, debugging, and development.
            </p>
          </div>
          <div>
            <button
              onClick={handleGitHubLogin}
              className="w-full flex justify-center items-center gap-2 py-3 px-6 rounded-md text-sm font-medium text-white bg-[#007acc] hover:bg-[#005a9e] transition-colors"
              disabled={loading}
            >
              {loading ? 'Signing in...' : '🚀 Sign in with GitHub'}
            </button>
          </div>
          <p className="text-xs text-[#858585]">
            Connect your GitHub account to browse and edit your repositories
          </p>
        </div>
      </div>
    );
  }

  // Convert repos to FileNode structure for the explorer
  const convertReposToFileNodes = (): FileNode[] => {
    return filteredRepos.map(repo => ({
      id: repo.id.toString(),
      name: repo.name,
      type: 'file' as const,
      path: repo.full_name,
    }));
  };

  return (
    <IDELayout
      files={convertReposToFileNodes()}
      expandedDirs={{}}
      onFileClick={(node) => {
        const repo = filteredRepos.find(r => r.full_name === node.path);
        if (repo) handleRepoSelect(repo);
      }}
      onDirToggle={() => {}}
      statusBarProps={{
        branch: user?.login || 'main',
        aiStatus: 'ready'
      }}
    >
      <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-center p-8 max-w-2xl">
          <h1 className="text-3xl font-bold text-white mb-4">
            Welcome to CodeMind.AI
          </h1>
          <p className="text-[#cccccc] mb-6">
            Select a repository from the Explorer or use the AI Assistant to get started.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-[#2d2d2d] p-4 rounded-lg">
              <div className="text-2xl mb-2">📁</div>
              <h3 className="text-white font-medium mb-1">File Explorer</h3>
              <p className="text-sm text-[#858585]">Browse your repositories and files</p>
            </div>
            <div className="bg-[#2d2d2d] p-4 rounded-lg">
              <div className="text-2xl mb-2">🤖</div>
              <h3 className="text-white font-medium mb-1">AI Assistant</h3>
              <p className="text-sm text-[#858585]">Get intelligent code suggestions</p>
            </div>
            <div className="bg-[#2d2d2d] p-4 rounded-lg">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="text-white font-medium mb-1">Code Editor</h3>
              <p className="text-sm text-[#858585]">Powered by Monaco Editor</p>
            </div>
          </div>
        </div>
      </div>
    </IDELayout>
  );
}

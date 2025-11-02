'use client';

import { useState, useEffect, useCallback } from 'react';

// Define API base URL at the top level
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { Code, File as FileIcon, FileText, FileImage, Sparkles, Loader2, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import CodeEditor from '@/components/CodeEditor';
import IDELayout from '@/components/layout/IDELayout';
import { FileNode } from '@/components/views/ExplorerView';
import { EditorTab } from '@/components/layout/EditorTabs';

interface RepositoryAnalysis {
  analysis: string;
  fileCount: number;
  languages: string[];
}

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

export default function RepoPage() {
  const params = useParams();
  const router = useRouter();
  const { owner, repo } = params as { owner: string; repo: string };
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [error, setError] = useState('');
  const [repoContent, setRepoContent] = useState<GitHubFile[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<GitHubFile | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const getLanguage = (filename: string): string => {
    const ext = getFileExtension(filename);
    switch (ext) {
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'py': return 'python';
      case 'md': return 'markdown';
      case 'json': return 'json';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'jsx': return 'javascript';
      case 'tsx': return 'typescript';
      default: return 'plaintext';
    }
  };

  const analyzeRepository = async () => {
    if (!repoContent.length) {
      setError('No repository content available to analyze');
      return;
    }
    
    setIsAnalyzing(true);
    setError('');
    setShowAnalysis(true);
    
    try {
      // Get GitHub token
      const githubToken = localStorage.getItem('github_token');
      if (!githubToken) {
        throw new Error('GitHub authentication required. Please sign in with GitHub.');
      }

      // Select important files for analysis (limit to 5 files to avoid rate limits)
      const importantFiles = repoContent
        .filter(file => file.type === 'file' && 
          (file.name.endsWith('.js') || 
           file.name.endsWith('.ts') || 
           file.name.endsWith('.py') ||
           file.name.endsWith('.java') ||
           file.name.endsWith('package.json') ||
           file.name.endsWith('requirements.txt') ||
           file.name.endsWith('README.md'))
        )
        .slice(0, 5);

      if (importantFiles.length === 0) {
        throw new Error('No supported files found for analysis');
      }
      
      console.log(`Analyzing ${importantFiles.length} important files...`);
      
      // Process files in batches to avoid rate limiting
      const BATCH_SIZE = 2;
      const filesWithContent = [];
      
      for (let i = 0; i < importantFiles.length; i += BATCH_SIZE) {
        const batch = importantFiles.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const response = await axios.get(
                `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
                {
                  headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3.raw'
                  },
                  responseType: 'text',
                  timeout: 10000 // 10 second timeout per file
                }
              );

              return {
                path: file.path,
                name: file.name,
                content: response.data || '',
                language: getFileExtension(file.name) || 'text',
                size: file.size || 0
              };
            } catch (error) {
              console.error(`Error fetching ${file.path}:`, error);
              return null;
            }
          })
        );

        // Filter out failed requests and add to results
        filesWithContent.push(...batchResults.filter(Boolean));
        
        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < importantFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (filesWithContent.length === 0) {
        throw new Error('Failed to fetch any file contents for analysis');
      }

      console.log(`Successfully fetched ${filesWithContent.length} files for analysis`);
      
      // Send files to our backend for analysis
      const response = await axios.post(
        `${API_BASE_URL}/api/ai/analyze-repo`, 
        {
          files: filesWithContent,
          owner,
          repo
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${githubToken}`
          },
          timeout: 60000 // 60 second timeout for analysis
        }
      );
      
      if (!response.data) {
        throw new Error('No response data from analysis service');
      }

      // Update UI with analysis results
      setAnalysis({
        analysis: response.data.analysis || 'No analysis available.',
        fileCount: response.data.metadata?.totalFiles || filesWithContent.length,
        languages: response.data.metadata?.languages || []
      });
      
      console.log('Analysis completed successfully');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 
                         err.response?.data?.error || 
                         err.message || 
                         'Failed to analyze repository';
      
      console.error('Analysis failed:', errorMessage, err);
      setError(`Analysis failed: ${errorMessage}`);
      
      // Set a fallback analysis if available
      if (err.response?.data?.fallbackAnalysis) {
        setAnalysis({
          analysis: err.response.data.fallbackAnalysis,
          fileCount: 0,
          languages: []
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchRepoContent = useCallback(async (path: string = '') => {
    if (!owner || !repo) return;

    try {
      setIsLoading(true);
      setError('');
      const githubToken = localStorage.getItem('github_token');
      if (!githubToken) {
        throw new Error('GitHub authentication required. Please sign in with GitHub.');
      }

      console.log(`Fetching repository content for path: ${path}`);
      
      // First, try to get the repository contents
      const response = await axios.get<GitHubFile[] | { message: string }>(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: { 
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CodeMind.AI'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      if (!response.data) {
        throw new Error('No data received from GitHub API');
      }

      if (Array.isArray(response.data)) {
        console.log(`Successfully loaded ${response.data.length} items from repository`);
        setRepoContent(response.data);
      } else if ('message' in response.data) {
        // If GitHub returns an error message
        throw new Error(response.data.message);
      } else {
        // If we get a single file instead of an array
        setRepoContent([response.data]);
      }
    } catch (err) {
      const error = err as Error & { response?: { data?: { message?: string }; status?: number } };
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load repository content';
      console.error('Error fetching repository content:', error);
      setError(`Error: ${errorMessage}`);
      
      // If unauthorized, redirect to home
      if (error.response?.status === 401) {
        router.push('/');
      }
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo]);

  // Initial fetch
  useEffect(() => {
    fetchRepoContent('');
  }, [fetchRepoContent]);

  const fetchFileContent = useCallback(async (file: GitHubFile) => {
    try {
      setIsLoadingFile(true);
      setError('');
      
      const githubToken = localStorage.getItem('github_token');
      if (!githubToken) {
        throw new Error('GitHub authentication required');
      }

      console.log(`Fetching content for file: ${file.path}`);
      
      // Get the file content using GitHub API
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CodeMind.AI'
          },
          timeout: 10000
        }
      );

      // Check if file is too large
      if (response.data.size > 1024 * 100) { // 100KB limit
        setFileContent(`// File is too large to display (${(response.data.size / 1024).toFixed(1)}KB)`);
        setSelectedFile(file);
        return;
      }

      // Decode base64 content
      if (response.data.content && response.data.encoding === 'base64') {
        const decodedContent = atob(response.data.content.replace(/\n/g, ''));
        setFileContent(decodedContent);
      } else {
        setFileContent('// Unable to decode file content');
      }
      
      setSelectedFile(file);
    } catch (err: any) {
      console.error('Error fetching file content:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load file content';
      setError(`Error: ${errorMessage}`);
      setFileContent(`// Error loading file: ${errorMessage}`);
    } finally {
      setIsLoadingFile(false);
    }
  }, [owner, repo]);

  const handleItemClick = useCallback((item: GitHubFile) => {
    if (item.type === 'dir') {
      setExpandedDirs(prev => ({
        ...prev,
        [item.path]: !prev[item.path]
      }));
      fetchRepoContent(item.path);
    } else {
      fetchFileContent(item);
    }
  }, [fetchRepoContent, fetchFileContent]);

  const getFileIcon = (filename: string) => {
    const extension = getFileExtension(filename);
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'dart'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

    if (codeExtensions.includes(extension)) {
      return <Code className="w-4 h-4 text-blue-400" />;
    } else if (extension === 'md') {
      return <FileText className="w-4 h-4 text-blue-400" />;
    } else if (imageExtensions.includes(extension)) {
      return <FileImage className="w-4 h-4 text-green-400" />;
    } else {
      return <FileIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  useEffect(() => {
    fetchRepoContent('');
  }, [fetchRepoContent]);

  // Convert GitHubFile[] to FileNode[] for the explorer
  const convertToFileNodes = (githubFiles: GitHubFile[]): FileNode[] => {
    return githubFiles.map(file => ({
      id: file.sha,
      name: file.name,
      type: file.type === 'dir' ? 'dir' : 'file',
      path: file.path,
      isExpanded: expandedDirs[file.path] || false
    }));
  };

  // Handle file/directory clicks from ExplorerView
  const handleFileNodeClick = (node: FileNode) => {
    const githubFile = repoContent.find(f => f.path === node.path);
    if (githubFile) {
      handleItemClick(githubFile);
    }
  };

  const handleDirToggle = (path: string) => {
    setExpandedDirs(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
    const dir = repoContent.find(f => f.path === path);
    if (dir && dir.type === 'dir') {
      fetchRepoContent(path);
    }
  };

  // Create editor tabs
  const tabs: EditorTab[] = selectedFile ? [{
    id: selectedFile.sha,
    title: selectedFile.name,
    path: selectedFile.path,
    isDirty: false
  }] : [];

  return (
    <IDELayout
      files={convertToFileNodes(repoContent)}
      expandedDirs={expandedDirs}
      onFileClick={handleFileNodeClick}
      onDirToggle={handleDirToggle}
      selectedFile={selectedFile ? {
        id: selectedFile.sha,
        name: selectedFile.name,
        type: selectedFile.type === 'dir' ? 'dir' : 'file',
        path: selectedFile.path,
        isExpanded: expandedDirs[selectedFile.path] || false
      } : null}
      tabs={tabs}
      activeTabId={selectedFile?.sha || ''}
      onTabClick={() => {}}
      onTabClose={() => {
        setSelectedFile(null);
        setFileContent('');
      }}
      statusBarProps={{
        language: selectedFile ? getLanguage(selectedFile.name) : 'plaintext',
        branch: 'main',
        aiStatus: isAnalyzing ? 'processing' : 'ready'
      }}
    >
      {selectedFile ? (
        <div className="h-full">
          <CodeEditor
            code={fileContent}
            language={getLanguage(selectedFile.name)}
            height="100%"
            onChange={(newContent) => setFileContent(newContent)}
            readOnly={false}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8 max-w-md">
            <Code className="w-16 h-16 mx-auto mb-4 text-[#858585]" />
            <h3 className="text-lg font-medium mb-2 text-[#cccccc]">No file selected</h3>
            <p className="text-sm text-[#858585]">
              Select a file from the Explorer to view its contents, or use the AI Assistant to analyze your code.
            </p>
          </div>
        </div>
      )}
    </IDELayout>
  );
}

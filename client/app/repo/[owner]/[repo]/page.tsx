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
  const [analysisStatus, setAnalysisStatus] = useState('');
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

  const analyzeRepository = useCallback(async () => {
    if (!owner || !repo) return;
    
    try {
      setError('');
      setIsAnalyzing(true);
      setAnalysisStatus('Preparing repository analysis...');
      
      // Get GitHub token from localStorage
      const githubToken = localStorage.getItem('github_token');
      if (!githubToken) {
        throw new Error('GitHub authentication token not found. Please sign in again.');
      }

      setAnalysisStatus('Fetching repository structure...');
      
      // Define interface for GitHub file/directory entry
      interface GitHubContentEntry {
        name: string;
        path: string;
        size: number;
        type: 'file' | 'dir';
        url: string;
        download_url: string | null;
      }

      // First, get the repository contents with a timeout
      const contentsResponse = await Promise.race([
        axios.get<GitHubContentEntry[]>(
          `https://api.github.com/repos/${owner}/${repo}/contents`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${githubToken}`
            },
            timeout: 30000 // 30 second timeout for initial fetch
          }
        ),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Repository fetch timed out. The repository might be too large.')), 30000)
        )
      ]) as { data: GitHubContentEntry[] };

      if (!contentsResponse?.data || !Array.isArray(contentsResponse.data)) {
        throw new Error('Failed to fetch repository contents');
      }

      // Filter out large files and non-code files
      const importantFiles = contentsResponse.data.filter(
        (file: any) => 
          file.size < 50000 && // Less than 50KB (reduced from 100KB)
          !file.name.match(/\.(jpg|jpeg|png|gif|svg|ico|pdf|zip|tar\.gz|DS_Store|gitignore|md|lock|log|bin|exe|dll|so|a|o|pyc|class|jar|war|ear|zip|tar|gz|7z|rar|ipynb)$/i) &&
          !file.path.includes('node_modules/') &&
          !file.path.includes('dist/') &&
          !file.path.includes('build/') &&
          !file.path.includes('vendor/')
      ).slice(0, 30); // Limit to first 30 files to prevent timeouts

      if (importantFiles.length === 0) {
        throw new Error('No suitable files found for analysis. The repository might be empty or contain only non-code files.');
      }

      setAnalysisStatus(`Analyzing ${importantFiles.length} files...`);
      
      // Fetch content for each file (in smaller batches)
      const BATCH_SIZE = 3;
      const filesWithContent: any[] = [];
      
      for (let i = 0; i < importantFiles.length; i += BATCH_SIZE) {
        const batch = importantFiles.slice(i, i + BATCH_SIZE);
        setAnalysisStatus(`Processing files ${i + 1}-${Math.min(i + BATCH_SIZE, importantFiles.length)} of ${importantFiles.length}...`);
        
        const batchResults = await Promise.all(
          batch.map(async (file: any) => {
            try {
              const fileResponse = await axios.get<string>(file.url, {
                headers: {
                  'Accept': 'application/vnd.github.v3.raw',
                  'Authorization': `Bearer ${githubToken}`
                },
                timeout: 20000, // 20 second timeout per file
                responseType: 'text'
              });
              
              return {
                path: file.path,
                name: file.name,
                content: typeof fileResponse.data === 'string' ? fileResponse.data : JSON.stringify(fileResponse.data),
                size: file.size,
                type: file.type,
                language: getLanguage(file.name)
              };
            } catch (error) {
              const err = error as Error;
              console.warn(`Skipping ${file.path}:`, err.message);
              return null;
            }
          })
        );

        // Filter out failed requests and add to results
        const successfulFiles = batchResults.filter(Boolean);
        filesWithContent.push(...successfulFiles);
        
        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < importantFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (filesWithContent.length === 0) {
        throw new Error('Failed to fetch any file contents for analysis');
      }

      console.log(`Successfully fetched ${filesWithContent.length} files for analysis`);
      setAnalysisStatus('Analyzing code... This may take a moment.');
      
      try {
        // Send files to our backend for analysis with a timeout
        const analysisResponse = await Promise.race([
          axios.post(
            `${API_BASE_URL}/api/ai/analyze-repo`, 
            {
              files: filesWithContent.slice(0, 20), // Limit to first 20 files
              owner,
              repo,
              analyzeCode: true,
              maxFileSize: 50000
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${githubToken}`
              },
              timeout: 120000 // 2 minute timeout for analysis
            }
          ),
          new Promise((_, reject) => 
            setTimeout(
              () => reject(new Error('Analysis is taking too long. The repository might be too large.')), 
              120000
            )
          )
        ]) as { data: any };
        
        if (!analysisResponse?.data) {
          throw new Error('No response data from analysis service');
        }

        // Update UI with analysis results
        setAnalysis({
          analysis: analysisResponse.data.analysis || 'No analysis available.',
          fileCount: analysisResponse.data.metadata?.totalFiles || filesWithContent.length,
          languages: analysisResponse.data.metadata?.languages || []
        });
        
        console.log('Analysis completed successfully');
        setAnalysisStatus('Analysis completed!');
      } catch (error) {
        const analysisError = error as Error;
        console.error('Analysis error:', analysisError);
        throw new Error(`Analysis failed: ${analysisError.message || 'Unknown error during analysis'}`);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 
                         err.response?.data?.error || 
                         err.message || 
                         'Failed to analyze repository';
      
      console.error('Repository analysis failed:', errorMessage);
      setError(`Analysis failed: ${errorMessage}`);
      
      // Provide more specific guidance for common errors
      if (errorMessage.includes('timeout') || errorMessage.includes('too large')) {
        setError(prev => prev + ' Try analyzing a smaller repository or specific files.');
      } else if (errorMessage.includes('rate limit')) {
        setError(prev => prev + ' GitHub rate limit reached. Please wait a few minutes and try again.');
      }
    } finally {
      setIsAnalyzing(false);
      setIsLoading(false);
    }
  }, [owner, repo]);

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
      const error = err as Error & { response?: { data?: { message?: string } } };
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load repository content';
      console.error('Error fetching repository content:', error);
      setError(`Error: ${errorMessage}`);
      
      // Handle different types of errors
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setError('Repository not found or access denied');
        } else if (error.response?.status === 401) {
          setError('Authentication failed. Please sign in again.');
          router.push('/');
        }
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

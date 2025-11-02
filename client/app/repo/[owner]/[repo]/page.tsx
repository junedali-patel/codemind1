'use client';

import { useState, useEffect, useCallback } from 'react';

// Define API base URL at the top level
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { File, Folder, ChevronRight, ChevronDown, Code, FileText, FileImage, Sparkles, Loader2 } from 'lucide-react';
import CodeEditor from '@/components/CodeEditor';

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
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
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
      
      // First get the file details to check if it's a binary file
      const detailsResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CodeMind.AI'
          },
          timeout: 10000
        }
      );

      // If it's a binary file or too large, show a message
      if (detailsResponse.data.size > 1024 * 100) { // 100KB limit
        setFileContent(`// File is too large to display (${(detailsResponse.data.size / 1024).toFixed(1)}KB)`);
        setSelectedFile(file);
        return;
      }

      // Get the raw content
      const response = await axios.get(
        `https://raw.githubusercontent.com/${owner}/${repo}/main/${encodeURIComponent(file.path)}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'CodeMind.AI'
          },
          responseType: 'text',
          timeout: 10000
        }
      );

      setFileContent(response.data || '');
      setSelectedFile(file);
    } catch (err: any) {
      console.error('Error fetching file content:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load file content';
      setError(`Error: ${errorMessage}`);
      setFileContent(`// Error loading file: ${errorMessage}`);
    } finally {
      setIsLoadingFile(false);
    }
  }, [owner, repo, router]);

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
      return <File className="w-4 h-4 text-gray-400" />;
    }
  };

  useEffect(() => {
    fetchRepoContent('');
  }, [fetchRepoContent]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold mb-2">{repo}</h1>
          <button
            onClick={analyzeRepository}
            disabled={isAnalyzing || isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze Repository
              </>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className="space-y-1">
              {repoContent.map((item) => (
                <div key={item.sha} className="px-4 py-1 hover:bg-gray-200 cursor-pointer">
                  <div 
                    className="flex items-center space-x-1"
                    onClick={() => handleItemClick(item)}
                  >
                    {item.type === 'dir' ? (
                      <>
                        {expandedDirs[item.path] ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <Folder className="w-4 h-4 text-yellow-400" />
                      </>
                    ) : (
                      <div className="w-4 h-4 flex items-center justify-center">
                        {getFileIcon(item.name)}
                      </div>
                    )}
                    <span className="ml-1 truncate">{item.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showAnalysis && analysis && (
          <div className="bg-white rounded-lg shadow p-6 m-4 border border-gray-200 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Repository Analysis</h2>
              <button 
                onClick={() => setShowAnalysis(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">{analysis.fileCount} files</span>
                {analysis.languages.length > 0 && (
                  <span className="ml-4">
                    <span className="font-medium">Languages: </span>
                    {analysis.languages.join(', ')}
                  </span>
                )}
              </div>
              <div className="prose max-w-none">
                {analysis.analysis.split('\n').map((paragraph, i) => (
                  <p key={i} className="mb-4">{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <div className="h-full">
              <CodeEditor
                code={fileContent}
                language={getLanguage(selectedFile.name)}
                height="calc(100vh - 60px)"
                onChange={(newContent) => setFileContent(newContent)}
                readOnly={false}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center p-8 max-w-md">
                <Code className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium mb-2">No file selected</h3>
                <p className="text-sm text-gray-400">
                  Select a file from the sidebar to view its contents, or click "Analyze Repository" 
                  to get a detailed analysis of this codebase.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

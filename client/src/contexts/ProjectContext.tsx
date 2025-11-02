import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface Repository {
  id: string;
  name: string;
  description: string;
  url: string;
  language: string;
  stars: number;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
}

interface Project {
  id: string;
  name: string;
  repository: Repository;
}

interface ProjectContextType {
  repositories: Repository[];
  currentProject: Project | null;
  fileTree: FileNode[];
  activeFile: FileNode | null;
  compilerOutput: string;
  loadRepository: (repo: Repository) => void;
  createFile: (name: string) => void;
  openFile: (file: FileNode) => void;
  updateFileContent: (path: string, content: string) => void;
  saveProject: () => void;
  runCode: () => void;
  getCodeContext: () => any;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [compilerOutput, setCompilerOutput] = useState('');

  useEffect(() => {
    if (user) {
      loadRepositories();
    }
  }, [user]);

  const loadRepositories = async () => {
    // Mock repositories data
    const mockRepos: Repository[] = [
      {
        id: '1',
        name: 'my-react-app',
        description: 'A React application with TypeScript',
        url: 'https://github.com/user/my-react-app',
        language: 'TypeScript',
        stars: 42
      },
      {
        id: '2',
        name: 'node-api-server',
        description: 'REST API server built with Node.js',
        url: 'https://github.com/user/node-api-server',
        language: 'JavaScript',
        stars: 18
      },
      {
        id: '3',
        name: 'python-data-analysis',
        description: 'Data analysis scripts in Python',
        url: 'https://github.com/user/python-data-analysis',
        language: 'Python',
        stars: 7
      }
    ];
    
    setRepositories(mockRepos);
  };

  const loadRepository = async (repo: Repository) => {
    const project: Project = {
      id: repo.id,
      name: repo.name,
      repository: repo
    };
    
    setCurrentProject(project);
    
    // Mock file tree
    const mockFileTree: FileNode[] = [
      {
        name: 'src',
        path: '/src',
        type: 'folder',
        children: [
          {
            name: 'App.tsx',
            path: '/src/App.tsx',
            type: 'file',
            content: `import React from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <h1>Hello CodeMind.AI</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;`
          },
          {
            name: 'index.tsx',
            path: '/src/index.tsx',
            type: 'file',
            content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`
          }
        ]
      },
      {
        name: 'package.json',
        path: '/package.json',
        type: 'file',
        content: `{
  "name": "${repo.name}",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}`
      },
      {
        name: 'README.md',
        path: '/README.md',
        type: 'file',
        content: `# ${repo.name}

${repo.description}

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`
`
      }
    ];
    
    setFileTree(mockFileTree);
    
    // Auto-open main file
    const mainFile = mockFileTree[0]?.children?.[0];
    if (mainFile) {
      setActiveFile(mainFile);
    }
  };

  const createFile = (name: string) => {
    const newFile: FileNode = {
      name,
      path: `/${name}`,
      type: 'file',
      content: ''
    };
    
    setFileTree(prev => [...prev, newFile]);
    setActiveFile(newFile);
  };

  const openFile = (file: FileNode) => {
    if (file.type === 'file') {
      setActiveFile(file);
    }
  };

  const updateFileContent = (path: string, content: string) => {
    const updateNode = (node: FileNode): FileNode => {
      if (node.path === path) {
        return { ...node, content };
      }
      if (node.children) {
        return {
          ...node,
          children: node.children.map(updateNode)
        };
      }
      return node;
    };

    setFileTree(prev => prev.map(updateNode));
    
    if (activeFile?.path === path) {
      setActiveFile(prev => prev ? { ...prev, content } : null);
    }
  };

  const saveProject = async () => {
    console.log('Saving project...');
    // Implement save functionality
  };

  const runCode = async () => {
    if (!activeFile) return;
    
    setCompilerOutput('Running code...\n');
    
    // Simulate code execution
    setTimeout(() => {
      setCompilerOutput(prev => prev + 'Code executed successfully!\nOutput: Hello, World!\n');
    }, 1000);
  };

  const getCodeContext = () => {
    return {
      activeFile,
      project: currentProject,
      fileTree
    };
  };

  return (
    <ProjectContext.Provider value={{
      repositories,
      currentProject,
      fileTree,
      activeFile,
      compilerOutput,
      loadRepository,
      createFile,
      openFile,
      updateFileContent,
      saveProject,
      runCode,
      getCodeContext
    }}>
      {children}
    </ProjectContext.Provider>
  );
};
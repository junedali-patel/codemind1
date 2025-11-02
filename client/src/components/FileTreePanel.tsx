import React, { useState } from 'react';
import { ChevronDown, ChevronRight, File as FileIcon, Folder, Plus, Github } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import { useAuth } from '../contexts/AuthContext';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  content?: string;
}

export const FileTreePanel: React.FC = () => {
  const { user } = useAuth();
  const { 
    repositories, 
    currentProject, 
    fileTree, 
    loadRepository, 
    createFile, 
    openFile,
    activeFile 
  } = useProject();
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));
  const [showRepos, setShowRepos] = useState(!currentProject);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFileNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = activeFile?.path === node.path;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer transition-colors ${
            isActive ? 'bg-gray-700 border-l-2 border-blue-500' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.path);
            } else {
              openFile(node);
            }
          }}
        >
          {node.type === 'folder' ? (
            <>
              {isExpanded ? (
                <ChevronDown size={16} className="text-gray-400 mr-1" />
              ) : (
                <ChevronRight size={16} className="text-gray-400 mr-1" />
              )}
              <Folder size={16} className="text-blue-400 mr-2" />
            </>
          ) : (
            <>
              <div className="w-4 mr-1" />
              <FileIcon size={16} className="text-gray-400 mr-2" />
            </>
          )}
          <span className="text-sm">{node.name}</span>
        </div>

        {node.type === 'folder' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="p-4 text-center">
        <Github size={48} className="mx-auto text-gray-600 mb-4" />
        <p className="text-gray-400 text-sm">Sign in with GitHub to access your repositories</p>
      </div>
    );
  }

  if (showRepos || !currentProject) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300">Repositories</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {repositories.map(repo => (
            <div
              key={repo.id}
              className="flex items-center p-3 hover:bg-gray-700 cursor-pointer transition-colors border-b border-gray-800"
              onClick={() => loadRepository(repo)}
            >
              <Github size={16} className="text-gray-400 mr-3" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{repo.name}</div>
                <div className="text-xs text-gray-400 truncate">{repo.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Explorer</h3>
        <div className="flex space-x-1">
          <button
            onClick={() => createFile('untitled.js')}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
            title="New File"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowRepos(true)}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
            title="Switch Repository"
          >
            <Github size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fileTree.map(node => renderFileNode(node))}
      </div>
    </div>
  );
};
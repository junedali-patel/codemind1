'use client';

import { ChevronRight, ChevronDown, Folder, File as FileIcon, FolderOpen } from 'lucide-react';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'dir';
  path: string;
  children?: FileNode[];
  isExpanded?: boolean;
}

interface ExplorerViewProps {
  files: FileNode[];
  expandedDirs: Record<string, boolean>;
  onFileClick: (file: FileNode) => void;
  onDirToggle: (path: string) => void;
  selectedFile?: FileNode | null;
}

export default function ExplorerView({ 
  files, 
  expandedDirs, 
  onFileClick, 
  onDirToggle,
  selectedFile 
}: ExplorerViewProps) {
  const renderFileTree = (nodes: FileNode[], level: number = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedDirs[node.path];
      const isSelected = selectedFile?.path === node.path;

      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-[#2a2a2a] ${
              isSelected ? 'bg-[#37373d]' : ''
            }`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => {
              if (node.type === 'dir') {
                onDirToggle(node.path);
              } else {
                onFileClick(node);
              }
            }}
          >
            {node.type === 'dir' && (
              <div className="w-4 h-4 flex items-center justify-center text-[#cccccc]">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </div>
            )}
            {node.type === 'dir' ? (
              isExpanded ? (
                <FolderOpen size={16} className="text-[#dcb67a] flex-shrink-0" />
              ) : (
                <Folder size={16} className="text-[#dcb67a] flex-shrink-0" />
              )
            ) : (
              <FileIcon size={16} className="text-[#858585] flex-shrink-0" />
            )}
            <span className="text-sm text-[#cccccc] truncate">{node.name}</span>
          </div>
          {node.type === 'dir' && isExpanded && node.children && (
            <div>
              {renderFileTree(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="p-2">
      {files.length > 0 ? (
        renderFileTree(files)
      ) : (
        <div className="text-center text-[#858585] text-sm py-8">
          No files to display
        </div>
      )}
    </div>
  );
}

'use client';

import { ChevronDown, ChevronRight, File, FolderOpen, GitBranch, Network } from '@/lib/icons';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  icon?: string;
  content?: string;
}

interface ExplorerViewProps {
  files: FileNode[];
  expandedDirs: Record<string, boolean>;
  onFileClick: (file: FileNode) => void;
  onDirToggle: (path: string) => void;
  selectedFile: FileNode | null;
  onGenerateVisualization?: (file: FileNode, type: 'flowchart' | 'mindmap') => void;
}

function FileTreeItem({
  file,
  expandedDirs,
  selectedId,
  onFileClick,
  onDirToggle,
  depth = 0,
}: {
  file: FileNode;
  expandedDirs: Record<string, boolean>;
  selectedId?: string;
  onFileClick: (file: FileNode) => void;
  onDirToggle: (path: string) => void;
  depth?: number;
}) {
  const isDirectory = file.type === 'directory';
  const isExpanded = expandedDirs[file.id] || false;
  const isSelected = selectedId === file.id;

  return (
    <div>
      <button
        onClick={() => (isDirectory ? onDirToggle(file.id) : onFileClick(file))}
        className={`w-full h-6 text-left flex items-center gap-1.5 px-2 rounded transition-colors ${
          isSelected
            ? 'bg-white/5 text-[#58a6ff]'
            : 'text-[#c9d1d9] hover:bg-white/5'
        }`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown size={12} className="text-slate-500 shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-slate-500 shrink-0" />
            )}
            <FolderOpen size={12} className="text-[#8b949e] shrink-0" />
          </>
        ) : (
          <>
            <span className="w-[12px] shrink-0" />
            <File size={12} className="text-[#8b949e] shrink-0" />
          </>
        )}
        <span className="text-[12px] truncate">{file.name}</span>
      </button>

      {isDirectory && isExpanded && file.children && (
        <div className="space-y-0.5 mt-0.5">
          {file.children.map((child) => (
            <FileTreeItem
              key={child.id}
              file={child}
              expandedDirs={expandedDirs}
              selectedId={selectedId}
              onFileClick={onFileClick}
              onDirToggle={onDirToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExplorerView({
  files,
  expandedDirs,
  onFileClick,
  onDirToggle,
  selectedFile,
  onGenerateVisualization,
}: ExplorerViewProps) {
  const isFileSelected = selectedFile && selectedFile.type === 'file';

  return (
    <div className="h-full flex flex-col px-2 py-2 text-[#c9d1d9] bg-[#010409]">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-0.5">
          {files.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No files found</div>
          )}
          {files.map((file) => (
            <FileTreeItem
              key={file.id}
              file={file}
              expandedDirs={expandedDirs}
              selectedId={selectedFile?.id}
              onFileClick={onFileClick}
              onDirToggle={onDirToggle}
            />
          ))}
        </div>
      </div>

      {isFileSelected && onGenerateVisualization && (
        <div className="pt-2 mt-2 border-t border-[#30363d]">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Visualize Code
          </div>
          <div className="space-y-1.5 px-1">
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'flowchart')}
              className="w-full h-7 px-2 rounded text-[11px] font-medium flex items-center gap-1.5 text-slate-300 hover:bg-white/5 transition-colors"
              title="Generate flowchart for selected file"
            >
              <GitBranch size={12} />
              <span>Generate Flowchart</span>
            </button>
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'mindmap')}
              className="w-full h-7 px-2 rounded text-[11px] font-medium flex items-center gap-1.5 text-slate-300 hover:bg-white/5 transition-colors"
              title="Generate mindmap for selected file"
            >
              <Network size={12} />
              <span>Generate Mindmap</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

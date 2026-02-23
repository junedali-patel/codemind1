'use client';

import { ChevronDown, ChevronRight, File, FolderOpen, GitBranch, Network } from 'lucide-react';

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
            ? 'bg-[rgba(79,142,247,0.16)] text-[var(--cm-text)]'
            : 'text-[var(--cm-text)] hover:bg-[rgba(129,150,189,0.12)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown size={12} className="text-[var(--cm-primary)] shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-[var(--cm-text-muted)] shrink-0" />
            )}
            <FolderOpen size={12} className="text-amber-400 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-[12px] shrink-0" />
            <File size={12} className="text-[#7aa2f7] shrink-0" />
          </>
        )}
        <span className="text-[11px] truncate">{file.name}</span>
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
    <div className="h-full flex flex-col px-1.5 py-2 text-[var(--cm-text)]">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-2 pb-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cm-text-muted)] border-b border-[var(--cm-border)]">
          Project Files
        </div>
        <div className="space-y-0.5">
          {files.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--cm-text-muted)]">No files found</div>
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
        <div className="pt-2 mt-2 border-t border-[var(--cm-border)]">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cm-text-muted)]">
            Visualize Code
          </div>
          <div className="space-y-1.5 px-1">
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'flowchart')}
              className="w-full h-7 px-2 rounded cm-btn-ghost text-[11px] font-medium flex items-center gap-1.5"
              title="Generate flowchart for selected file"
            >
              <GitBranch size={12} />
              <span>Generate Flowchart</span>
            </button>
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'mindmap')}
              className="w-full h-7 px-2 rounded cm-btn-ghost text-[11px] font-medium flex items-center gap-1.5"
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

'use client';

import { FolderOpen, File, ChevronRight, ChevronDown, GitBranch, Network } from 'lucide-react';

// --- UPDATE 1: Added 'content' to the interface ---
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  icon?: string;
  content?: string; // <--- NEW: Holds the code for the Mind Map to read
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
  expanded,
  selected,
  onFileClick,
  onDirToggle
}: {
  file: FileNode;
  expanded: boolean;
  selected: boolean;
  onFileClick: (file: FileNode) => void;
  onDirToggle: (path: string) => void;
}) {
  const isDirectory = file.type === 'directory';

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-150 rounded-sm ${
          selected
            ? 'bg-[#094771] text-[#cccccc]'
            : 'text-[#cccccc] hover:bg-[#3e3e42]/30'
        }`}
        onClick={() => {
          if (isDirectory) {
            onDirToggle(file.id);
          } else {
            // This passes the whole file object (including content) up to the parent
            onFileClick(file);
          }
        }}
      >
        {isDirectory ? (
          <>
            {expanded ? (
              <ChevronDown size={14} className="text-[#0ea5e9]" />
            ) : (
              <ChevronRight size={14} className="text-[#858585]" />
            )}
            <FolderOpen size={14} className="text-[#dcb939]" />
          </>
        ) : (
          <>
            <div className="w-4" />
            <File size={14} className="text-[#6ba3ff]" />
          </>
        )}
        <span className="text-[13px] flex-1 truncate font-medium">{file.name}</span>
      </div>

      {isDirectory && expanded && file.children && (
        <div className="ml-2 border-l border-[#3e3e42]/50">
          {file.children.map((child) => (
            <FileTreeItem
              key={child.id}
              file={child}
              expanded={true} // Simplified for recursive view, or pass specific state
              selected={selected}
              onFileClick={onFileClick}
              onDirToggle={onDirToggle}
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
  onGenerateVisualization
}: ExplorerViewProps) {
  const isFileSelected = selectedFile && selectedFile.type === 'file';

  return (
    <div className="p-3 text-[#cccccc] flex flex-col h-full">
      <style jsx>{`
        .explorer-section {
          margin-bottom: 16px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #858585;
          padding: 8px 0 6px 8px;
          margin-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          transition: color 0.2s ease;
        }

        .section-title:hover {
          color: #cccccc;
        }

        .visualization-actions {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>

      <div className="explorer-section flex-1 overflow-y-auto">
        <div className="section-title">PROJECT FILES</div>
        <div className="space-y-0.5">
          {files.length === 0 && (
            <div className="text-[#858585] text-[12px] px-3 py-2">
              No files found
            </div>
          )}
          {files.map((file) => (
            <FileTreeItem
              key={file.id}
              file={file}
              expanded={expandedDirs[file.id] || false}
              selected={selectedFile?.id === file.id}
              onFileClick={onFileClick}
              onDirToggle={onDirToggle}
            />
          ))}
        </div>
      </div>

      {/* Visualization Actions - Only show for selected files */}
      {isFileSelected && onGenerateVisualization && (
        <div className="visualization-actions">
          <div className="section-title">VISUALIZE CODE</div>
          <div className="flex flex-col gap-2 px-2">
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'flowchart')}
              className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300 hover:text-white"
              title="Generate flowchart for selected file"
            >
              <GitBranch size={14} />
              <span>Generate Flowchart</span>
            </button>
            <button
              onClick={() => onGenerateVisualization(selectedFile, 'mindmap')}
              className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300 hover:text-white"
              title="Generate mindmap for selected file"
            >
              <Network size={14} />
              <span>Generate Mindmap</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


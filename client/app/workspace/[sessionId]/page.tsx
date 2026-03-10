"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import IDELayout from "@/components/layout/IDELayout";
import CodeEditor from "@/components/CodeEditor";
import { FileNode } from "@/components/views/ExplorerView";
import { EditorTab } from "@/components/layout/EditorTabs";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function flattenFilePaths(nodes: FileNode[]): string[] {
  const output: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") output.push(node.id);
    if (node.children?.length) output.push(...flattenFilePaths(node.children));
  }
  return output;
}

function findNodeById(nodes: FileNode[], nodeId: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children?.length) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export default function WorkspaceSessionPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;

  const [workspaceTree, setWorkspaceTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [documents, setDocuments] = useState<Record<string, any>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTabPath, setActiveTabPath] = useState("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisOutput, setAnalysisOutput] = useState("");

  const allFilePaths = useMemo(() => flattenFilePaths(workspaceTree), [workspaceTree]);

  async function analyzeWorkspace() {
    setIsAnalyzing(true);
    setAnalysisOutput("");
    try {
      const filePaths = allFilePaths;
      const files: { path: string; content: string }[] = [];
      for (const path of filePaths) {
        let content = documents[path]?.content;
        if (typeof content !== "string") {
          const res = await fetch(`${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/file?path=${encodeURIComponent(path)}`);
          const data = await res.json();
          content = data.content || "";
        }
        files.push({ path, content });
      }
      const res = await fetch(`${API_BASE_URL}/api/ai/analyze-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, files }),
      });
      const data = await res.json();
      setAnalysisOutput(data.analysis || "No analysis returned.");
    } catch (_) {
      setAnalysisOutput("Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/tree`)
      .then((res) => res.json())
      .then((data) => {
        setWorkspaceTree(data.tree || []);
        setExpandedDirs((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const expanded: Record<string, boolean> = {};
          for (const node of data.tree || []) {
            if (node.type === "directory") expanded[node.id] = true;
          }
          return expanded;
        });
      });
  }, [sessionId]);

  const openDocument = useCallback(
    async (path: string) => {
      setIsFileLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/workspace/${encodeURIComponent(sessionId)}/file?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        setDocuments((prev) => ({
          ...prev,
          [path]: {
            path,
            name: path.split("/").pop() || path,
            language: path.split(".").pop() || "plaintext",
            content: data.content,
            isDirty: false,
          },
        }));
        setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
        setActiveTabPath(path);
      } catch (_) {
        setError("Failed to open file");
      } finally {
        setIsFileLoading(false);
      }
    },
    [sessionId]
  );

  const tabs = useMemo<EditorTab[]>(
    () =>
      openTabs.map((path) => {
        const document = documents[path];
        return {
          id: path,
          name: document?.name || path.split("/").pop() || path,
          language: document?.language,
          isDirty: document?.isDirty,
        };
      }),
    [documents, openTabs]
  );

  const activeDocument = activeTabPath ? documents[activeTabPath] : undefined;
  const selectedFileNode = useMemo(() => {
    if (!activeTabPath) return null;
    return findNodeById(workspaceTree, activeTabPath);
  }, [activeTabPath, workspaceTree]);

  const headerContent = (
    <header className="border-b border-[#30363d] bg-[#010409]">
      <div className="h-12 px-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Workspace: {sessionId}</span>
        <button
          onClick={analyzeWorkspace}
          disabled={isAnalyzing || allFilePaths.length === 0}
          className="h-8 px-3 rounded border border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#58a6ff] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3b82f6]/20 transition-all"
        >
          {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
        </button>
      </div>
    </header>
  );

  return (
    <IDELayout
      files={workspaceTree}
      expandedDirs={expandedDirs}
      onFileClick={(file) => {
        if (file.type === "directory") {
          setExpandedDirs((prev) => ({ ...prev, [file.id]: !prev[file.id] }));
          return;
        }
        openDocument(file.id);
      }}
      onDirToggle={(path) => setExpandedDirs((prev) => ({ ...prev, [path]: !prev[path] }))}
      selectedFile={selectedFileNode}
      tabs={tabs}
      activeTabId={activeTabPath}
      onTabClick={setActiveTabPath}
      onTabClose={(tabId) => {
        setOpenTabs((prev) => prev.filter((id) => id !== tabId));
        if (activeTabPath === tabId) setActiveTabPath(openTabs.filter((id) => id !== tabId)[0] || "");
      }}
      selectedFileContent={activeDocument?.content || null}
      headerContent={headerContent}
      analysisPanel={analysisOutput || isAnalyzing ? {
        content: analysisOutput,
        isAnalyzing,
        onClose: () => {
          setAnalysisOutput("");
          setIsAnalyzing(false);
        },
      } : undefined}
      panelContent={{
        problems: [],
        outputLines: [],
        debugLines: [],
        terminalLines: [],
        terminalConnected: false,
        terminalInput: "",
        onTerminalInputChange: () => {},
        onTerminalSubmit: () => {},
        terminalTabs: [],
        activeTerminalId: "",
        onTerminalTabSelect: () => {},
        onTerminalCreate: () => {},
        onTerminalClose: () => {},
      }}
    >
      <div className="h-full flex flex-col">
        {error && (
          <div className="p-2 bg-red-500/15 border border-red-400/45 rounded text-red-200 text-sm">{error}</div>
        )}
        {activeDocument ? (
          <CodeEditor
            code={activeDocument.content}
            language={activeDocument.language}
            height="100%"
            onChange={() => {}}
            readOnly={false}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#0d1117] text-slate-400">
            {isFileLoading ? "Loading file..." : "Select a file to start editing."}
          </div>
        )}
      </div>
    </IDELayout>
  );
}

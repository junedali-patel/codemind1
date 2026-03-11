"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import IDELayout, { PanelState } from "@/components/layout/IDELayout";
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

function getDirectoryPath(filePath: string) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) return "";
  segments.pop();
  return segments.join("/");
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
  const [panelState, setPanelState] = useState<PanelState>({
    visible: true,
    activeTab: "problems",
    height: 220,
  });
  const [openTopMenu, setOpenTopMenu] = useState<"file" | "view" | "terminal" | "help" | null>(null);
  const topMenuContainerRef = useRef<HTMLDivElement | null>(null);

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
  const terminalCwd = useMemo(() => getDirectoryPath(activeTabPath), [activeTabPath]);
  const selectedFileNode = useMemo(() => {
    if (!activeTabPath) return null;
    return findNodeById(workspaceTree, activeTabPath);
  }, [activeTabPath, workspaceTree]);

  const topMenuSections = useMemo(() => [
    {
      id: "file",
      label: "File",
      actions: [],
    },
    {
      id: "view",
      label: "View",
      actions: [
        {
          id: "view-toggle-panel",
          label: panelState.visible ? "Hide Panel" : "Show Panel",
          run: () => {
            setPanelState((previous) => ({ ...previous, visible: !previous.visible }));
          },
        },
      ],
    },
    {
      id: "terminal",
      label: "Terminal",
      actions: [
        {
          id: "terminal-open",
          label: "Open Terminal",
          run: () => {
            setPanelState((previous) => ({ ...previous, visible: true, activeTab: "terminal" }));
          },
        },
      ],
    },
    {
      id: "help",
      label: "Help",
      actions: [],
    },
  ], [panelState.visible]);

  useEffect(() => {
    if (!openTopMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!topMenuContainerRef.current) return;
      if (!topMenuContainerRef.current.contains(event.target as Node)) {
        setOpenTopMenu(null);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenTopMenu(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [openTopMenu]);

  const headerContent = (
    <header className="border-b border-[#30363d] bg-[#010409]">
      <div className="h-9 px-4 border-b border-[#30363d] flex items-center justify-between gap-3">
        <div ref={topMenuContainerRef} className="flex items-center gap-5">
          <span className="text-[12px] font-semibold tracking-[0.14em] text-slate-300">CODEMIND.AI</span>
          <div className="flex items-center gap-0.5">
            {topMenuSections.map((section) => (
              <div key={section.id} className="relative">
                <button
                  onClick={() =>
                    setOpenTopMenu((previous) => (previous === section.id ? null : (section.id as "file" | "view" | "terminal" | "help")))
                  }
                  className={`h-7 px-2 rounded text-[12px] transition-colors ${
                    openTopMenu === section.id
                      ? "bg-white/10 text-slate-100"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                  }`}
                >
                  {section.label}
                </button>

                {openTopMenu === section.id && (
                  <div className="absolute left-0 top-8 min-w-[230px] rounded-md border border-[#30363d] bg-[#0b111a] shadow-xl shadow-black/40 py-1 z-30">
                    {section.actions.length === 0 ? (
                      <div className="px-3 h-8 flex items-center text-[12px] text-slate-500">
                        No actions yet
                      </div>
                    ) : (
                      section.actions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => {
                            setOpenTopMenu(null);
                            action.run();
                          }}
                          className="w-full px-3 h-8 flex items-center justify-between text-left text-[12px] text-slate-300 hover:bg-white/5"
                        >
                          <span>{action.label}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="h-12 px-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Workspace: {sessionId}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelState((previous) => ({ ...previous, visible: true, activeTab: "terminal" }))}
            className="h-8 px-3 rounded border border-[#30363d] bg-white/5 text-slate-300 text-xs font-semibold hover:bg-white/10 transition-all"
          >
            Open Terminal
          </button>
          <button
            onClick={analyzeWorkspace}
            disabled={isAnalyzing || allFilePaths.length === 0}
            className="h-8 px-3 rounded border border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#58a6ff] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3b82f6]/20 transition-all"
          >
            {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <IDELayout
      workspaceSessionId={sessionId}
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
      terminalCwd={terminalCwd}
      panelState={panelState}
      onPanelStateChange={setPanelState}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

const SERVER_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  "http://localhost:4000";

interface TerminalViewProps {
  workspaceSessionId?: string;
  cwd?: string;
  syncCwd?: string;
}

interface TerminalSessionPayload {
  terminalId: string;
  shell?: string;
  cwd?: string;
}

function normalizeRelativeCwd(value?: string) {
  if (!value) return "";
  return String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function joinWorkspacePath(rootPath: string, relativePath: string) {
  if (!relativePath) return rootPath;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const cleaned = relativePath.replace(/[\\/]+/g, separator).replace(new RegExp(`^\\${separator}+`), "");
  if (rootPath.endsWith(separator)) {
    return `${rootPath}${cleaned}`;
  }
  return `${rootPath}${separator}${cleaned}`;
}

function buildCdCommand(shell: string | undefined, targetPath: string) {
  const normalized = targetPath.replace(/"/g, '\\"');
  const lowerShell = String(shell || "").toLowerCase();
  if (lowerShell.includes("cmd.exe")) {
    return `cd /d "${normalized}"\r`;
  }
  return `cd "${normalized}"\r`;
}

export default function TerminalView({ workspaceSessionId, cwd, syncCwd }: TerminalViewProps) {
  const terminalDivRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const workspaceRootRef = useRef<string | null>(null);
  const lastSyncedCwdRef = useRef<string>("");

  const [status, setStatus] = useState<"connecting" | "ready" | "error" | "exited">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionInfo, setSessionInfo] = useState<{ shell?: string; cwd?: string } | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const statusRef = useRef<"connecting" | "ready" | "error" | "exited">("connecting");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const createSession = useCallback(async (): Promise<TerminalSessionPayload | null> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/terminal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSessionId, cwd }),
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const payload = await res.json();
          message = payload.details || payload.error || payload.message || message;
        } catch {
          // ignore response parsing errors
        }
        throw new Error(message);
      }
      return (await res.json()) as TerminalSessionPayload;
    } catch (err) {
      console.error("[Terminal] Failed to create session:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to start terminal");
      setStatus("error");
      return null;
    }
  }, [workspaceSessionId, cwd]);

  useEffect(() => {
    if (!terminalDivRef.current) return;

    let disposed = false;
    let terminalId: string | null = null;
    let socket: Socket | null = null;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const handleResize = () => {
      if (fitAddon && term && socket) {
        fitAddon.fit();
        socket.emit("terminal:resize", {
          cols: term.cols,
          rows: term.rows,
        });
      }
    };

    setStatus("connecting");
    setErrorMsg("");
    setSessionInfo(null);

    const setup = async () => {
      term = new Terminal({
        theme: {
          background: "#1e1e1e",
          foreground: "#d4d4d4",
          cursor: "#aeafad",
          black: "#1e1e1e",
          red: "#f44747",
          green: "#608b4e",
          yellow: "#dcdcaa",
          blue: "#569cd6",
          magenta: "#c678dd",
          cyan: "#56b6c2",
          white: "#d4d4d4",
          brightBlack: "#808080",
        },
        fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: "block",
        scrollback: 5000,
        allowTransparency: true,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        event.preventDefault();
        const electronAPI = (window as any)?.electronAPI;
        if (electronAPI?.openExternal) {
          electronAPI.openExternal(uri);
          return;
        }
        window.open(uri, "_blank", "noopener,noreferrer");
      });
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(terminalDivRef.current!);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      const session = await createSession();
      if (!session || disposed) return;
      terminalId = session.terminalId;
      terminalIdRef.current = terminalId;
      setSessionInfo({ shell: session.shell, cwd: session.cwd });
      workspaceRootRef.current = session.cwd || null;
      lastSyncedCwdRef.current = "";

      socket = io(SERVER_URL, {
        path: "/socket.io",
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("terminal:attach", terminalId);
      });

      socket.on("terminal:ready", () => {
        if (!disposed) setStatus("ready");
      });

      socket.on("terminal:output", (data: string) => {
        term?.write(data);
      });

      socket.on("terminal:exit", ({ exitCode }: { exitCode: number }) => {
        term?.write(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        if (!disposed) setStatus("exited");
      });

      socket.on("terminal:error", (msg: string) => {
        setErrorMsg(msg);
        setStatus("error");
      });

      socket.on("disconnect", () => {
        if (!disposed && statusRef.current !== "exited") {
          term?.write("\r\n\x1b[31m[Disconnected from server]\x1b[0m\r\n");
        }
      });

      term.onData((data) => {
        socket?.emit("terminal:input", data);
      });

      resizeObserver = new ResizeObserver(handleResize);
      if (terminalDivRef.current) {
        resizeObserver.observe(terminalDivRef.current);
      }
      window.addEventListener("resize", handleResize);
    };

    setup();

    return () => {
      const currentTerm = term;
      const currentSocket = socket;
      const currentTerminalId = terminalId;

      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("resize", handleResize);

      if (currentTerminalId) {
        fetch(`${SERVER_URL}/api/terminal/${currentTerminalId}`, {
          method: "DELETE",
        }).catch(() => {});
      }

      currentSocket?.disconnect();
      currentTerm?.dispose();

      if (termRef.current === currentTerm) termRef.current = null;
      if (fitAddonRef.current === fitAddon) fitAddonRef.current = null;
      if (socketRef.current === currentSocket) socketRef.current = null;
      if (terminalIdRef.current === currentTerminalId) terminalIdRef.current = null;
    };
  }, [createSession, sessionKey]);

  useEffect(() => {
    const rootPath = workspaceRootRef.current;
    if (!rootPath) return;
    if (statusRef.current !== "ready") return;
    const desiredRel = normalizeRelativeCwd(syncCwd);
    if (desiredRel === lastSyncedCwdRef.current) return;

    const targetPath = desiredRel ? joinWorkspacePath(rootPath, desiredRel) : rootPath;
    const command = buildCdCommand(sessionInfo?.shell, targetPath);
    socketRef.current?.emit("terminal:input", command);
    lastSyncedCwdRef.current = desiredRel;
    setSessionInfo((previous) => ({
      shell: previous?.shell,
      cwd: targetPath,
    }));
  }, [syncCwd, sessionInfo?.shell, status]);

  const handleRestart = () => {
    setSessionKey((previous) => previous + 1);
  };

  const shellLabel = sessionInfo?.shell
    ? sessionInfo.shell.split(/[\\/]/).pop()
    : "shell";

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1 bg-[#2d2d2d] border-b border-[#3e3e3e]">
        <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
          <span className="truncate">{shellLabel}</span>
          {sessionInfo?.cwd && (
            <span className="text-gray-500 truncate" title={sessionInfo.cwd}>
              {sessionInfo.cwd}
            </span>
          )}
          <span
            className={`w-2 h-2 rounded-full ${
              status === "ready"
                ? "bg-green-500"
                : status === "error"
                ? "bg-red-500"
                : status === "exited"
                ? "bg-yellow-500"
                : "bg-blue-400 animate-pulse"
            }`}
          />
          <span className="capitalize">{status}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-[#3e3e3e] transition"
            title="New Terminal"
          >
            + New
          </button>
          <button
            onClick={() => termRef.current?.clear()}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-[#3e3e3e] transition"
            title="Clear"
          >
            Clear
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 text-red-400 text-sm border-b border-red-800">
          <span>!</span>
          <span>{errorMsg || "Terminal error"}</span>
        </div>
      )}

      <div
        ref={terminalDivRef}
        className="flex-1 p-2 overflow-hidden"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

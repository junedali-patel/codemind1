"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// Install: npm install xterm xterm-addon-fit xterm-addon-web-links socket.io-client
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface TerminalViewProps {
  workspaceSessionId?: string;
  cwd?: string;
}

export default function TerminalView({ workspaceSessionId, cwd }: TerminalViewProps) {
  const terminalDivRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<"connecting" | "ready" | "error" | "exited">("connecting");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Create terminal session on backend ──────────────────────────────────
  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/terminal/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSessionId, cwd }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.terminalId;
    } catch (err) {
      console.error("[Terminal] Failed to create session:", err);
      setErrorMsg("Failed to start terminal. Is the backend running?");
      setStatus("error");
      return null;
    }
  }, [workspaceSessionId, cwd]);

  // ── Main setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!terminalDivRef.current) return;

    let disposed = false;

    const setup = async () => {
      // 1. Create xterm instance
      const term = new Terminal({
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

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(terminalDivRef.current!);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // 2. Create backend session
      const terminalId = await createSession();
      if (!terminalId || disposed) return;
      terminalIdRef.current = terminalId;

      // 3. Connect socket.io
      const socket = io(SERVER_URL, {
        path: "/socket.io",
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        // Attach to the terminal session
        socket.emit("terminal:attach", terminalId);
      });

      socket.on("terminal:ready", () => {
        if (!disposed) setStatus("ready");
      });

      // Backend → xterm display
      socket.on("terminal:output", (data: string) => {
        term.write(data);
      });

      socket.on("terminal:exit", ({ exitCode }: { exitCode: number }) => {
        term.write(`\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        if (!disposed) setStatus("exited");
      });

      socket.on("terminal:error", (msg: string) => {
        setErrorMsg(msg);
        setStatus("error");
      });

      socket.on("disconnect", () => {
        if (!disposed && status !== "exited") {
          term.write("\r\n\x1b[31m[Disconnected from server]\x1b[0m\r\n");
        }
      });

      // 4. xterm → backend input
      term.onData((data) => {
        socket.emit("terminal:input", data);
      });

      // 5. Resize handling
      const handleResize = () => {
        if (fitAddonRef.current && termRef.current) {
          fitAddonRef.current.fit();
          socket.emit("terminal:resize", {
            cols: termRef.current.cols,
            rows: termRef.current.rows,
          });
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      if (terminalDivRef.current) {
        resizeObserver.observe(terminalDivRef.current);
      }
      window.addEventListener("resize", handleResize);

      // Cleanup
      return () => {
        disposed = true;
        resizeObserver.disconnect();
        window.removeEventListener("resize", handleResize);
      };
    };

    const cleanupPromise = setup();

    return () => {
      disposed = true;
      cleanupPromise.then((cleanup) => cleanup?.());

      // Kill backend session
      if (terminalIdRef.current) {
        fetch(`${SERVER_URL}/api/terminal/${terminalIdRef.current}`, {
          method: "DELETE",
        }).catch(() => {});
      }

      socketRef.current?.disconnect();
      termRef.current?.dispose();
    };
  }, [createSession]);

  // ── New terminal button ──────────────────────────────────────────────────
  const handleRestart = () => {
    termRef.current?.dispose();
    socketRef.current?.disconnect();
    setStatus("connecting");
    setErrorMsg("");
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#2d2d2d] border-b border-[#3e3e3e]">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>bash</span>
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

      {/* Error state */}
      {status === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 text-red-400 text-sm border-b border-red-800">
          <span>⚠</span>
          <span>{errorMsg || "Terminal error"}</span>
        </div>
      )}

      {/* xterm container */}
      <div
        ref={terminalDivRef}
        className="flex-1 p-2 overflow-hidden"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
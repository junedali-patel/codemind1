const express = require("express");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");
const { getWorkspaceSessionById } = require("../state/runtime");

const router = express.Router();

// node-pty is a native module. Rebuild if needed for Electron.
// Run: npx electron-rebuild -f -w node-pty  (after Electron setup)
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  try {
    pty = require("@homebridge/node-pty-prebuilt-multiarch");
  } catch (fallbackError) {
    console.warn(
      "[Terminal] node-pty not available:",
      e.message,
      "fallback failed:",
      fallbackError.message
    );
  }
}

// Store active terminal sessions: terminalId -> { ptyProcess, workspaceSessionId }
const sessions = new Map();

function isTerminalEnabled() {
  return process.env.TERMINAL_ENABLED === "true";
}

function requireTerminalEnabled(req, res, next) {
  if (!isTerminalEnabled()) {
    return res.status(503).json({
      error: "Terminal disabled",
      details: "Set TERMINAL_ENABLED=true on the server to enable terminals.",
    });
  }
  return next();
}

function isPathInsideRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function resolveWorkspaceCwd(rootPath, cwd) {
  if (!cwd) return rootPath;
  const input = String(cwd || "").trim();
  const candidate = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(rootPath, input);
  if (!isPathInsideRoot(rootPath, candidate)) {
    throw new Error("Requested cwd is outside the workspace root.");
  }
  return candidate;
}

// -------- REST Routes --------

// POST /api/terminal/session
// Create a new terminal session tied to a workspace
router.post("/session", requireTerminalEnabled, (req, res) => {
  if (!pty) {
    return res.status(503).json({ error: "Terminal not available" });
  }

  const { workspaceSessionId, cwd } = req.body || {};
  const terminalId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Windows: use PowerShell; Unix: use bash
  const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
  const shellArgs = os.platform() === "win32" ? [] : [];

  let workingDir = os.homedir();
  if (workspaceSessionId) {
    const workspace = getWorkspaceSessionById(workspaceSessionId);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace session not found" });
    }
    try {
      workingDir = resolveWorkspaceCwd(workspace.rootPath, cwd);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  } else if (cwd) {
    workingDir = path.resolve(String(cwd));
  }

  try {
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    sessions.set(terminalId, {
      ptyProcess,
      workspaceSessionId: workspaceSessionId || null,
      name: `Terminal ${sessions.size + 1}`,
      shell,
      cwd: workingDir,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[Terminal] Session created: ${terminalId} (shell: ${shell}, cwd: ${workingDir})`
    );

    res.json({
      terminalId,
      shell,
      cwd: workingDir,
      workspaceSessionId: workspaceSessionId || null,
    });
  } catch (err) {
    console.error("[Terminal] Failed to spawn shell:", err);
    res
      .status(500)
      .json({ error: "Failed to start terminal", details: err.message });
  }
});

// GET /api/terminal/workspace/:workspaceSessionId
// List all terminal sessions for a workspace
router.get(
  "/workspace/:workspaceSessionId",
  requireTerminalEnabled,
  (req, res) => {
    const { workspaceSessionId } = req.params;
    const result = [];

    sessions.forEach((session, terminalId) => {
      if (session.workspaceSessionId === workspaceSessionId) {
        result.push({
          terminalId,
          createdAt: session.createdAt,
          name: session.name || terminalId,
          shell: session.shell,
          cwd: session.cwd,
          isClosed: false,
          workspaceSessionId,
        });
      }
    });

    res.json({ terminals: result });
  }
);

// PATCH /api/terminal/:terminalId
// Resize the terminal (cols/rows)
router.patch("/:terminalId", requireTerminalEnabled, (req, res) => {
  const { terminalId } = req.params;
  const { cols, rows } = req.body || {};
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  try {
    session.ptyProcess.resize(
      Math.max(1, parseInt(cols, 10) || 80),
      Math.max(1, parseInt(rows, 10) || 24)
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/terminal/:terminalId/input
// Send input to terminal (REST fallback -- socket.io is preferred)
router.post("/:terminalId/input", requireTerminalEnabled, (req, res) => {
  const { terminalId } = req.params;
  const { data, text } = req.body || {};
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  const input = typeof data === "string" ? data : typeof text === "string" ? text : "";
  if (input) {
    session.ptyProcess.write(input);
  }
  res.json({ ok: true });
});

// GET /api/terminal/:terminalId/stream
// SSE stream -- used as fallback if socket.io is unavailable
router.get("/:terminalId/stream", requireTerminalEnabled, (req, res) => {
  const { terminalId } = req.params;
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const readyPayload = JSON.stringify({
    type: "system",
    data: "ready",
    timestamp: new Date().toISOString(),
  });
  res.write(`event: ready\n`);
  res.write(`data: ${readyPayload}\n\n`);

  const onData = (data) => {
    res.write(
      `data: ${JSON.stringify({
        type: "stdout",
        data,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  };

  const dataDisposable = session.ptyProcess.onData(onData);
  const exitDisposable = session.ptyProcess.onExit(({ exitCode }) => {
    res.write(
      `data: ${JSON.stringify({
        type: "exit",
        data: `Process exited with code ${exitCode}`,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  });

  req.on("close", () => {
    console.log(`[Terminal] SSE stream closed: ${terminalId}`);
    if (dataDisposable && typeof dataDisposable.dispose === "function") {
      dataDisposable.dispose();
    }
    if (exitDisposable && typeof exitDisposable.dispose === "function") {
      exitDisposable.dispose();
    }
  });
});

// DELETE /api/terminal/:terminalId
// Kill and remove a terminal session
router.delete("/:terminalId", requireTerminalEnabled, (req, res) => {
  const { terminalId } = req.params;
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  try {
    session.ptyProcess.kill();
    sessions.delete(terminalId);
    console.log(`[Terminal] Session killed: ${terminalId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------- Socket.io Setup --------

function setupTerminalSocket(httpServer) {
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    let attachedTerminalId = null;
    let dataDisposable = null;
    let exitDisposable = null;

    // Client joins an existing terminal session
    socket.on("terminal:attach", (terminalId) => {
      const session = sessions.get(terminalId);
      if (!session) {
        socket.emit("terminal:error", `Session ${terminalId} not found`);
        return;
      }

      attachedTerminalId = terminalId;

      if (dataDisposable && typeof dataDisposable.dispose === "function") {
        dataDisposable.dispose();
      }
      if (exitDisposable && typeof exitDisposable.dispose === "function") {
        exitDisposable.dispose();
      }

      // Stream pty output -> frontend
      dataDisposable = session.ptyProcess.onData((data) => {
        socket.emit("terminal:output", data);
      });

      // Handle pty exit
      exitDisposable = session.ptyProcess.onExit(({ exitCode }) => {
        socket.emit("terminal:exit", { exitCode });
        sessions.delete(terminalId);
      });

      socket.emit("terminal:ready", { terminalId });
      console.log(`[Terminal] Socket ${socket.id} attached to ${terminalId}`);
    });

    // Frontend -> pty input
    socket.on("terminal:input", (data) => {
      if (!attachedTerminalId) return;
      const session = sessions.get(attachedTerminalId);
      if (session) session.ptyProcess.write(data);
    });

    // Frontend requests resize
    socket.on("terminal:resize", ({ cols, rows }) => {
      if (!attachedTerminalId) return;
      const session = sessions.get(attachedTerminalId);
      if (session) {
        session.ptyProcess.resize(
          Math.max(1, cols || 80),
          Math.max(1, rows || 24)
        );
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      if (dataDisposable && typeof dataDisposable.dispose === "function") {
        dataDisposable.dispose();
      }
      if (exitDisposable && typeof exitDisposable.dispose === "function") {
        exitDisposable.dispose();
      }
    });
  });

  console.log("[Terminal] Socket.io attached to server");
}

module.exports = router;
module.exports.setupTerminalSocket = setupTerminalSocket;

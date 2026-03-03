const express = require("express");
const router = express.Router();
const os = require("os");
const { Server } = require("socket.io");

// node-pty is a native module — must be rebuilt for Electron
// Run: npx electron-rebuild -f -w node-pty  (after Electron setup)
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  console.warn("[Terminal] node-pty not available:", e.message);
}

// Store active terminal sessions: terminalId → { ptyProcess, workspaceSessionId }
const sessions = new Map();

// ─── REST Routes ────────────────────────────────────────────────────────────

// POST /api/terminal/session
// Create a new terminal session tied to a workspace
router.post("/session", (req, res) => {
  if (!pty) {
    return res.status(503).json({ error: "Terminal not available" });
  }

  const { workspaceSessionId, cwd } = req.body;
  const terminalId = `term_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  // Windows: use PowerShell; Unix: use bash
  const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
  const shellArgs = os.platform() === "win32" ? [] : [];

  // Use provided cwd or fallback to home directory
  const workingDir = cwd || os.homedir();

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
router.get("/workspace/:workspaceSessionId", (req, res) => {
  const { workspaceSessionId } = req.params;
  const result = [];

  sessions.forEach((session, terminalId) => {
    if (session.workspaceSessionId === workspaceSessionId) {
      result.push({
        terminalId,
        createdAt: session.createdAt,
        workspaceSessionId,
      });
    }
  });

  res.json(result);
});

// PATCH /api/terminal/:terminalId
// Resize the terminal (cols/rows)
router.patch("/:terminalId", (req, res) => {
  const { terminalId } = req.params;
  const { cols, rows } = req.body;
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  try {
    session.ptyProcess.resize(
      Math.max(1, parseInt(cols) || 80),
      Math.max(1, parseInt(rows) || 24)
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/terminal/:terminalId/input
// Send input to terminal (REST fallback — socket.io is preferred)
router.post("/:terminalId/input", (req, res) => {
  const { terminalId } = req.params;
  const { data } = req.body;
  const session = sessions.get(terminalId);

  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  session.ptyProcess.write(data);
  res.json({ ok: true });
});

// GET /api/terminal/:terminalId/stream
// SSE stream — used as fallback if socket.io is unavailable
router.get("/:terminalId/stream", (req, res) => {
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

  const onData = (data) => {
    res.write(`data: ${JSON.stringify({ output: data })}\n\n`);
  };

  session.ptyProcess.onData(onData);

  req.on("close", () => {
    console.log(`[Terminal] SSE stream closed: ${terminalId}`);
  });
});

// DELETE /api/terminal/:terminalId
// Kill and remove a terminal session
router.delete("/:terminalId", (req, res) => {
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

// ─── Socket.io Setup ─────────────────────────────────────────────────────────

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

    // Client joins an existing terminal session
    socket.on("terminal:attach", (terminalId) => {
      const session = sessions.get(terminalId);
      if (!session) {
        socket.emit("terminal:error", `Session ${terminalId} not found`);
        return;
      }

      attachedTerminalId = terminalId;

      // Stream pty output → frontend
      session.ptyProcess.onData((data) => {
        socket.emit("terminal:output", data);
      });

      // Handle pty exit
      session.ptyProcess.onExit(({ exitCode }) => {
        socket.emit("terminal:exit", { exitCode });
        sessions.delete(terminalId);
      });

      socket.emit("terminal:ready", { terminalId });
      console.log(`[Terminal] Socket ${socket.id} attached to ${terminalId}`);
    });

    // Frontend → pty input
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
    });
  });

  console.log("[Terminal] Socket.io attached to server");
}

module.exports = router;
module.exports.setupTerminalSocket = setupTerminalSocket;

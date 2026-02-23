const express = require("express");
const { spawn } = require("child_process");
const {
  getWorkspaceSessionById,
  upsertTerminalSession,
  getTerminalSession,
  listWorkspaceTerminals,
  renameTerminalSession,
  closeAndRemoveTerminal,
} = require("../state/runtime");

const router = express.Router();

const MAX_BUFFER_EVENTS = 1000;

function isTerminalEnabled() {
  return process.env.TERMINAL_ENABLED === "true";
}

function toEventPayload(type, data) {
  return {
    type,
    data,
    timestamp: new Date().toISOString(),
  };
}

function writeSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastTerminalEvent(terminalSession, payload) {
  terminalSession.buffer.push(payload);
  if (terminalSession.buffer.length > MAX_BUFFER_EVENTS) {
    terminalSession.buffer.shift();
  }
  for (const subscriber of terminalSession.subscribers) {
    try {
      writeSseEvent(subscriber, "message", payload);
    } catch {
      // Subscriber may already be gone.
    }
  }
}

function getShellCommand() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: [],
    };
  }
  return {
    command: process.env.SHELL || "/bin/zsh",
    args: ["-i"],
  };
}

router.post("/session", (req, res) => {
  try {
    if (!isTerminalEnabled()) {
      return res.status(403).json({
        error: "Terminal is disabled",
        details: "Set TERMINAL_ENABLED=true to enable terminal execution.",
      });
    }

    const { workspaceSessionId, name } = req.body || {};
    if (!workspaceSessionId) {
      return res.status(400).json({ error: "workspaceSessionId is required" });
    }

    const workspaceSession = getWorkspaceSessionById(workspaceSessionId);
    if (!workspaceSession) {
      return res.status(404).json({ error: "Workspace session not found" });
    }

    const shell = getShellCommand();
    const shellProcess = spawn(shell.command, shell.args, {
      cwd: workspaceSession.rootPath,
      env: process.env,
      shell: false,
      detached: false,
    });

    const terminalSession = upsertTerminalSession({
      workspaceSessionId,
      process: shellProcess,
      shell: shell.command,
      cwd: workspaceSession.rootPath,
      name,
      subscribers: new Set(),
      buffer: [],
    });

    shellProcess.stdout.on("data", (chunk) => {
      broadcastTerminalEvent(terminalSession, toEventPayload("stdout", chunk.toString()));
    });

    shellProcess.stderr.on("data", (chunk) => {
      broadcastTerminalEvent(terminalSession, toEventPayload("stderr", chunk.toString()));
    });

    shellProcess.on("close", (code) => {
      terminalSession.isClosed = true;
      broadcastTerminalEvent(
        terminalSession,
        toEventPayload("exit", `Terminal process exited with code ${code}`)
      );
    });

    shellProcess.on("error", (error) => {
      broadcastTerminalEvent(
        terminalSession,
        toEventPayload("error", error.message || "Terminal process error")
      );
    });

    broadcastTerminalEvent(
      terminalSession,
      toEventPayload("system", `Terminal started in ${workspaceSession.rootPath}`)
    );

    return res.json({
      terminalId: terminalSession.id,
      name: terminalSession.name,
      workspaceSessionId,
      cwd: workspaceSession.rootPath,
      shell: shell.command,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create terminal session",
      details: error.message,
    });
  }
});

router.get("/workspace/:workspaceSessionId", (req, res) => {
  if (!isTerminalEnabled()) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const workspaceSessionId = req.params.workspaceSessionId;
  const workspaceSession = getWorkspaceSessionById(workspaceSessionId);
  if (!workspaceSession) {
    return res.status(404).json({ error: "Workspace session not found" });
  }

  const sessions = listWorkspaceTerminals(workspaceSessionId).map((session) => ({
    terminalId: session.id,
    name: session.name,
    workspaceSessionId: session.workspaceSessionId,
    cwd: session.cwd,
    shell: session.shell,
    isClosed: session.isClosed,
    createdAt: session.createdAt,
    updatedAt: session.lastAccessedAt,
  }));

  return res.json({ terminals: sessions });
});

router.get("/:terminalId/stream", (req, res) => {
  if (!isTerminalEnabled()) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const terminalSession = getTerminalSession(req.params.terminalId);
  if (!terminalSession) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  writeSseEvent(res, "ready", {
    terminalId: terminalSession.id,
    cwd: terminalSession.cwd,
    shell: terminalSession.shell,
  });

  const replayBuffer = terminalSession.buffer.slice(-200);
  for (const event of replayBuffer) {
    writeSseEvent(res, "message", event);
  }

  terminalSession.subscribers.add(res);

  const heartbeatInterval = setInterval(() => {
    try {
      writeSseEvent(res, "heartbeat", { timestamp: new Date().toISOString() });
    } catch {
      // No-op.
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    terminalSession.subscribers.delete(res);
  });
});

router.post("/:terminalId/input", (req, res) => {
  if (!isTerminalEnabled()) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const terminalSession = getTerminalSession(req.params.terminalId);
  if (!terminalSession) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  if (terminalSession.isClosed) {
    return res.status(400).json({ error: "Terminal session is closed" });
  }

  const inputText = typeof req.body?.text === "string" ? req.body.text : "";
  if (!inputText) {
    return res.status(400).json({ error: "text is required" });
  }

  terminalSession.process.stdin.write(inputText);
  broadcastTerminalEvent(terminalSession, toEventPayload("stdin", inputText));
  return res.json({ success: true });
});

router.post("/:terminalId/resize", (req, res) => {
  if (!isTerminalEnabled()) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const terminalSession = getTerminalSession(req.params.terminalId);
  if (!terminalSession) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  terminalSession.cols = Number(req.body?.cols) || terminalSession.cols || 120;
  terminalSession.rows = Number(req.body?.rows) || terminalSession.rows || 30;
  return res.json({ success: true, cols: terminalSession.cols, rows: terminalSession.rows });
});

router.patch("/:terminalId", (req, res) => {
  if (!isTerminalEnabled()) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const { name } = req.body || {};
  if (!name || String(name).trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }

  const session = renameTerminalSession(req.params.terminalId, String(name).trim());
  if (!session) {
    return res.status(404).json({ error: "Terminal session not found" });
  }

  return res.json({
    success: true,
    terminalId: session.id,
    name: session.name,
  });
});

router.delete("/:terminalId", (req, res) => {
  const terminalSession = getTerminalSession(req.params.terminalId);
  if (!terminalSession) {
    return res.status(404).json({ error: "Terminal session not found" });
  }
  closeAndRemoveTerminal(req.params.terminalId);
  return res.json({ success: true });
});

module.exports = router;

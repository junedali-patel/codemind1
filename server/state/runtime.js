const { randomUUID } = require("crypto");

const WORKSPACE_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const TERMINAL_SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6h

const workspaceSessions = new Map();
const workspaceKeyToSessionId = new Map();
const terminalSessions = new Map();
const workspaceToTerminalIds = new Map();
const extensionHostSessions = new Map();

function now() {
  return Date.now();
}

function makeWorkspaceKey(owner, repo) {
  return `${owner}/${repo}`.toLowerCase();
}

function makeLocalWorkspaceKey(rootPath) {
  return `local:${String(rootPath || "").toLowerCase()}`;
}

function touchWorkspace(sessionId) {
  const session = workspaceSessions.get(sessionId);
  if (session) {
    session.lastAccessedAt = now();
  }
  return session;
}

function upsertWorkspaceSession(payload) {
  const id = payload.id || randomUUID();
  const session = {
    id,
    owner: payload.owner,
    repo: payload.repo,
    token: payload.token,
    key: payload.key || makeWorkspaceKey(payload.owner, payload.repo),
    rootPath: payload.rootPath,
    branch: payload.branch || "main",
    kind: payload.kind || "repo",
    provider: payload.provider || "github",
    displayName:
      payload.displayName ||
      (payload.owner && payload.repo
        ? `${payload.owner}/${payload.repo}`
        : payload.rootPath || "workspace"),
    isGitRepo: payload.isGitRepo !== false,
    approvedRootId: payload.approvedRootId || null,
    createdAt: payload.createdAt || now(),
    lastAccessedAt: now(),
  };
  workspaceSessions.set(id, session);
  workspaceKeyToSessionId.set(session.key, id);
  return session;
}

function getWorkspaceSessionById(sessionId) {
  return touchWorkspace(sessionId);
}

function getWorkspaceSessionByKey(key) {
  const sessionId = workspaceKeyToSessionId.get(key);
  if (!sessionId) return null;
  return touchWorkspace(sessionId) || null;
}

function removeWorkspaceSession(sessionId) {
  const session = workspaceSessions.get(sessionId);
  if (!session) return;
  const terminalIds = workspaceToTerminalIds.get(sessionId);
  if (terminalIds) {
    for (const terminalId of terminalIds) {
      closeAndRemoveTerminal(terminalId);
    }
    workspaceToTerminalIds.delete(sessionId);
  }

  stopExtensionHostForWorkspace(sessionId);
  workspaceSessions.delete(sessionId);
  if (workspaceKeyToSessionId.get(session.key) === sessionId) {
    workspaceKeyToSessionId.delete(session.key);
  }
}

function upsertTerminalSession(payload) {
  const id = payload.id || randomUUID();
  const workspaceSessionId = payload.workspaceSessionId;
  const existingTerminalCount = listWorkspaceTerminals(workspaceSessionId).length;
  const terminalSession = {
    id,
    workspaceSessionId,
    process: payload.process,
    shell: payload.shell,
    cwd: payload.cwd,
    name: payload.name || `Terminal ${existingTerminalCount + 1}`,
    subscribers: payload.subscribers || new Set(),
    buffer: payload.buffer || [],
    isClosed: false,
    cols: payload.cols || 120,
    rows: payload.rows || 30,
    createdAt: payload.createdAt || now(),
    lastAccessedAt: now(),
  };
  terminalSessions.set(id, terminalSession);

  const terminalIds = workspaceToTerminalIds.get(workspaceSessionId) || new Set();
  terminalIds.add(id);
  workspaceToTerminalIds.set(workspaceSessionId, terminalIds);

  return terminalSession;
}

function touchTerminal(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (session) {
    session.lastAccessedAt = now();
  }
  return session;
}

function getTerminalSession(sessionId) {
  return touchTerminal(sessionId);
}

function listWorkspaceTerminals(workspaceSessionId) {
  const terminalIds = workspaceToTerminalIds.get(workspaceSessionId);
  if (!terminalIds) return [];

  const sessions = [];
  for (const terminalId of terminalIds) {
    const session = touchTerminal(terminalId);
    if (session) {
      sessions.push(session);
      continue;
    }
    terminalIds.delete(terminalId);
  }

  if (terminalIds.size === 0) {
    workspaceToTerminalIds.delete(workspaceSessionId);
  }

  return sessions.sort((a, b) => a.createdAt - b.createdAt);
}

function renameTerminalSession(sessionId, name) {
  const session = terminalSessions.get(sessionId);
  if (!session) return null;
  session.name = String(name || "").trim() || session.name;
  session.lastAccessedAt = now();
  return session;
}

function closeAndRemoveTerminal(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (!session) return;
  session.isClosed = true;
  try {
    if (session.process && !session.process.killed) {
      session.process.kill("SIGTERM");
    }
  } catch {
    // best effort
  }
  for (const subscriber of session.subscribers) {
    try {
      subscriber.end();
    } catch {
      // ignore broken subscribers
    }
  }

  const terminalIds = workspaceToTerminalIds.get(session.workspaceSessionId);
  if (terminalIds) {
    terminalIds.delete(sessionId);
    if (terminalIds.size === 0) {
      workspaceToTerminalIds.delete(session.workspaceSessionId);
    }
  }

  terminalSessions.delete(sessionId);
}

function startExtensionHostForWorkspace(workspaceSessionId, payload = {}) {
  const session = {
    workspaceSessionId,
    status: "running",
    process: payload.process || null,
    pid: payload.pid || null,
    capabilities: payload.capabilities || [],
    commands: payload.commands || [],
    subscribers: payload.subscribers || new Set(),
    createdAt: now(),
    updatedAt: now(),
    events: payload.events || [],
  };
  extensionHostSessions.set(workspaceSessionId, session);
  return session;
}

function getExtensionHostForWorkspace(workspaceSessionId) {
  return extensionHostSessions.get(workspaceSessionId) || null;
}

function listExtensionHostSessions() {
  return Array.from(extensionHostSessions.values());
}

function stopExtensionHostForWorkspace(workspaceSessionId) {
  const session = extensionHostSessions.get(workspaceSessionId);
  if (!session) return;
  try {
    if (session.process && !session.process.killed) {
      session.process.kill("SIGTERM");
    }
  } catch {
    // best effort
  }
  for (const subscriber of session.subscribers || []) {
    try {
      subscriber.end();
    } catch {
      // no-op
    }
  }
  extensionHostSessions.delete(workspaceSessionId);
}

function upsertExtensionHostEvent(workspaceSessionId, event) {
  const hostSession = extensionHostSessions.get(workspaceSessionId);
  if (!hostSession) return null;
  hostSession.updatedAt = now();
  hostSession.events.push(event);
  if (hostSession.events.length > 500) {
    hostSession.events.shift();
  }
  for (const subscriber of hostSession.subscribers || []) {
    try {
      subscriber.write(`event: message\n`);
      subscriber.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // subscriber might be closed
    }
  }
  return hostSession;
}

setInterval(() => {
  const currentTime = now();

  for (const [workspaceSessionId, workspaceSession] of workspaceSessions.entries()) {
    if (currentTime - workspaceSession.lastAccessedAt > WORKSPACE_SESSION_TTL_MS) {
      removeWorkspaceSession(workspaceSessionId);
    }
  }

  for (const [terminalSessionId, terminalSession] of terminalSessions.entries()) {
    if (currentTime - terminalSession.lastAccessedAt > TERMINAL_SESSION_TTL_MS) {
      closeAndRemoveTerminal(terminalSessionId);
    }
  }
}, 1000 * 60 * 5); // every 5 minutes

module.exports = {
  makeWorkspaceKey,
  makeLocalWorkspaceKey,
  upsertWorkspaceSession,
  getWorkspaceSessionById,
  getWorkspaceSessionByKey,
  removeWorkspaceSession,
  upsertTerminalSession,
  getTerminalSession,
  listWorkspaceTerminals,
  renameTerminalSession,
  closeAndRemoveTerminal,
  startExtensionHostForWorkspace,
  getExtensionHostForWorkspace,
  listExtensionHostSessions,
  stopExtensionHostForWorkspace,
  upsertExtensionHostEvent,
};

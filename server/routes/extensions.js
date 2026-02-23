const express = require("express");
const path = require("path");
const { fork } = require("child_process");
const {
  getInstalledExtensions,
  upsertInstalledExtension,
  updateInstalledExtension,
  removeInstalledExtension,
} = require("../state/extensions-registry");
const {
  getWorkspaceSessionById,
  startExtensionHostForWorkspace,
  getExtensionHostForWorkspace,
  listExtensionHostSessions,
  stopExtensionHostForWorkspace,
  upsertExtensionHostEvent,
} = require("../state/runtime");

const router = express.Router();

const OPEN_VSX_SEARCH_URL = "https://open-vsx.org/api/-/search";
const MARKETPLACE_PAGE_SIZE = 24;

function normalizeSource(input) {
  const source = String(input || "all").toLowerCase().trim();
  if (source === "openvsx" || source === "vscode") {
    return source;
  }
  return "all";
}

function toSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeOpenVsxResult(result) {
  const namespace = result.namespace || result.publisher || "unknown";
  const name = result.name || "";
  if (!name) return null;

  const version = result.version || result.latestVersion || "0.0.0";
  return {
    id: `${namespace}.${name}`,
    extensionId: `${namespace}.${name}`,
    source: "openvsx",
    publisher: namespace,
    name,
    displayName: result.displayName || name,
    version,
    description: result.description || "",
    iconUrl: result.files?.icon || result.iconUrl || "",
    downloadUrl: result.files?.download || "",
  };
}

async function fetchOpenVsxMarketplace(query, page) {
  const offset = Math.max(0, (page - 1) * MARKETPLACE_PAGE_SIZE);
  const params = new URLSearchParams({
    size: String(MARKETPLACE_PAGE_SIZE),
    offset: String(offset),
    sortBy: "relevance",
    sortOrder: "desc",
  });
  if (query) {
    params.set("query", query);
  }

  const response = await fetch(`${OPEN_VSX_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open VSX search failed (${response.status})`);
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.extensions) ? payload.extensions : [];
  const extensions = rawResults.map(normalizeOpenVsxResult).filter(Boolean);
  const total = Number(payload?.totalSize || payload?.total || extensions.length) || extensions.length;

  return {
    extensions,
    total,
  };
}

function notifyRunningHostsInstalledChanged() {
  const installedExtensions = getInstalledExtensions();
  const hostSessions = listExtensionHostSessions();

  for (const hostSession of hostSessions) {
    if (!hostSession?.process || hostSession.process.killed) continue;
    try {
      hostSession.process.send({
        type: "installed-updated",
        payload: {
          installedExtensions,
        },
      });
    } catch {
      // Ignore worker transport failures.
    }
  }
}

router.get("/marketplace", async (req, res) => {
  const query = String(req.query.query || "").trim();
  const source = normalizeSource(req.query.source);
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const enableOpenVsx = process.env.ENABLE_MARKETPLACE_OPENVSX !== "false";
  const enableVsCode = process.env.ENABLE_MARKETPLACE_VSCODE === "true";

  const warnings = [];
  let extensions = [];

  if ((source === "all" || source === "openvsx") && enableOpenVsx) {
    try {
      const openVsxResult = await fetchOpenVsxMarketplace(query, page);
      extensions = extensions.concat(openVsxResult.extensions);
    } catch (error) {
      warnings.push(error.message || "Open VSX marketplace request failed.");
    }
  } else if (source === "openvsx" && !enableOpenVsx) {
    warnings.push("Open VSX marketplace is disabled by feature flag.");
  }

  if (source === "all" || source === "vscode") {
    if (!enableVsCode) {
      warnings.push("VS Code marketplace is disabled by feature flag.");
    } else {
      warnings.push("VS Code marketplace adapter is not configured in this build.");
    }
  }

  const dedupedById = new Map();
  for (const extension of extensions) {
    if (!extension?.id) continue;
    if (!dedupedById.has(extension.id)) {
      dedupedById.set(extension.id, extension);
    }
  }

  return res.json({
    page,
    source,
    query,
    total: dedupedById.size,
    extensions: Array.from(dedupedById.values()),
    warnings,
  });
});

router.get("/installed", (_req, res) => {
  const extensions = getInstalledExtensions().map((extension) => ({
    ...extension,
    updateAvailable: false,
  }));
  return res.json({ extensions });
});

router.post("/install", (req, res) => {
  const {
    extensionId,
    source = "unknown",
    displayName,
    publisher,
    version,
    description,
    iconUrl,
    downloadUrl,
  } = req.body || {};

  if (!extensionId || String(extensionId).trim().length === 0) {
    return res.status(400).json({ error: "extensionId is required" });
  }

  const normalizedId = String(extensionId).trim();
  const extension = upsertInstalledExtension({
    id: normalizedId,
    source,
    displayName: displayName || normalizedId,
    publisher: publisher || normalizedId.split(".")[0] || "unknown",
    version: version || "0.0.0",
    description: description || "",
    iconUrl: iconUrl || "",
    downloadUrl: downloadUrl || "",
    enabled: true,
    status: "installed",
  });

  notifyRunningHostsInstalledChanged();
  return res.json({ success: true, extension });
});

router.post("/:id/enable", (req, res) => {
  const extensionId = String(req.params.id || "").trim();
  const extension = updateInstalledExtension(extensionId, {
    enabled: true,
    status: "enabled",
  });
  if (!extension) {
    return res.status(404).json({ error: "Extension not found" });
  }

  notifyRunningHostsInstalledChanged();
  return res.json({ success: true, extension });
});

router.post("/:id/disable", (req, res) => {
  const extensionId = String(req.params.id || "").trim();
  const extension = updateInstalledExtension(extensionId, {
    enabled: false,
    status: "disabled",
  });
  if (!extension) {
    return res.status(404).json({ error: "Extension not found" });
  }

  notifyRunningHostsInstalledChanged();
  return res.json({ success: true, extension });
});

router.delete("/:id", async (req, res) => {
  const extensionId = String(req.params.id || "").trim();
  const removed = await removeInstalledExtension(extensionId);
  if (!removed) {
    return res.status(404).json({ error: "Extension not found" });
  }

  notifyRunningHostsInstalledChanged();
  return res.json({ success: true, extensionId });
});

router.post("/:id/update", (req, res) => {
  const extensionId = String(req.params.id || "").trim();
  const nextVersion = String(req.body?.version || "").trim();
  const extension = updateInstalledExtension(extensionId, {
    version: nextVersion || undefined,
    status: "updated",
  });
  if (!extension) {
    return res.status(404).json({ error: "Extension not found" });
  }

  notifyRunningHostsInstalledChanged();
  return res.json({ success: true, extension });
});

router.post("/host/start", (req, res) => {
  const { workspaceSessionId } = req.body || {};
  if (!workspaceSessionId) {
    return res.status(400).json({ error: "workspaceSessionId is required" });
  }

  const workspaceSession = getWorkspaceSessionById(workspaceSessionId);
  if (!workspaceSession) {
    return res.status(404).json({ error: "Workspace session not found" });
  }

  const existingHost = getExtensionHostForWorkspace(workspaceSessionId);
  if (existingHost?.process && !existingHost.process.killed) {
    return res.json({
      success: true,
      workspaceSessionId,
      status: existingHost.status || "running",
      pid: existingHost.pid || null,
      commands: existingHost.commands || [],
    });
  }

  stopExtensionHostForWorkspace(workspaceSessionId);

  const workerPath = path.join(__dirname, "../workers/extension-host.js");
  const worker = fork(workerPath, [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });

  const installedExtensions = getInstalledExtensions();
  const hostSession = startExtensionHostForWorkspace(workspaceSessionId, {
    process: worker,
    pid: worker.pid,
    capabilities: [],
    commands: [],
    subscribers: new Set(),
    events: [],
  });

  const updateHostFromEvent = (event) => {
    const refreshedHost = getExtensionHostForWorkspace(workspaceSessionId);
    if (!refreshedHost) return;

    if (event.type === "host-ready") {
      refreshedHost.status = "running";
      refreshedHost.capabilities = event.payload?.capabilities || [];
    }
    if (event.type === "commands-updated") {
      refreshedHost.commands = event.payload?.commands || [];
    }
    if (event.type === "host-stopped") {
      refreshedHost.status = "stopped";
    }
  };

  worker.on("message", (message) => {
    if (!message?.type) return;
    upsertExtensionHostEvent(workspaceSessionId, message);
    updateHostFromEvent(message);
  });

  worker.on("exit", (code, signal) => {
    const exitEvent = {
      type: "worker-exit",
      payload: {
        code,
        signal,
      },
      timestamp: new Date().toISOString(),
    };
    upsertExtensionHostEvent(workspaceSessionId, exitEvent);
    const refreshedHost = getExtensionHostForWorkspace(workspaceSessionId);
    if (refreshedHost) {
      refreshedHost.status = "stopped";
    }
  });

  worker.send({
    type: "start",
    payload: {
      workspaceSessionId,
      installedExtensions,
    },
  });

  return res.json({
    success: true,
    workspaceSessionId,
    status: hostSession.status,
    pid: worker.pid,
  });
});

router.post("/host/stop", (req, res) => {
  const { workspaceSessionId } = req.body || {};
  if (!workspaceSessionId) {
    return res.status(400).json({ error: "workspaceSessionId is required" });
  }

  const hostSession = getExtensionHostForWorkspace(workspaceSessionId);
  if (!hostSession) {
    return res.status(404).json({ error: "Extension host is not running for this workspace" });
  }

  try {
    if (hostSession.process && !hostSession.process.killed) {
      hostSession.process.send({ type: "stop" });
    }
  } catch {
    // best effort worker shutdown
  }

  stopExtensionHostForWorkspace(workspaceSessionId);
  return res.json({
    success: true,
    workspaceSessionId,
    status: "stopped",
  });
});

router.get("/host/events", (req, res) => {
  const workspaceSessionId = String(req.query.workspaceSessionId || "").trim();
  if (!workspaceSessionId) {
    return res.status(400).json({ error: "workspaceSessionId is required" });
  }

  const hostSession = getExtensionHostForWorkspace(workspaceSessionId);
  if (!hostSession) {
    return res.status(404).json({ error: "Extension host is not running for this workspace" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  toSseEvent(res, "ready", {
    workspaceSessionId,
    status: hostSession.status || "running",
    commands: hostSession.commands || [],
    capabilities: hostSession.capabilities || [],
  });

  const eventReplay = (hostSession.events || []).slice(-200);
  for (const event of eventReplay) {
    toSseEvent(res, "message", event);
  }

  hostSession.subscribers.add(res);
  const heartbeatInterval = setInterval(() => {
    toSseEvent(res, "heartbeat", {
      workspaceSessionId,
      timestamp: new Date().toISOString(),
    });
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    const currentHost = getExtensionHostForWorkspace(workspaceSessionId);
    if (currentHost) {
      currentHost.subscribers.delete(res);
    }
  });

  return undefined;
});

module.exports = router;

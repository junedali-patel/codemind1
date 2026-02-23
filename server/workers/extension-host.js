function normalizeCommandId(extensionId, suffix = "run") {
  const safeExtensionId = String(extensionId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  return `extension.${safeExtensionId}.${suffix}`;
}

function emit(type, payload = {}) {
  if (typeof process.send === "function") {
    process.send({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}

function buildCommands(installedExtensions) {
  const output = [];
  for (const extension of installedExtensions || []) {
    if (!extension.enabled) continue;

    output.push({
      id: normalizeCommandId(extension.id, "run"),
      title: `${extension.displayName || extension.id}: Run`,
      extensionId: extension.id,
      category: "extension",
    });
  }
  return output;
}

let workspaceSessionId = null;
let installedExtensions = [];
let commands = [];
let heartbeatInterval = null;

function startHost(payload) {
  workspaceSessionId = payload.workspaceSessionId || null;
  installedExtensions = Array.isArray(payload.installedExtensions)
    ? payload.installedExtensions
    : [];
  commands = buildCommands(installedExtensions);

  emit("host-ready", {
    workspaceSessionId,
    capabilities: [
      "commands.register",
      "configuration.read",
      "configuration.write",
      "languages.register",
      "tasks.contribute",
      "debug.contribute",
    ],
  });
  emit("commands-updated", {
    workspaceSessionId,
    commands,
  });

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    emit("host-heartbeat", {
      workspaceSessionId,
      installedCount: installedExtensions.length,
      commandCount: commands.length,
    });
  }, 15000);
}

function updateInstalled(payload) {
  installedExtensions = Array.isArray(payload.installedExtensions)
    ? payload.installedExtensions
    : [];
  commands = buildCommands(installedExtensions);
  emit("commands-updated", {
    workspaceSessionId,
    commands,
  });
}

function executeCommand(payload) {
  const commandId = payload?.commandId;
  const command = commands.find((item) => item.id === commandId);
  if (!command) {
    emit("command-result", {
      workspaceSessionId,
      commandId,
      success: false,
      output: `Command ${commandId} is not registered in extension host.`,
    });
    return;
  }

  emit("command-result", {
    workspaceSessionId,
    commandId: command.id,
    extensionId: command.extensionId,
    success: true,
    output: `Executed ${command.id}`,
  });
}

process.on("message", (message) => {
  const type = message?.type;
  if (type === "start") {
    startHost(message.payload || {});
    return;
  }
  if (type === "installed-updated") {
    updateInstalled(message.payload || {});
    return;
  }
  if (type === "execute-command") {
    executeCommand(message.payload || {});
    return;
  }
  if (type === "stop") {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    emit("host-stopped", { workspaceSessionId });
    process.exit(0);
  }
});

emit("worker-online", { pid: process.pid });

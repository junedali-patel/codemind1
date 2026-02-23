const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DATA_DIRECTORY = path.join(__dirname, "data");
const REGISTRY_FILE_PATH = path.join(DATA_DIRECTORY, "extensions-registry.json");
const VSIX_DIRECTORY_PATH = path.join(DATA_DIRECTORY, "extensions");

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function sanitizeFileToken(input) {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function loadRegistry() {
  ensureDirectory(DATA_DIRECTORY);
  if (!fs.existsSync(REGISTRY_FILE_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(REGISTRY_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function saveRegistry(entries) {
  ensureDirectory(DATA_DIRECTORY);
  fs.writeFileSync(REGISTRY_FILE_PATH, JSON.stringify(entries, null, 2), "utf8");
}

function getInstalledExtensions() {
  return loadRegistry().sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.installedAt || 0) || 0;
    const bTime = Date.parse(b.updatedAt || b.installedAt || 0) || 0;
    return bTime - aTime;
  });
}

function upsertInstalledExtension(entry) {
  const registry = loadRegistry();
  const nowIso = new Date().toISOString();
  const index = registry.findIndex((item) => item.id === entry.id);

  const merged = {
    id: entry.id,
    source: entry.source || "unknown",
    displayName: entry.displayName || entry.id,
    publisher: entry.publisher || "unknown",
    version: entry.version || "0.0.0",
    description: entry.description || "",
    iconUrl: entry.iconUrl || "",
    downloadUrl: entry.downloadUrl || "",
    enabled: entry.enabled !== false,
    status: entry.status || "installed",
    checksum: entry.checksum || null,
    vsixPath: entry.vsixPath || null,
    installedAt: entry.installedAt || nowIso,
    updatedAt: nowIso,
  };

  if (index === -1) {
    registry.push(merged);
  } else {
    registry[index] = {
      ...registry[index],
      ...merged,
      installedAt: registry[index].installedAt || nowIso,
      updatedAt: nowIso,
    };
  }

  saveRegistry(registry);
  return registry[index === -1 ? registry.length - 1 : index];
}

function updateInstalledExtension(extensionId, patch) {
  const registry = loadRegistry();
  const index = registry.findIndex((item) => item.id === extensionId);
  if (index === -1) return null;

  registry[index] = {
    ...registry[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  saveRegistry(registry);
  return registry[index];
}

async function removeInstalledExtension(extensionId) {
  const registry = loadRegistry();
  const index = registry.findIndex((item) => item.id === extensionId);
  if (index === -1) return null;

  const [removed] = registry.splice(index, 1);
  saveRegistry(registry);

  if (removed?.vsixPath) {
    try {
      await fsp.unlink(removed.vsixPath);
    } catch {
      // best effort cleanup
    }
  }

  return removed;
}

function getExtensionStoragePath(extensionId, version) {
  ensureDirectory(VSIX_DIRECTORY_PATH);
  const safeId = sanitizeFileToken(extensionId);
  const safeVersion = sanitizeFileToken(version || "latest");
  return path.join(VSIX_DIRECTORY_PATH, `${safeId}-${safeVersion}.vsix`);
}

module.exports = {
  getInstalledExtensions,
  upsertInstalledExtension,
  updateInstalledExtension,
  removeInstalledExtension,
  getExtensionStoragePath,
};

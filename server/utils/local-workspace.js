const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

function sanitizeRootId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function expandHome(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function isDirectory(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function deriveLabel(targetPath) {
  const base = path.basename(targetPath);
  return base || targetPath;
}

function parseRootToken(token, index) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  if (raw.includes("=")) {
    const [labelPart, pathPart] = raw.split("=");
    const absolutePath = path.resolve(expandHome(pathPart || ""));
    if (!isDirectory(absolutePath)) return null;
    const label = (labelPart || "").trim() || deriveLabel(absolutePath);
    const id = sanitizeRootId(label) || `root_${index + 1}`;
    return { id, label, absolutePath };
  }

  const absolutePath = path.resolve(expandHome(raw));
  if (!isDirectory(absolutePath)) return null;
  const label = deriveLabel(absolutePath);
  const id = sanitizeRootId(label) || `root_${index + 1}`;
  return { id, label, absolutePath };
}

function buildDefaultRoots() {
  const home = os.homedir();
  const candidates = [
    { id: "home", label: "Home", absolutePath: home },
    { id: "documents", label: "Documents", absolutePath: path.join(home, "Documents") },
    { id: "desktop", label: "Desktop", absolutePath: path.join(home, "Desktop") },
    { id: "code", label: "Code", absolutePath: path.join(home, "code") },
  ];

  return candidates.filter((entry) => isDirectory(entry.absolutePath));
}

function dedupeRoots(roots) {
  const seen = new Set();
  const output = [];
  for (const root of roots) {
    const key = path.resolve(root.absolutePath);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: root.id,
      label: root.label,
      absolutePath: key,
    });
  }
  return output;
}

function loadApprovedRoots() {
  const envValue = process.env.LOCAL_WORKSPACE_ROOTS || "";
  if (!envValue.trim()) {
    return buildDefaultRoots();
  }

  const tokens = envValue
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const parsed = tokens
    .map((token, index) => parseRootToken(token, index))
    .filter(Boolean);

  if (parsed.length === 0) {
    return buildDefaultRoots();
  }

  return dedupeRoots(parsed);
}

function normalizeRelativePath(relativePath) {
  return normalizeSlashes(relativePath).replace(/^\/+/, "");
}

async function realpathIfExists(targetPath) {
  try {
    return await fsp.realpath(targetPath);
  } catch {
    return null;
  }
}

async function resolveApprovedAbsolutePath(absolutePathInput, approvedRoots) {
  const absolutePath = path.resolve(expandHome(absolutePathInput));
  const resolvedTarget = await realpathIfExists(absolutePath);
  if (!resolvedTarget) {
    return { valid: false, reason: "Path does not exist" };
  }

  const directoryStat = await fsp.stat(resolvedTarget);
  if (!directoryStat.isDirectory()) {
    return { valid: false, reason: "Path must be a directory" };
  }

  for (const root of approvedRoots) {
    const resolvedRoot = await realpathIfExists(root.absolutePath);
    if (!resolvedRoot) continue;

    const withSeparator = resolvedRoot.endsWith(path.sep)
      ? resolvedRoot
      : `${resolvedRoot}${path.sep}`;
    const isSame = resolvedTarget === resolvedRoot;
    const isChild = resolvedTarget.startsWith(withSeparator);
    if (!isSame && !isChild) continue;

    const relativePath = normalizeRelativePath(path.relative(resolvedRoot, resolvedTarget));
    return {
      valid: true,
      normalizedPath: resolvedTarget,
      rootId: root.id,
      relativePath,
      rootPath: resolvedRoot,
      rootLabel: root.label,
    };
  }

  return { valid: false, reason: "Path is outside approved roots" };
}

async function resolveBrowsePath({ rootId, relativePath, approvedRoots }) {
  const root = approvedRoots.find((entry) => entry.id === rootId);
  if (!root) {
    throw new Error("Unknown rootId");
  }

  const rootReal = await fsp.realpath(root.absolutePath);
  const normalizedRelative = normalizeRelativePath(relativePath || "");
  const targetPath = path.resolve(rootReal, normalizedRelative);
  const targetReal = await fsp.realpath(targetPath);

  const withSeparator = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
  const isSame = targetReal === rootReal;
  const isChild = targetReal.startsWith(withSeparator);
  if (!isSame && !isChild) {
    throw new Error("Resolved path escaped approved root");
  }

  const stat = await fsp.stat(targetReal);
  if (!stat.isDirectory()) {
    throw new Error("Browse target must be a directory");
  }

  const normalizedPath = normalizeRelativePath(path.relative(rootReal, targetReal));
  return {
    root,
    rootReal,
    targetPath: targetReal,
    relativePath: normalizedPath,
  };
}

async function readDirectoryEntries(targetDirectoryPath, rootRealPath) {
  const entries = await fsp.readdir(targetDirectoryPath, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    if (entry.name === ".git") continue;

    const absoluteEntryPath = path.join(targetDirectoryPath, entry.name);
    let entryRealPath;
    try {
      entryRealPath = await fsp.realpath(absoluteEntryPath);
    } catch {
      continue;
    }

    const rootWithSeparator = rootRealPath.endsWith(path.sep)
      ? rootRealPath
      : `${rootRealPath}${path.sep}`;
    if (entryRealPath !== rootRealPath && !entryRealPath.startsWith(rootWithSeparator)) {
      continue;
    }

    const entryStat = await fsp.stat(entryRealPath);
    const isDirectoryEntry = entryStat.isDirectory();
    const relativePath = normalizeRelativePath(path.relative(rootRealPath, entryRealPath));
    let hasChildren = false;

    if (isDirectoryEntry) {
      try {
        const childEntries = await fsp.readdir(entryRealPath);
        hasChildren = childEntries.length > 0;
      } catch {
        hasChildren = false;
      }
    }

    output.push({
      name: entry.name,
      type: isDirectoryEntry ? "directory" : "file",
      relativePath,
      hasChildren,
    });
  }

  output.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return output;
}

module.exports = {
  loadApprovedRoots,
  resolveApprovedAbsolutePath,
  resolveBrowsePath,
  readDirectoryEntries,
  normalizeRelativePath,
  expandHome,
};

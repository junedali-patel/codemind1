const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  makeWorkspaceKey,
  makeLocalWorkspaceKey,
  upsertWorkspaceSession,
  getWorkspaceSessionById,
  getWorkspaceSessionByKey,
  removeWorkspaceSession,
} = require("../state/runtime");
const {
  loadApprovedRoots,
  resolveApprovedAbsolutePath,
  resolveBrowsePath,
  readDirectoryEntries,
} = require("../utils/local-workspace");

const router = express.Router();

const WORKSPACE_BASE_DIR = path.join(os.tmpdir(), "codemind-workspaces");
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const MAX_TREE_DEPTH_DEFAULT = 8;
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_FILE_BYTES = 1024 * 512;

function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function normalizeRelativePath(relPath) {
  return String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function isPathInsideRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function resolveWithinRoot(rootPath, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(rootPath, normalized);
  const normalizedRoot = path.resolve(rootPath);
  if (!isPathInsideRoot(normalizedRoot, absolutePath)) {
    throw new Error("Invalid path traversal attempt");
  }
  return absolutePath;
}

async function resolveReadableFilePath(rootPath, relativePath) {
  const absolutePath = resolveWithinRoot(rootPath, relativePath);
  const [rootRealPath, targetRealPath] = await Promise.all([
    fsp.realpath(rootPath),
    fsp.realpath(absolutePath),
  ]);

  if (!isPathInsideRoot(rootRealPath, targetRealPath)) {
    throw new Error("Resolved file path escaped workspace root");
  }

  return targetRealPath;
}

async function resolveWritableFilePath(rootPath, relativePath) {
  const absolutePath = resolveWithinRoot(rootPath, relativePath);
  const rootRealPath = await fsp.realpath(rootPath);

  let existingParentPath = path.dirname(absolutePath);
  while (!(await pathExists(existingParentPath))) {
    const nextParent = path.dirname(existingParentPath);
    if (nextParent === existingParentPath) {
      throw new Error("Unable to resolve writable path");
    }
    existingParentPath = nextParent;
  }

  const existingParentRealPath = await fsp.realpath(existingParentPath);
  if (!isPathInsideRoot(rootRealPath, existingParentRealPath)) {
    throw new Error("Resolved write path escaped workspace root");
  }

  if (await pathExists(absolutePath)) {
    const targetStat = await fsp.lstat(absolutePath);
    if (targetStat.isSymbolicLink()) {
      throw new Error("Refusing to overwrite symlink target");
    }
    const targetRealPath = await fsp.realpath(absolutePath);
    if (!isPathInsideRoot(rootRealPath, targetRealPath)) {
      throw new Error("Resolved file path escaped workspace root");
    }
  }

  return absolutePath;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

async function runGit(args, cwd) {
  const result = await spawnCommand("git", args, { cwd });
  if (result.code !== 0) {
    const details = result.stderr || result.stdout || `git ${args.join(" ")} failed`;
    throw new Error(details);
  }
  return result.stdout;
}

function isPickerCanceled(message) {
  const input = String(message || "").toLowerCase();
  return (
    input.includes("user canceled") ||
    input.includes("user cancelled") ||
    input.includes("dialogresult.cancel") ||
    input.includes("(-128)")
  );
}

function isCommandUnavailable(message) {
  const input = String(message || "").toLowerCase();
  return (
    input.includes("enoent") ||
    input.includes("not found") ||
    input.includes("is not recognized")
  );
}

function normalizePickedPath(rawPath) {
  return String(rawPath || "")
    .trim()
    .replace(/\r/g, "")
    .replace(/\/+$/, "");
}

async function pickLocalFolderNative() {
  if (process.platform === "darwin") {
    const result = await spawnCommand("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Select a local project folder for CodeMind")',
    ]);

    if (result.code !== 0) {
      const details = result.stderr || result.stdout;
      if (isPickerCanceled(details)) {
        return { supported: true, canceled: true, absolutePath: null };
      }
      if (isCommandUnavailable(details)) {
        return {
          supported: false,
          canceled: false,
          absolutePath: null,
          reason: "osascript unavailable",
        };
      }
      throw new Error(details || "Failed to open native folder picker");
    }

    const absolutePath = normalizePickedPath(result.stdout);
    if (!absolutePath) {
      return { supported: true, canceled: true, absolutePath: null };
    }
    return { supported: true, canceled: false, absolutePath };
  }

  if (process.platform === "win32") {
    const psScript = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      '$dialog.Description = "Select a local project folder for CodeMind"',
      "$dialog.ShowNewFolderButton = $false",
      "$result = $dialog.ShowDialog()",
      "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
    ].join("; ");

    const result = await spawnCommand("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-Command",
      psScript,
    ]);

    if (result.code !== 0) {
      const details = result.stderr || result.stdout;
      if (isPickerCanceled(details)) {
        return { supported: true, canceled: true, absolutePath: null };
      }
      if (isCommandUnavailable(details)) {
        return {
          supported: false,
          canceled: false,
          absolutePath: null,
          reason: "powershell unavailable",
        };
      }
      throw new Error(details || "Failed to open native folder picker");
    }

    const absolutePath = normalizePickedPath(result.stdout);
    if (!absolutePath) {
      return { supported: true, canceled: true, absolutePath: null };
    }
    return { supported: true, canceled: false, absolutePath };
  }

  if (process.platform === "linux") {
    const zenityResult = await spawnCommand("zenity", [
      "--file-selection",
      "--directory",
      "--title=Select a local project folder for CodeMind",
    ]);

    if (zenityResult.code === 0) {
      const absolutePath = normalizePickedPath(zenityResult.stdout);
      if (!absolutePath) {
        return { supported: true, canceled: true, absolutePath: null };
      }
      return { supported: true, canceled: false, absolutePath };
    }

    const zenityDetails = zenityResult.stderr || zenityResult.stdout;
    if (isPickerCanceled(zenityDetails)) {
      return { supported: true, canceled: true, absolutePath: null };
    }

    if (!isCommandUnavailable(zenityDetails)) {
      throw new Error(zenityDetails || "Failed to open native folder picker");
    }

    const kdialogResult = await spawnCommand("kdialog", [
      "--getexistingdirectory",
      os.homedir(),
      "--title",
      "Select a local project folder for CodeMind",
    ]);

    if (kdialogResult.code !== 0) {
      const kdialogDetails = kdialogResult.stderr || kdialogResult.stdout;
      if (isPickerCanceled(kdialogDetails)) {
        return { supported: true, canceled: true, absolutePath: null };
      }
      if (isCommandUnavailable(kdialogDetails)) {
        return {
          supported: false,
          canceled: false,
          absolutePath: null,
          reason: "No native picker available (zenity/kdialog not found)",
        };
      }
      throw new Error(kdialogDetails || "Failed to open native folder picker");
    }

    const absolutePath = normalizePickedPath(kdialogResult.stdout);
    if (!absolutePath) {
      return { supported: true, canceled: true, absolutePath: null };
    }
    return { supported: true, canceled: false, absolutePath };
  }

  return {
    supported: false,
    canceled: false,
    absolutePath: null,
    reason: `Unsupported platform: ${process.platform}`,
  };
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function makeAuthenticatedGitUrl(owner, repo, token) {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`;
}

async function getCurrentBranch(rootPath) {
  try {
    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], rootPath);
    return branch || "main";
  } catch {
    return "main";
  }
}

async function getDefaultRemoteBranch(rootPath) {
  try {
    const symbolicRef = await runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], rootPath);
    const parts = symbolicRef.split("/");
    return parts[parts.length - 1] || "main";
  } catch {
    return "main";
  }
}

async function detectGitRepository(rootPath) {
  try {
    const gitDirectoryPath = path.join(rootPath, ".git");
    const stat = await fsp.stat(gitDirectoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function ensureWorkspaceRepository({ owner, repo, token, rootPath }) {
  const authenticatedUrl = makeAuthenticatedGitUrl(owner, repo, token);
  const hasGitDir = await pathExists(path.join(rootPath, ".git"));
  const repoDirName = path.basename(rootPath);

  await fsp.mkdir(WORKSPACE_BASE_DIR, { recursive: true });

  if (!hasGitDir) {
    await runGit(["clone", authenticatedUrl, repoDirName], WORKSPACE_BASE_DIR);
    return getCurrentBranch(rootPath);
  }

  await runGit(["remote", "set-url", "origin", authenticatedUrl], rootPath);
  await runGit(["fetch", "--prune", "origin"], rootPath);

  const targetBranch = await getDefaultRemoteBranch(rootPath);
  await runGit(["checkout", targetBranch], rootPath);
  await runGit(["pull", "--ff-only", "origin", targetBranch], rootPath).catch(() => {});
  return getCurrentBranch(rootPath);
}

async function buildTree(rootPath, absoluteDir, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];

  const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    const absoluteEntryPath = path.join(absoluteDir, entry.name);
    const relativeEntryPath = normalizeRelativePath(path.relative(rootPath, absoluteEntryPath));

    if (entry.isDirectory()) {
      folders.push({
        id: relativeEntryPath,
        name: entry.name,
        type: "directory",
        children: await buildTree(rootPath, absoluteEntryPath, maxDepth, depth + 1),
      });
    } else if (entry.isFile()) {
      files.push({
        id: relativeEntryPath,
        name: entry.name,
        type: "file",
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

function parseGitStatus(statusOutput) {
  const lines = statusOutput.split("\n").filter(Boolean);
  const branchLine = lines[0] || "";
  const branch = branchLine.replace(/^##\s*/, "").split("...")[0] || "main";

  const staged = [];
  const unstaged = [];
  const untracked = [];

  for (const line of lines.slice(1)) {
    const x = line[0];
    const y = line[1];
    const filePath = line.slice(3).trim();
    if (!filePath) continue;

    if (x === "?" && y === "?") {
      untracked.push(filePath);
      continue;
    }
    if (x !== " " && x !== "?") {
      staged.push(filePath);
    }
    if (y !== " ") {
      unstaged.push(filePath);
    }
  }

  return {
    branch,
    staged,
    unstaged,
    untracked,
    raw: lines,
  };
}

async function collectSearchResults({
  rootPath,
  absoluteDir,
  query,
  regex,
  caseSensitive,
  results,
}) {
  if (results.length >= MAX_SEARCH_RESULTS) return;

  const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= MAX_SEARCH_RESULTS) break;
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    const absoluteEntryPath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await collectSearchResults({
        rootPath,
        absoluteDir: absoluteEntryPath,
        query,
        regex,
        caseSensitive,
        results,
      });
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = await fsp.stat(absoluteEntryPath);
    if (stat.size > MAX_SEARCH_FILE_BYTES) continue;

    const content = await fsp.readFile(absoluteEntryPath, "utf8");
    const lines = content.split("\n");
    const relativePath = normalizeRelativePath(path.relative(rootPath, absoluteEntryPath));

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      let matched = false;
      let column = -1;
      if (regex) {
        const execResult = regex.exec(line);
        if (execResult && typeof execResult.index === "number") {
          matched = true;
          column = execResult.index;
        }
      } else {
        const lineInput = caseSensitive ? line : line.toLowerCase();
        const queryInput = caseSensitive ? query : query.toLowerCase();
        column = lineInput.indexOf(queryInput);
        matched = column >= 0;
      }

      if (matched) {
        results.push({
          path: relativePath,
          line: lineIndex + 1,
          column: column + 1,
          preview: line.trim().slice(0, 300),
        });
      }
      if (results.length >= MAX_SEARCH_RESULTS) break;
    }
  }
}

function requireWorkspaceSession(req, res, next) {
  const sessionId = req.params.sessionId;
  const workspaceSession = getWorkspaceSessionById(sessionId);
  if (!workspaceSession) {
    return res.status(404).json({ error: "Workspace session not found" });
  }
  req.workspaceSession = workspaceSession;
  return next();
}

async function openRepositoryWorkspace(req, res) {
  try {
    const { owner, repo, token } = req.body || {};
    if (!owner || !repo || !token) {
      return res.status(400).json({ error: "owner, repo and token are required" });
    }

    const workspaceKey = makeWorkspaceKey(owner, repo);
    const existingSession = getWorkspaceSessionByKey(workspaceKey);
    if (existingSession && (await pathExists(existingSession.rootPath))) {
      existingSession.token = token;
      existingSession.kind = "repo";
      existingSession.provider = "github";
      existingSession.isGitRepo = true;
      existingSession.displayName = `${owner}/${repo}`;
      existingSession.branch = await getCurrentBranch(existingSession.rootPath);
      return res.json({
        sessionId: existingSession.id,
        kind: existingSession.kind,
        provider: existingSession.provider,
        displayName: existingSession.displayName,
        rootPath: existingSession.rootPath,
        branch: existingSession.branch,
        isGitRepo: true,
      });
    }

    const workspaceDirName = `${sanitizeSegment(owner)}__${sanitizeSegment(repo)}`;
    const workspaceRootPath = path.join(WORKSPACE_BASE_DIR, workspaceDirName);
    const branch = await ensureWorkspaceRepository({
      owner,
      repo,
      token,
      rootPath: workspaceRootPath,
    });

    const workspaceSession = upsertWorkspaceSession({
      owner,
      repo,
      token,
      key: workspaceKey,
      rootPath: workspaceRootPath,
      branch,
      kind: "repo",
      provider: "github",
      displayName: `${owner}/${repo}`,
      isGitRepo: true,
    });

    return res.json({
      sessionId: workspaceSession.id,
      kind: workspaceSession.kind,
      provider: workspaceSession.provider,
      displayName: workspaceSession.displayName,
      rootPath: workspaceSession.rootPath,
      branch: workspaceSession.branch,
      isGitRepo: workspaceSession.isGitRepo,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to open workspace",
      details: error.message,
    });
  }
}

router.post("/open-repo", openRepositoryWorkspace);
router.post("/open", openRepositoryWorkspace);

router.get("/local-roots", async (_req, res) => {
  try {
    const roots = loadApprovedRoots();
    return res.json({ roots });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to list local roots",
      details: error.message,
    });
  }
});

router.post("/validate-local-path", async (req, res) => {
  try {
    const { absolutePath } = req.body || {};
    if (!absolutePath || String(absolutePath).trim().length === 0) {
      return res.status(400).json({ error: "absolutePath is required" });
    }

    const approvedRoots = loadApprovedRoots();
    const validation = await resolveApprovedAbsolutePath(absolutePath, approvedRoots);
    if (!validation.valid) {
      return res.json({
        valid: false,
        normalizedPath: null,
        rootId: null,
        reason: validation.reason || "Path is invalid",
      });
    }

    return res.json({
      valid: true,
      normalizedPath: validation.normalizedPath,
      rootId: validation.rootId,
      relativePath: validation.relativePath,
      reason: null,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to validate local path",
      details: error.message,
    });
  }
});

router.post("/local-browse", async (req, res) => {
  try {
    const { rootId, relativePath = "" } = req.body || {};
    if (!rootId || String(rootId).trim().length === 0) {
      return res.status(400).json({ error: "rootId is required" });
    }

    const approvedRoots = loadApprovedRoots();
    const browseContext = await resolveBrowsePath({
      rootId,
      relativePath,
      approvedRoots,
    });

    const entries = await readDirectoryEntries(browseContext.targetPath, browseContext.rootReal);
    return res.json({
      rootId: browseContext.root.id,
      label: browseContext.root.label,
      rootPath: browseContext.rootReal,
      relativePath: browseContext.relativePath,
      entries,
    });
  } catch (error) {
    return res.status(400).json({
      error: "Failed to browse local path",
      details: error.message,
    });
  }
});

router.post("/local-picker", async (_req, res) => {
  try {
    const picker = await pickLocalFolderNative();
    return res.json(picker);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to open native folder picker",
      details: error.message,
    });
  }
});

router.post("/open-local", async (req, res) => {
  try {
    const { rootId, relativePath = "", absolutePath, confirm } = req.body || {};
    const approvedRoots = loadApprovedRoots();

    if (!Array.isArray(approvedRoots) || approvedRoots.length === 0) {
      return res.status(500).json({
        error: "No approved local roots configured",
      });
    }

    let normalizedTargetPath = "";
    let approvedRootId = null;

    if (absolutePath) {
      if (!confirm) {
        return res.status(400).json({ error: "confirm=true is required with absolutePath" });
      }

      const validation = await resolveApprovedAbsolutePath(absolutePath, approvedRoots);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Path is outside approved roots",
          details: validation.reason || "Path rejected",
        });
      }

      normalizedTargetPath = validation.normalizedPath;
      approvedRootId = validation.rootId;
    } else {
      if (!rootId) {
        return res.status(400).json({ error: "rootId is required when absolutePath is not provided" });
      }

      const browseContext = await resolveBrowsePath({
        rootId,
        relativePath,
        approvedRoots,
      });
      normalizedTargetPath = browseContext.targetPath;
      approvedRootId = browseContext.root.id;
    }

    const localWorkspaceKey = makeLocalWorkspaceKey(normalizedTargetPath);
    const existingSession = getWorkspaceSessionByKey(localWorkspaceKey);
    if (existingSession && (await pathExists(existingSession.rootPath))) {
      existingSession.kind = "local";
      existingSession.provider = "local";
      existingSession.approvedRootId = approvedRootId;
      existingSession.displayName = path.basename(existingSession.rootPath) || existingSession.rootPath;
      existingSession.isGitRepo = await detectGitRepository(existingSession.rootPath);
      existingSession.branch = existingSession.isGitRepo
        ? await getCurrentBranch(existingSession.rootPath)
        : "";

      return res.json({
        sessionId: existingSession.id,
        kind: existingSession.kind,
        provider: existingSession.provider,
        displayName: existingSession.displayName,
        rootPath: existingSession.rootPath,
        branch: existingSession.branch,
        isGitRepo: existingSession.isGitRepo,
      });
    }

    const isGitRepo = await detectGitRepository(normalizedTargetPath);
    const branch = isGitRepo ? await getCurrentBranch(normalizedTargetPath) : "";
    const displayName = path.basename(normalizedTargetPath) || normalizedTargetPath;

    const localSession = upsertWorkspaceSession({
      owner: "local",
      repo: displayName,
      token: null,
      key: localWorkspaceKey,
      rootPath: normalizedTargetPath,
      branch,
      kind: "local",
      provider: "local",
      displayName,
      isGitRepo,
      approvedRootId,
    });

    return res.json({
      sessionId: localSession.id,
      kind: localSession.kind,
      provider: localSession.provider,
      displayName: localSession.displayName,
      rootPath: localSession.rootPath,
      branch: localSession.branch,
      isGitRepo: localSession.isGitRepo,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to open local workspace",
      details: error.message,
    });
  }
});

router.get("/:sessionId/meta", requireWorkspaceSession, async (req, res) => {
  try {
    const workspaceSession = req.workspaceSession;
    const isGitRepo =
      workspaceSession.isGitRepo !== false
        ? await detectGitRepository(workspaceSession.rootPath)
        : false;

    workspaceSession.isGitRepo = isGitRepo;
    workspaceSession.branch = isGitRepo
      ? await getCurrentBranch(workspaceSession.rootPath)
      : "";

    return res.json({
      sessionId: workspaceSession.id,
      kind: workspaceSession.kind || "repo",
      provider: workspaceSession.provider || "github",
      displayName: workspaceSession.displayName || `${workspaceSession.owner}/${workspaceSession.repo}`,
      rootPath: workspaceSession.rootPath,
      branch: workspaceSession.branch,
      isGitRepo: workspaceSession.isGitRepo,
      approvedRootId: workspaceSession.approvedRootId || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load workspace metadata",
      details: error.message,
    });
  }
});

router.get("/:sessionId/tree", requireWorkspaceSession, async (req, res) => {
  try {
    const maxDepth = Number.parseInt(req.query.depth, 10) || MAX_TREE_DEPTH_DEFAULT;
    const tree = await buildTree(
      req.workspaceSession.rootPath,
      req.workspaceSession.rootPath,
      Math.max(1, Math.min(maxDepth, 20))
    );
    return res.json({ tree });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to build workspace tree",
      details: error.message,
    });
  }
});

router.get("/:sessionId/file", requireWorkspaceSession, async (req, res) => {
  try {
    const relativePath = req.query.path;
    if (!relativePath) {
      return res.status(400).json({ error: "path query parameter is required" });
    }
    const absolutePath = await resolveReadableFilePath(
      req.workspaceSession.rootPath,
      relativePath
    );
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: "Requested path is not a file" });
    }
    const content = await fsp.readFile(absolutePath, "utf8");
    return res.json({
      path: normalizeRelativePath(relativePath),
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to read file",
      details: error.message,
    });
  }
});

router.put("/:sessionId/file", requireWorkspaceSession, async (req, res) => {
  try {
    const { path: relativePath, content } = req.body || {};
    if (!relativePath || typeof content !== "string") {
      return res.status(400).json({ error: "path and string content are required" });
    }
    const absolutePath = await resolveWritableFilePath(
      req.workspaceSession.rootPath,
      relativePath
    );
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, content, "utf8");
    return res.json({ success: true, path: normalizeRelativePath(relativePath) });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to write file",
      details: error.message,
    });
  }
});

router.get("/:sessionId/status", requireWorkspaceSession, async (req, res) => {
  try {
    const isGitRepo =
      req.workspaceSession.isGitRepo !== false
        ? await detectGitRepository(req.workspaceSession.rootPath)
        : false;
    req.workspaceSession.isGitRepo = isGitRepo;

    if (!isGitRepo) {
      req.workspaceSession.branch = "";
      return res.json({
        branch: "",
        staged: [],
        unstaged: [],
        untracked: [],
        raw: [],
        isGitRepo: false,
      });
    }

    const statusOutput = await runGit(
      ["status", "--porcelain=1", "-b"],
      req.workspaceSession.rootPath
    );
    const parsed = parseGitStatus(statusOutput);
    req.workspaceSession.branch = parsed.branch;
    return res.json({
      ...parsed,
      isGitRepo: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch git status",
      details: error.message,
    });
  }
});

router.post("/:sessionId/stage", requireWorkspaceSession, async (req, res) => {
  try {
    const isGitRepo = await detectGitRepository(req.workspaceSession.rootPath);
    req.workspaceSession.isGitRepo = isGitRepo;
    if (!isGitRepo) {
      return res.status(400).json({
        error: "Source control unavailable",
        details: "This workspace is not a git repository.",
      });
    }

    const { paths = ["*"] } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: "paths must be a non-empty array" });
    }

    if (paths.length === 1 && paths[0] === "*") {
      await runGit(["add", "-A"], req.workspaceSession.rootPath);
    } else {
      const safePaths = paths.map((p) => normalizeRelativePath(p));
      for (const relPath of safePaths) {
        resolveWithinRoot(req.workspaceSession.rootPath, relPath);
      }
      await runGit(["add", "--", ...safePaths], req.workspaceSession.rootPath);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to stage files",
      details: error.message,
    });
  }
});

router.post("/:sessionId/commit", requireWorkspaceSession, async (req, res) => {
  try {
    const isGitRepo = await detectGitRepository(req.workspaceSession.rootPath);
    req.workspaceSession.isGitRepo = isGitRepo;
    if (!isGitRepo) {
      return res.status(400).json({
        error: "Source control unavailable",
        details: "This workspace is not a git repository.",
      });
    }

    const { message } = req.body || {};
    if (!message || String(message).trim().length === 0) {
      return res.status(400).json({ error: "Commit message is required" });
    }
    const output = await runGit(
      ["commit", "-m", String(message).trim()],
      req.workspaceSession.rootPath
    );
    return res.json({ success: true, output });
  } catch (error) {
    const details = error.message || "";
    const statusCode = /nothing to commit/i.test(details) ? 400 : 500;
    return res.status(statusCode).json({
      error: "Failed to commit changes",
      details,
    });
  }
});

router.post("/:sessionId/push", requireWorkspaceSession, async (req, res) => {
  try {
    const isGitRepo = await detectGitRepository(req.workspaceSession.rootPath);
    req.workspaceSession.isGitRepo = isGitRepo;
    if (!isGitRepo) {
      return res.status(400).json({
        error: "Source control unavailable",
        details: "This workspace is not a git repository.",
      });
    }

    const remote = req.body?.remote || "origin";
    const branch = req.body?.branch || (await getCurrentBranch(req.workspaceSession.rootPath));
    const output = await runGit(["push", remote, branch], req.workspaceSession.rootPath);
    req.workspaceSession.branch = branch;
    return res.json({ success: true, output, remote, branch });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to push changes",
      details: error.message,
    });
  }
});

router.post("/:sessionId/sync", requireWorkspaceSession, async (req, res) => {
  try {
    const isGitRepo = await detectGitRepository(req.workspaceSession.rootPath);
    req.workspaceSession.isGitRepo = isGitRepo;
    if (!isGitRepo) {
      return res.status(400).json({
        error: "Source control unavailable",
        details: "This workspace is not a git repository.",
      });
    }

    const mode = req.body?.mode || "fetch";
    const branch = await getCurrentBranch(req.workspaceSession.rootPath);
    if (mode === "pull") {
      await runGit(["pull", "--rebase", "origin", branch], req.workspaceSession.rootPath);
    } else {
      await runGit(["fetch", "--prune", "origin"], req.workspaceSession.rootPath);
    }
    req.workspaceSession.branch = branch;
    return res.json({ success: true, mode, branch });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to sync repository",
      details: error.message,
    });
  }
});

router.post("/:sessionId/search", requireWorkspaceSession, async (req, res) => {
  try {
    const { query, caseSensitive = false, regex = false } = req.body || {};
    if (!query || String(query).trim().length === 0) {
      return res.status(400).json({ error: "query is required" });
    }

    let regexPattern = null;
    if (regex) {
      regexPattern = new RegExp(String(query), caseSensitive ? "g" : "gi");
    }

    const matches = [];
    await collectSearchResults({
      rootPath: req.workspaceSession.rootPath,
      absoluteDir: req.workspaceSession.rootPath,
      query: String(query),
      regex: regexPattern,
      caseSensitive,
      results: matches,
    });

    return res.json({ matches, total: matches.length, truncated: matches.length >= MAX_SEARCH_RESULTS });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to search workspace",
      details: error.message,
    });
  }
});

router.delete("/:sessionId", requireWorkspaceSession, async (req, res) => {
  removeWorkspaceSession(req.workspaceSession.id);
  return res.json({ success: true });
});

module.exports = router;

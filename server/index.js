const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const aiRoutes = require("./routes/ai");
const githubRoutes = require("./routes/github");
const workspaceRoutes = require("./routes/workspace");
const terminalRoutes = require("./routes/terminal");
const extensionsRoutes = require("./routes/extensions");

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use("/tmp", express.static(path.join(__dirname, "../tmp")));

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    status: "Server is running",
    timestamp: new Date().toISOString(),
    port: PORT,
    terminalEnabled: process.env.TERMINAL_ENABLED === "true",
  });
});

app.use("/api/github", githubRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/terminal", terminalRoutes);
app.use("/api/extensions", extensionsRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} does not exist`,
    availableEndpoints: [
      "GET /health",
      "GET /api/github/auth/github-url",
      "GET /api/github/repos",
      "GET /api/github/repo-content",
      "POST /api/ai/complete",
      "POST /api/ai/analyze-repo",
      "POST /api/workspace/open-repo",
      "POST /api/workspace/open-local",
      "POST /api/workspace/open",
      "GET /api/workspace/local-roots",
      "POST /api/workspace/local-picker",
      "POST /api/workspace/open-local-picker",
      "POST /api/workspace/local-browse",
      "POST /api/workspace/validate-local-path",
      "GET /api/workspace/:sessionId/meta",
      "GET /api/workspace/:sessionId/tree",
      "GET /api/workspace/:sessionId/file",
      "PUT /api/workspace/:sessionId/file",
      "GET /api/workspace/:sessionId/status",
      "POST /api/workspace/:sessionId/stage",
      "POST /api/workspace/:sessionId/commit",
      "POST /api/workspace/:sessionId/push",
      "POST /api/workspace/:sessionId/sync",
      "POST /api/workspace/:sessionId/search",
      "POST /api/terminal/session",
      "GET /api/terminal/workspace/:workspaceSessionId",
      "GET /api/terminal/:terminalId/stream",
      "POST /api/terminal/:terminalId/input",
      "PATCH /api/terminal/:terminalId",
      "DELETE /api/terminal/:terminalId",
      "GET /api/extensions/marketplace",
      "GET /api/extensions/installed",
      "POST /api/extensions/install",
      "POST /api/extensions/:id/enable",
      "POST /api/extensions/:id/disable",
      "DELETE /api/extensions/:id",
      "POST /api/extensions/:id/update",
      "POST /api/extensions/host/start",
      "POST /api/extensions/host/stop",
      "GET /api/extensions/host/events",
    ],
  });
});

app.use((err, req, res, _next) => {
  console.error("[Error Handler]", {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Frontend origin: ${FRONTEND_URL}`);
  console.log(`Terminal enabled: ${process.env.TERMINAL_ENABLED === "true" ? "yes" : "no"}`);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

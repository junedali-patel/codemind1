const { spawn } = require("child_process");
const path = require("path");
const treeKill = require("tree-kill");

let serverProcess = null;

function startBackend() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "../server/index.js");

    serverProcess = spawn("node", [serverPath], {
      env: {
        ...process.env,
        PORT: "5000",
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      console.log(`[Backend]: ${data}`);
      // Resolve once server is ready
      if (
        data.toString().includes("listening") ||
        data.toString().includes("running")
      ) {
        resolve();
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error(`[Backend Error]: ${data}`);
    });

    serverProcess.on("error", reject);

    // Fallback: resolve after 3s even if no log
    setTimeout(resolve, 3000);
  });
}

function stopBackend() {
  if (serverProcess) {
    treeKill(serverProcess.pid);
    serverProcess = null;
  }
}

module.exports = { startBackend, stopBackend };

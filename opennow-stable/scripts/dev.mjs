import { spawn } from "node:child_process";

const child = spawn("electron-vite", ["dev"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.once("SIGINT", forwardSignal);
process.once("SIGTERM", forwardSignal);

child.once("exit", (code, signal) => {
  process.off("SIGINT", forwardSignal);
  process.off("SIGTERM", forwardSignal);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.once("error", (error) => {
  console.error(`Failed to start electron-vite dev: ${error.message}`);
  process.exit(1);
});

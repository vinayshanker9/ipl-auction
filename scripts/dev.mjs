import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const services = [
  ["api", ["run", "dev", "--workspace", "@crease/server"]],
  ["web", ["run", "dev", "--workspace", "@crease/client"]],
].map(([name, args]) => {
  const child = spawn(npm, args, { cwd: root, stdio: "inherit" });
  child.on("exit", code => {
    if (code && code !== 0) {
      console.error(`${name} process exited with code ${code}`);
      stop();
    }
  });
  return child;
});

function stop() {
  for (const child of services) if (!child.killed) child.kill("SIGINT");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

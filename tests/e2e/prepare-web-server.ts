import { spawn } from "node:child_process";
import { join } from "node:path";

import globalSetup, { removeE2EDatabaseFiles } from "./global-setup";
import { E2E_DATABASE_URL } from "./e2e-environment";

process.env.DATABASE_URL = E2E_DATABASE_URL;
await globalSetup();

const nextExecutable = join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const server = spawn(
  process.execPath,
  [nextExecutable, "dev", "--hostname", "127.0.0.1", "--port", "3100"],
  {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "inherit",
  },
);

function cleanupAfterServerExit() {
  try {
    removeE2EDatabaseFiles();
  } catch {
    // Windows can briefly retain SQLite handles while Next.js exits. The next
    // E2E run removes the same isolated temporary files before preparing data.
  }
}

server.once("exit", (code) => {
  cleanupAfterServerExit();
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.kill(signal);
  });
}

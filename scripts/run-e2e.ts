import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { removeE2EDatabaseFiles } from "../tests/e2e/global-setup";

const playwrightCli = join(
  process.cwd(),
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

let cleanupError: unknown;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    removeE2EDatabaseFiles();
    cleanupError = undefined;
    break;
  } catch (error: unknown) {
    cleanupError = error;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
}
if (cleanupError !== undefined) {
  throw new Error("Unable to remove the isolated E2E database.", {
    cause: cleanupError,
  });
}
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;

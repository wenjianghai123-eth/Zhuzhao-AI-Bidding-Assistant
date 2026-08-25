import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_DATABASE_PATH = join(
  tmpdir(),
  "zhuzhao-ai-bidding-assistant-e2e.db",
);
export const E2E_DATABASE_URL = `file:${E2E_DATABASE_PATH.replaceAll("\\", "/")}`;
export const E2E_BASE_URL = "http://127.0.0.1:3100";

import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_DATABASE_PATH = join(
  tmpdir(),
  "zhuzhao-ai-bidding-assistant-e2e.db",
);
const defaultE2EDatabaseUrl = `file:${E2E_DATABASE_PATH.replaceAll("\\", "/")}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? defaultE2EDatabaseUrl;
export const E2E_USES_POSTGRESQL =
  E2E_DATABASE_URL.startsWith("postgresql:") ||
  E2E_DATABASE_URL.startsWith("postgres:");
export const E2E_BASE_URL =
  process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

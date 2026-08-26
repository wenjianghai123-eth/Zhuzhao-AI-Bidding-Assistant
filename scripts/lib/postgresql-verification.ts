import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const pnpmCli =
  process.env.npm_execpath ??
  join(dirname(process.execPath), "node_modules", "corepack", "dist", "pnpm.js");

export function runPnpm(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: pnpm ${args.join(" ")}`);
  }
}

export function preparePostgresqlTestDatabase(testDatabaseUrl: string) {
  const environment = { ...process.env, DATABASE_URL: testDatabaseUrl };
  runPnpm(["exec", "tsx", "scripts/generate-postgresql-schema.ts"], environment);
  runPnpm(
    ["exec", "prisma", "generate", "--config", "prisma.postgresql.config.ts"],
    environment,
  );
  runPnpm(
    [
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--config",
      "prisma.postgresql.config.ts",
    ],
    environment,
  );
}

export function restoreSqlitePrismaClient() {
  runPnpm(["exec", "prisma", "generate"]);
}

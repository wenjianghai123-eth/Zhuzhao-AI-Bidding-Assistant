import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

import Database from "better-sqlite3";

const releaseTemporaryDirectory = mkdtempSync(
  join(tmpdir(), "zhuzhao-release-verification-"),
);
const releaseDatabasePath = join(releaseTemporaryDirectory, "release.db");
const releaseDatabaseUrl = `file:${releaseDatabasePath.replaceAll("\\", "/")}`;
const pnpmCli =
  process.env.npm_execpath ??
  join(dirname(process.execPath), "node_modules", "corepack", "dist", "pnpm.js");

function assertSafeTemporaryDirectory() {
  const resolvedTemporaryRoot = resolve(tmpdir()) + sep;
  const resolvedReleaseDirectory = resolve(releaseTemporaryDirectory);
  if (
    !resolvedReleaseDirectory.startsWith(resolvedTemporaryRoot) ||
    !basename(resolvedReleaseDirectory).startsWith(
      "zhuzhao-release-verification-",
    )
  ) {
    throw new Error("Release verification directory is outside the safe temporary scope.");
  }
}

function applyMigrations() {
  const database = new Database(releaseDatabasePath);
  try {
    const migrationsDirectory = join(process.cwd(), "prisma", "migrations");
    const migrationDirectories = readdirSync(migrationsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
    for (const migrationDirectory of migrationDirectories) {
      database.exec(
        readFileSync(
          join(migrationsDirectory, migrationDirectory, "migration.sql"),
          "utf8",
        ),
      );
    }
  } finally {
    database.close();
  }
}

function runScript(script: string) {
  const result = spawnSync(process.execPath, [pnpmCli, script], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: releaseDatabaseUrl },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Release verification command failed: pnpm ${script}`);
  }
}

assertSafeTemporaryDirectory();
applyMigrations();

try {
  for (const script of [
    "lint",
    "typecheck",
    "test",
    "build",
    "verify:qingbiao",
    "verify:dingbiao",
    "verify:global-analysis",
    "verify:business-golden",
    "verify:decimal-persistence",
    "verify:presentation",
    "verify:excel-export",
  ]) {
    runScript(script);
  }
} finally {
  assertSafeTemporaryDirectory();
  rmSync(releaseTemporaryDirectory, { recursive: true, force: true });
}

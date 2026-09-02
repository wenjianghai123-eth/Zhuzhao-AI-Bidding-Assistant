import "dotenv/config";

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { assertPostgresqlTestDatabaseTarget } from "../src/server/db/database-target-safety";
import {
  preparePostgresqlTestDatabase,
  restoreSqlitePrismaClient,
  runPnpm,
} from "./lib/postgresql-verification";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
assertPostgresqlTestDatabaseTarget(
  testDatabaseUrl,
  "cross-database Golden comparison",
);
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required.");
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "zhuzhao-cross-db-golden-"));
const sqliteSnapshotPath = join(temporaryDirectory, "sqlite.json");
const postgresqlSnapshotPath = join(temporaryDirectory, "postgresql.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findFirstDifference(
  sqliteValue: unknown,
  postgresqlValue: unknown,
  location = "$",
): string | undefined {
  if (Object.is(sqliteValue, postgresqlValue)) {
    return undefined;
  }
  if (Array.isArray(sqliteValue) && Array.isArray(postgresqlValue)) {
    if (sqliteValue.length !== postgresqlValue.length) {
      return `${location}.length: SQLite=${sqliteValue.length}, PostgreSQL=${postgresqlValue.length}`;
    }
    for (const [index, value] of sqliteValue.entries()) {
      const difference = findFirstDifference(
        value,
        postgresqlValue[index],
        `${location}[${index}]`,
      );
      if (difference) {
        return difference;
      }
    }
    return undefined;
  }
  if (isRecord(sqliteValue) && isRecord(postgresqlValue)) {
    const keys = [...new Set([...Object.keys(sqliteValue), ...Object.keys(postgresqlValue)])]
      .toSorted();
    for (const key of keys) {
      const difference = findFirstDifference(
        sqliteValue[key],
        postgresqlValue[key],
        `${location}.${key}`,
      );
      if (difference) {
        return difference;
      }
    }
    return undefined;
  }
  return `${location}: SQLite=${JSON.stringify(sqliteValue)}, PostgreSQL=${JSON.stringify(postgresqlValue)}`;
}

function assertSafeTemporaryDirectory() {
  const resolvedTemporaryRoot = resolve(tmpdir()) + sep;
  if (!resolve(temporaryDirectory).startsWith(resolvedTemporaryRoot)) {
    throw new Error("Cross-database snapshots escaped the system temporary directory.");
  }
}

try {
  restoreSqlitePrismaClient();
  runPnpm(
    [
      "exec",
      "vitest",
      "run",
      "src/domain/regression/20260828-full-golden.test.ts",
      "--reporter=verbose",
    ],
    { ...process.env, GOLDEN_SNAPSHOT_PATH: sqliteSnapshotPath },
  );

  preparePostgresqlTestDatabase(testDatabaseUrl);
  runPnpm(
    [
      "exec",
      "vitest",
      "run",
      "src/domain/regression/20260828-full-golden.test.ts",
      "--reporter=verbose",
    ],
    {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      POSTGRES_GOLDEN: "1",
      GOLDEN_SNAPSHOT_PATH: postgresqlSnapshotPath,
    },
  );

  const sqliteSnapshot: unknown = JSON.parse(
    readFileSync(sqliteSnapshotPath, "utf8"),
  );
  const postgresqlSnapshot: unknown = JSON.parse(
    readFileSync(postgresqlSnapshotPath, "utf8"),
  );
  const firstDifference = findFirstDifference(
    sqliteSnapshot,
    postgresqlSnapshot,
  );
  if (firstDifference) {
    throw new Error(
      `SQLite and PostgreSQL Golden snapshots differ at ${firstDifference}`,
    );
  }
  console.info(
    "Cross-DB Golden matched: 4 K1, 16 B/Top5, 144 Dingbiao scenarios, Analysis 69/144, and canonical snapshots.",
  );
} finally {
  restoreSqlitePrismaClient();
  assertSafeTemporaryDirectory();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

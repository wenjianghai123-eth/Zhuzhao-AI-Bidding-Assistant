import "dotenv/config";

import { assertPostgresqlTestDatabaseTarget } from "../src/server/db/database-target-safety";
import {
  preparePostgresqlTestDatabase,
  restoreSqlitePrismaClient,
  runPnpm,
} from "./lib/postgresql-verification";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
assertPostgresqlTestDatabaseTarget(testDatabaseUrl, "PostgreSQL Playwright E2E");
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required.");
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  E2E_DATABASE_URL: testDatabaseUrl,
};

try {
  preparePostgresqlTestDatabase(testDatabaseUrl);
  runPnpm(["test:e2e"], environment);
} finally {
  try {
    runPnpm(
      ["exec", "tsx", "scripts/cleanup-postgresql-golden.ts"],
      environment,
    );
  } finally {
    restoreSqlitePrismaClient();
  }
}

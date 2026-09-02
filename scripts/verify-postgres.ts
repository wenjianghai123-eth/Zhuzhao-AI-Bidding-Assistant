import "dotenv/config";

import { assertPostgresqlTestDatabaseTarget } from "../src/server/db/database-target-safety";
import {
  preparePostgresqlTestDatabase,
  restoreSqlitePrismaClient,
  runPnpm,
} from "./lib/postgresql-verification";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
assertPostgresqlTestDatabaseTarget(
  testDatabaseUrl,
  "PostgreSQL Full Business Golden verification",
);
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required.");
}

try {
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
    },
  );
  runPnpm(
    [
      "exec",
      "vitest",
      "run",
      "src/server/repositories/scenario-structure-repository.test.ts",
      "--reporter=verbose",
    ],
    {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      POSTGRES_REPOSITORY: "1",
    },
  );
} finally {
  restoreSqlitePrismaClient();
}

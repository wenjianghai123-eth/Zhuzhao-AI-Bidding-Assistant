import "dotenv/config";

import { assertPostgresqlTestDatabaseTarget } from "../src/server/db/database-target-safety";
import { runPnpm } from "./lib/postgresql-verification";

assertPostgresqlTestDatabaseTarget(
  process.env.TEST_DATABASE_URL,
  "private staging verification",
);

for (const script of [
  "verify:secrets",
  "verify:release",
  "verify:postgres",
  "verify:cross-db-golden",
  "test:e2e:postgres",
]) {
  runPnpm([script]);
}

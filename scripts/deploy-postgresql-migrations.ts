import "dotenv/config";

import { runPnpm } from "./lib/postgresql-verification";

runPnpm(["exec", "tsx", "scripts/generate-postgresql-schema.ts"]);
runPnpm([
  "exec",
  "prisma",
  "migrate",
  "deploy",
  "--config",
  "prisma.postgresql.config.ts",
]);

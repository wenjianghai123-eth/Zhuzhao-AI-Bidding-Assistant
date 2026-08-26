import "dotenv/config";

import { fullGolden20260820Fixture as golden } from "../src/domain/regression/fixtures/20260820-full-golden.fixture";
import { assertPostgresqlTestDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertPostgresqlTestDatabaseTarget(
  process.env.TEST_DATABASE_URL,
  "PostgreSQL Golden cleanup",
);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  throw new Error("Golden cleanup requires DATABASE_URL to equal TEST_DATABASE_URL.");
}

try {
  await prisma.project.deleteMany({ where: { id: golden.project.id } });
  await prisma.companyPerformance.deleteMany({
    where: {
      companyName: { in: golden.candidates.map(({ companyName }) => companyName) },
    },
  });
} finally {
  await prisma.$disconnect();
}

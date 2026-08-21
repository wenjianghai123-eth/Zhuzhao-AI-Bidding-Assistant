-- Restore the application-level CHECK constraints that Prisma cannot model
-- after the DingbiaoScenario table was rebuilt to add finalDrawSlot.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DingbiaoScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "qingbiaoScenarioId" TEXT NOT NULL,
    "qingbiaoK2Value" INTEGER NOT NULL,
    "finalistCount" INTEGER NOT NULL,
    "finalDrawSlot" INTEGER NOT NULL,
    "finalDrawValue" DECIMAL NOT NULL,
    "dingbiaoK1" DECIMAL NOT NULL,
    "benchmarkPriceM" DECIMAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoScenario_qingbiaoScenarioId_fkey" FOREIGN KEY ("qingbiaoScenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoScenario_k2_check" CHECK ("qingbiaoK2Value" IN (0, 1, 2, 3)),
    CONSTRAINT "DingbiaoScenario_finalistCount_check" CHECK ("finalistCount" IN (3, 4, 5)),
    CONSTRAINT "DingbiaoScenario_finalDrawSlot_check" CHECK ("finalDrawSlot" IN (1, 2, 3)),
    CONSTRAINT "DingbiaoScenario_values_check" CHECK ("benchmarkPriceM" >= 0 AND "version" >= 1 AND "inputRevision" >= 1)
);

INSERT INTO "new_DingbiaoScenario" (
    "benchmarkPriceM",
    "createdAt",
    "dingbiaoK1",
    "finalDrawSlot",
    "finalDrawValue",
    "finalistCount",
    "id",
    "inputRevision",
    "projectId",
    "qingbiaoK2Value",
    "qingbiaoScenarioId",
    "ruleVersion",
    "updatedAt",
    "version"
)
SELECT
    "benchmarkPriceM",
    "createdAt",
    "dingbiaoK1",
    "finalDrawSlot",
    "finalDrawValue",
    "finalistCount",
    "id",
    "inputRevision",
    "projectId",
    "qingbiaoK2Value",
    "qingbiaoScenarioId",
    "ruleVersion",
    "updatedAt",
    "version"
FROM "DingbiaoScenario";

DROP TABLE "DingbiaoScenario";
ALTER TABLE "new_DingbiaoScenario" RENAME TO "DingbiaoScenario";

CREATE INDEX "DingbiaoScenario_projectId_createdAt_idx" ON "DingbiaoScenario"("projectId", "createdAt");
CREATE INDEX "DingbiaoScenario_qingbiaoScenarioId_idx" ON "DingbiaoScenario"("qingbiaoScenarioId");
CREATE UNIQUE INDEX "DingbiaoScenario_projectId_qingbiaoK2Value_finalistCount_finalDrawSlot_version_key" ON "DingbiaoScenario"("projectId", "qingbiaoK2Value", "finalistCount", "finalDrawSlot", "version");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

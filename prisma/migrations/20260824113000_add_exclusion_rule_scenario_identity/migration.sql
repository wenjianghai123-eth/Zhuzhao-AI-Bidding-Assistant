-- Add the four neutral exclusion-rule slots without assigning business meanings.
CREATE TABLE "QingbiaoExclusionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "ruleIndex" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QingbiaoExclusionRule_ruleIndex_check" CHECK ("ruleIndex" IN (1, 2, 3, 4)),
    CONSTRAINT "QingbiaoExclusionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "QingbiaoExclusionRuleCandidate" (
    "exclusionRuleId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("exclusionRuleId", "candidateId"),
    CONSTRAINT "QingbiaoExclusionRuleCandidate_exclusionRuleId_fkey" FOREIGN KEY ("exclusionRuleId") REFERENCES "QingbiaoExclusionRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QingbiaoExclusionRuleCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QingbiaoExclusionRule_projectId_idx" ON "QingbiaoExclusionRule"("projectId");
CREATE UNIQUE INDEX "QingbiaoExclusionRule_projectId_ruleIndex_key" ON "QingbiaoExclusionRule"("projectId", "ruleIndex");
CREATE INDEX "QingbiaoExclusionRuleCandidate_candidateId_idx" ON "QingbiaoExclusionRuleCandidate"("candidateId");

-- Existing projects receive four structural slots. Existing scenarios are not
-- assigned to a slot because their exclusion-rule meaning cannot be inferred.
INSERT INTO "QingbiaoExclusionRule" (
    "id",
    "projectId",
    "ruleIndex",
    "label",
    "createdAt",
    "updatedAt"
)
SELECT
    'exclusion-rule-' || "Project"."id" || '-' || "RuleIndex"."ruleIndex",
    "Project"."id",
    "RuleIndex"."ruleIndex",
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project"
CROSS JOIN (
    SELECT 1 AS "ruleIndex"
    UNION ALL SELECT 2
    UNION ALL SELECT 3
    UNION ALL SELECT 4
) AS "RuleIndex";

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Stage the new Qingbiao identity. Nullable exclusionRuleId is reserved only
-- for pre-migration legacy rows; all new application writes bind a rule.
CREATE TABLE "new_QingbiaoScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "exclusionRuleId" TEXT,
    "k2Value" INTEGER NOT NULL,
    "referencePriceB" DECIMAL NOT NULL,
    "qingbiaoK1" DECIMAL NOT NULL,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QingbiaoScenario_k2_check" CHECK ("k2Value" IN (0, 1, 2, 3)),
    CONSTRAINT "QingbiaoScenario_values_check" CHECK ("referencePriceB" >= 0 AND "version" >= 1 AND "inputRevision" >= 1),
    CONSTRAINT "QingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QingbiaoScenario_exclusionRuleId_fkey" FOREIGN KEY ("exclusionRuleId") REFERENCES "QingbiaoExclusionRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_QingbiaoScenario" (
    "createdAt",
    "id",
    "inputRevision",
    "isLegacy",
    "k2Value",
    "projectId",
    "qingbiaoK1",
    "referencePriceB",
    "ruleVersion",
    "updatedAt",
    "version"
)
SELECT
    "createdAt",
    "id",
    "inputRevision",
    true,
    "k2Value",
    "projectId",
    "qingbiaoK1",
    "referencePriceB",
    "ruleVersion",
    "updatedAt",
    "version"
FROM "QingbiaoScenario";

DROP TABLE "QingbiaoScenario";
ALTER TABLE "new_QingbiaoScenario" RENAME TO "QingbiaoScenario";

CREATE INDEX "QingbiaoScenario_projectId_createdAt_idx" ON "QingbiaoScenario"("projectId", "createdAt");
CREATE INDEX "QingbiaoScenario_exclusionRuleId_idx" ON "QingbiaoScenario"("exclusionRuleId");
CREATE UNIQUE INDEX "QingbiaoScenario_exclusionRuleId_k2Value_key" ON "QingbiaoScenario"("exclusionRuleId", "k2Value");
CREATE UNIQUE INDEX "QingbiaoScenario_legacy_project_k2_version_key"
ON "QingbiaoScenario"("projectId", "k2Value", "version")
WHERE "exclusionRuleId" IS NULL;

-- Keep legacy source/slot columns intact while adding the explicit identities
-- used by every new Dingbiao write.
CREATE TABLE "new_DingbiaoScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "qingbiaoScenarioId" TEXT NOT NULL,
    "sourceQingbiaoScenarioId" TEXT,
    "qingbiaoK2Value" INTEGER NOT NULL,
    "finalistCount" INTEGER NOT NULL,
    "finalDrawSlot" INTEGER NOT NULL,
    "finalDrawIndex" INTEGER,
    "finalDrawValue" DECIMAL NOT NULL,
    "dingbiaoK1" DECIMAL NOT NULL,
    "benchmarkPriceM" DECIMAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DingbiaoScenario_k2_check" CHECK ("qingbiaoK2Value" IN (0, 1, 2, 3)),
    CONSTRAINT "DingbiaoScenario_finalistCount_check" CHECK ("finalistCount" IN (3, 4, 5)),
    CONSTRAINT "DingbiaoScenario_finalDrawSlot_check" CHECK ("finalDrawSlot" IN (1, 2, 3)),
    CONSTRAINT "DingbiaoScenario_finalDrawIndex_check" CHECK ("finalDrawIndex" IS NULL OR "finalDrawIndex" IN (1, 2, 3)),
    CONSTRAINT "DingbiaoScenario_values_check" CHECK ("benchmarkPriceM" >= 0 AND "version" >= 1 AND "inputRevision" >= 1),
    CONSTRAINT "DingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoScenario_qingbiaoScenarioId_fkey" FOREIGN KEY ("qingbiaoScenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoScenario_sourceQingbiaoScenarioId_fkey" FOREIGN KEY ("sourceQingbiaoScenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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

ALTER TABLE "DingbiaoResult"
ADD COLUMN "sourceQingbiaoRank" INTEGER
CHECK ("sourceQingbiaoRank" IS NULL OR "sourceQingbiaoRank" >= 1);

ALTER TABLE "DingbiaoResult"
ADD COLUMN "netDiscountRateSnapshot" DECIMAL
CHECK ("netDiscountRateSnapshot" IS NULL OR ("netDiscountRateSnapshot" >= 0 AND "netDiscountRateSnapshot" <= 1));

CREATE INDEX "DingbiaoScenario_projectId_createdAt_idx" ON "DingbiaoScenario"("projectId", "createdAt");
CREATE INDEX "DingbiaoScenario_qingbiaoScenarioId_idx" ON "DingbiaoScenario"("qingbiaoScenarioId");
CREATE INDEX "DingbiaoScenario_sourceQingbiaoScenarioId_idx" ON "DingbiaoScenario"("sourceQingbiaoScenarioId");
CREATE UNIQUE INDEX "DingbiaoScenario_sourceScenario_finalistCount_drawIndex_key"
ON "DingbiaoScenario"("sourceQingbiaoScenarioId", "finalistCount", "finalDrawIndex");
CREATE UNIQUE INDEX "DingbiaoScenario_legacy_project_k2_finalist_draw_version_key"
ON "DingbiaoScenario"("projectId", "qingbiaoK2Value", "finalistCount", "finalDrawSlot", "version")
WHERE "sourceQingbiaoScenarioId" IS NULL;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

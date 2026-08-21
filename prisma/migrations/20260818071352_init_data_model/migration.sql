-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "qingbiaoInputRevision" INTEGER NOT NULL DEFAULT 1,
    "dingbiaoInputRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_status_check" CHECK ("status" IN ('DRAFT', 'CALCULATED', 'COMPLETED')),
    CONSTRAINT "Project_revisions_check" CHECK ("qingbiaoInputRevision" >= 1 AND "dingbiaoInputRevision" >= 1)
);

-- CreateTable
CREATE TABLE "ProjectRule" (
    "projectId" TEXT NOT NULL PRIMARY KEY,
    "maxBidPrice" DECIMAL NOT NULL,
    "nonCompetitiveFee" DECIMAL NOT NULL,
    "totalBidPriceScore" DECIMAL NOT NULL,
    "rankDeduction" DECIMAL NOT NULL,
    "finalDrawValue1" DECIMAL NOT NULL,
    "finalDrawValue2" DECIMAL NOT NULL,
    "finalDrawValue3" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectRule_amounts_check" CHECK ("maxBidPrice" > 0 AND "nonCompetitiveFee" >= 0 AND "nonCompetitiveFee" < "maxBidPrice"),
    CONSTRAINT "ProjectRule_scores_check" CHECK ("totalBidPriceScore" >= 0 AND "rankDeduction" >= 0),
    CONSTRAINT "ProjectRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectRuleProjectType" (
    "projectId" TEXT NOT NULL,
    "projectType" TEXT NOT NULL CHECK ("projectType" IN ('CURTAIN_WALL', 'DECORATION', 'GENERAL_CONTRACT', 'LABORATORY')),

    PRIMARY KEY ("projectId", "projectType"),
    CONSTRAINT "ProjectRuleProjectType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProjectRule" ("projectId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "bidPrice" DECIMAL NOT NULL,
    "netDiscountRate" DECIMAL NOT NULL,
    "trademarkScore" DECIMAL NOT NULL,
    "technicalScore" DECIMAL NOT NULL,
    "similarExperienceScore" DECIMAL NOT NULL,
    "otherScore" DECIMAL NOT NULL,
    "isOurCompany" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectCandidate_bidPrice_check" CHECK ("bidPrice" >= 0),
    CONSTRAINT "ProjectCandidate_discountRate_check" CHECK ("netDiscountRate" >= 0 AND "netDiscountRate" <= 1),
    CONSTRAINT "ProjectCandidate_scores_check" CHECK ("trademarkScore" >= 0 AND "technicalScore" >= 0 AND "similarExperienceScore" >= 0 AND "otherScore" >= 0),
    CONSTRAINT "ProjectCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "projectType" TEXT NOT NULL CHECK ("projectType" IN ('CURTAIN_WALL', 'DECORATION', 'GENERAL_CONTRACT', 'LABORATORY')),
    "classificationLevel" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "score" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyPerformance_year_check" CHECK ("year" >= 2000),
    CONSTRAINT "CompanyPerformance_quarter_check" CHECK ("quarter" IN (1, 2, 3, 4)),
    CONSTRAINT "CompanyPerformance_score_check" CHECK ("score" >= 0)
);

-- CreateTable
CREATE TABLE "QingbiaoScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "k2Value" INTEGER NOT NULL,
    "referencePriceB" DECIMAL NOT NULL,
    "qingbiaoK1" DECIMAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QingbiaoScenario_k2_check" CHECK ("k2Value" IN (0, 1, 2, 3)),
    CONSTRAINT "QingbiaoScenario_values_check" CHECK ("referencePriceB" >= 0 AND "version" >= 1 AND "inputRevision" >= 1),
    CONSTRAINT "QingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QingbiaoScenarioCandidate" (
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("scenarioId", "candidateId"),
    CONSTRAINT "QingbiaoScenarioCandidate_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QingbiaoScenarioCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QingbiaoResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "performanceAverage" DECIMAL NOT NULL,
    "performanceScore" DECIMAL NOT NULL,
    "priceDifference" DECIMAL NOT NULL,
    "priceRank" INTEGER NOT NULL,
    "priceScore" DECIMAL NOT NULL,
    "totalScore" DECIMAL NOT NULL,
    "finalRank" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QingbiaoResult_values_check" CHECK ("performanceScore" >= 0 AND "priceDifference" >= 0 AND "priceRank" >= 1 AND "priceScore" >= 0 AND "totalScore" >= 0 AND "finalRank" >= 1),
    CONSTRAINT "QingbiaoResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QingbiaoResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DingbiaoScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "qingbiaoScenarioId" TEXT NOT NULL,
    "qingbiaoK2Value" INTEGER NOT NULL,
    "finalistCount" INTEGER NOT NULL,
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
    CONSTRAINT "DingbiaoScenario_values_check" CHECK ("benchmarkPriceM" >= 0 AND "version" >= 1 AND "inputRevision" >= 1),
    CONSTRAINT "DingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoScenario_qingbiaoScenarioId_fkey" FOREIGN KEY ("qingbiaoScenarioId") REFERENCES "QingbiaoScenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DingbiaoResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "bidPrice" DECIMAL NOT NULL,
    "differenceToM" DECIMAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DingbiaoResult_values_check" CHECK ("bidPrice" >= 0 AND "differenceToM" >= 0 AND "rank" >= 1),
    CONSTRAINT "DingbiaoResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "DingbiaoScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DingbiaoResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectRuleProjectType_projectType_idx" ON "ProjectRuleProjectType"("projectType");

-- CreateIndex
CREATE INDEX "ProjectCandidate_projectId_idx" ON "ProjectCandidate"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCandidate_companyName_idx" ON "ProjectCandidate"("companyName");

-- CreateIndex
CREATE INDEX "ProjectCandidate_projectId_isOurCompany_idx" ON "ProjectCandidate"("projectId", "isOurCompany");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCandidate_projectId_companyName_key" ON "ProjectCandidate"("projectId", "companyName");

-- A project can have at most one candidate marked as our company.
CREATE UNIQUE INDEX "ProjectCandidate_one_our_company_per_project"
ON "ProjectCandidate"("projectId")
WHERE "isOurCompany" = 1;

-- CreateIndex
CREATE INDEX "CompanyPerformance_companyName_projectType_idx" ON "CompanyPerformance"("companyName", "projectType");

-- CreateIndex
CREATE INDEX "CompanyPerformance_projectType_year_quarter_idx" ON "CompanyPerformance"("projectType", "year", "quarter");

-- CreateIndex
CREATE INDEX "CompanyPerformance_year_quarter_idx" ON "CompanyPerformance"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPerformance_companyName_projectType_year_quarter_key" ON "CompanyPerformance"("companyName", "projectType", "year", "quarter");

-- CreateIndex
CREATE INDEX "QingbiaoScenario_projectId_createdAt_idx" ON "QingbiaoScenario"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QingbiaoScenario_projectId_k2Value_version_key" ON "QingbiaoScenario"("projectId", "k2Value", "version");

-- CreateIndex
CREATE INDEX "QingbiaoScenarioCandidate_candidateId_idx" ON "QingbiaoScenarioCandidate"("candidateId");

-- CreateIndex
CREATE INDEX "QingbiaoResult_candidateId_idx" ON "QingbiaoResult"("candidateId");

-- CreateIndex
CREATE INDEX "QingbiaoResult_scenarioId_finalRank_idx" ON "QingbiaoResult"("scenarioId", "finalRank");

-- CreateIndex
CREATE INDEX "QingbiaoResult_scenarioId_priceRank_idx" ON "QingbiaoResult"("scenarioId", "priceRank");

-- CreateIndex
CREATE UNIQUE INDEX "QingbiaoResult_scenarioId_candidateId_key" ON "QingbiaoResult"("scenarioId", "candidateId");

-- CreateIndex
CREATE INDEX "DingbiaoScenario_projectId_createdAt_idx" ON "DingbiaoScenario"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DingbiaoScenario_qingbiaoScenarioId_idx" ON "DingbiaoScenario"("qingbiaoScenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "DingbiaoScenario_projectId_qingbiaoK2Value_finalistCount_finalDrawValue_version_key" ON "DingbiaoScenario"("projectId", "qingbiaoK2Value", "finalistCount", "finalDrawValue", "version");

-- CreateIndex
CREATE INDEX "DingbiaoResult_candidateId_idx" ON "DingbiaoResult"("candidateId");

-- CreateIndex
CREATE INDEX "DingbiaoResult_scenarioId_rank_idx" ON "DingbiaoResult"("scenarioId", "rank");

-- CreateIndex
CREATE INDEX "DingbiaoResult_scenarioId_isWinner_idx" ON "DingbiaoResult"("scenarioId", "isWinner");

-- CreateIndex
CREATE UNIQUE INDEX "DingbiaoResult_scenarioId_candidateId_key" ON "DingbiaoResult"("scenarioId", "candidateId");

-- A deterministic scenario can have at most one winner.
CREATE UNIQUE INDEX "DingbiaoResult_one_winner_per_scenario"
ON "DingbiaoResult"("scenarioId")
WHERE "isWinner" = 1;

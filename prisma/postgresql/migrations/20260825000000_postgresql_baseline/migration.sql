-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'CALCULATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('CURTAIN_WALL', 'DECORATION', 'GENERAL_CONTRACT', 'LABORATORY');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "qingbiaoInputRevision" INTEGER NOT NULL DEFAULT 1,
    "dingbiaoInputRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRule" (
    "projectId" TEXT NOT NULL,
    "maxBidPrice" DECIMAL(38,18) NOT NULL,
    "nonCompetitiveFee" DECIMAL(38,18) NOT NULL,
    "totalBidPriceScore" DECIMAL(38,20) NOT NULL,
    "rankDeduction" DECIMAL(38,20) NOT NULL,
    "finalDrawValue1" DECIMAL(38,20) NOT NULL,
    "finalDrawValue2" DECIMAL(38,20) NOT NULL,
    "finalDrawValue3" DECIMAL(38,20) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectRule_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ProjectRuleProjectType" (
    "projectId" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,

    CONSTRAINT "ProjectRuleProjectType_pkey" PRIMARY KEY ("projectId","projectType")
);

-- CreateTable
CREATE TABLE "ProjectCandidate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "bidPrice" DECIMAL(38,18) NOT NULL,
    "netDiscountRate" DECIMAL(38,20) NOT NULL,
    "trademarkScore" DECIMAL(38,20) NOT NULL,
    "technicalScore" DECIMAL(38,20) NOT NULL,
    "similarExperienceScore" DECIMAL(38,20) NOT NULL,
    "otherScore" DECIMAL(38,20) NOT NULL,
    "isOurCompany" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPerformance" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "classificationLevel" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "score" DECIMAL(38,20) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QingbiaoExclusionRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleIndex" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QingbiaoExclusionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QingbiaoExclusionRuleCandidate" (
    "exclusionRuleId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QingbiaoExclusionRuleCandidate_pkey" PRIMARY KEY ("exclusionRuleId","candidateId")
);

-- CreateTable
CREATE TABLE "QingbiaoScenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "exclusionRuleId" TEXT,
    "k2Value" INTEGER NOT NULL,
    "referencePriceB" DECIMAL(38,18) NOT NULL,
    "qingbiaoK1" DECIMAL(38,20) NOT NULL,
    "referencePriceBCanonical" TEXT,
    "qingbiaoK1Canonical" TEXT,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QingbiaoScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QingbiaoScenarioCandidate" (
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QingbiaoScenarioCandidate_pkey" PRIMARY KEY ("scenarioId","candidateId")
);

-- CreateTable
CREATE TABLE "QingbiaoResult" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "performanceAverage" DECIMAL(38,20) NOT NULL,
    "performanceScore" DECIMAL(38,20) NOT NULL,
    "priceDifference" DECIMAL(38,18) NOT NULL,
    "performanceAverageCanonical" TEXT,
    "performanceScoreCanonical" TEXT,
    "priceDifferenceCanonical" TEXT,
    "priceRank" INTEGER NOT NULL,
    "priceScore" DECIMAL(38,20) NOT NULL,
    "totalScore" DECIMAL(38,20) NOT NULL,
    "priceScoreCanonical" TEXT,
    "totalScoreCanonical" TEXT,
    "finalRank" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QingbiaoResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DingbiaoScenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "qingbiaoScenarioId" TEXT NOT NULL,
    "sourceQingbiaoScenarioId" TEXT,
    "qingbiaoK2Value" INTEGER NOT NULL,
    "finalistCount" INTEGER NOT NULL,
    "finalDrawSlot" INTEGER NOT NULL,
    "finalDrawIndex" INTEGER,
    "finalDrawValue" DECIMAL(38,20) NOT NULL,
    "dingbiaoK1" DECIMAL(38,20) NOT NULL,
    "benchmarkPriceM" DECIMAL(38,18) NOT NULL,
    "finalDrawValueCanonical" TEXT,
    "dingbiaoK1Canonical" TEXT,
    "benchmarkPriceMCanonical" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputRevision" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DingbiaoScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DingbiaoResult" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sourceQingbiaoRank" INTEGER,
    "bidPrice" DECIMAL(38,18) NOT NULL,
    "netDiscountRateSnapshot" DECIMAL(38,20),
    "differenceToM" DECIMAL(38,18) NOT NULL,
    "bidPriceCanonical" TEXT,
    "netDiscountRateSnapshotCanonical" TEXT,
    "differenceToMCanonical" TEXT,
    "rank" INTEGER NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DingbiaoResult_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "CompanyPerformance_companyName_projectType_idx" ON "CompanyPerformance"("companyName", "projectType");

-- CreateIndex
CREATE INDEX "CompanyPerformance_projectType_year_quarter_idx" ON "CompanyPerformance"("projectType", "year", "quarter");

-- CreateIndex
CREATE INDEX "CompanyPerformance_year_quarter_idx" ON "CompanyPerformance"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPerformance_companyName_projectType_year_quarter_key" ON "CompanyPerformance"("companyName", "projectType", "year", "quarter");

-- CreateIndex
CREATE INDEX "QingbiaoExclusionRule_projectId_idx" ON "QingbiaoExclusionRule"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "QingbiaoExclusionRule_projectId_ruleIndex_key" ON "QingbiaoExclusionRule"("projectId", "ruleIndex");

-- CreateIndex
CREATE INDEX "QingbiaoExclusionRuleCandidate_candidateId_idx" ON "QingbiaoExclusionRuleCandidate"("candidateId");

-- CreateIndex
CREATE INDEX "QingbiaoScenario_projectId_createdAt_idx" ON "QingbiaoScenario"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "QingbiaoScenario_exclusionRuleId_idx" ON "QingbiaoScenario"("exclusionRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "QingbiaoScenario_exclusionRuleId_k2Value_key" ON "QingbiaoScenario"("exclusionRuleId", "k2Value");

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
CREATE INDEX "DingbiaoScenario_sourceQingbiaoScenarioId_idx" ON "DingbiaoScenario"("sourceQingbiaoScenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "DingbiaoScenario_sourceScenario_finalistCount_drawIndex_key" ON "DingbiaoScenario"("sourceQingbiaoScenarioId", "finalistCount", "finalDrawIndex");

-- CreateIndex
CREATE INDEX "DingbiaoResult_candidateId_idx" ON "DingbiaoResult"("candidateId");

-- CreateIndex
CREATE INDEX "DingbiaoResult_scenarioId_rank_idx" ON "DingbiaoResult"("scenarioId", "rank");

-- CreateIndex
CREATE INDEX "DingbiaoResult_scenarioId_isWinner_idx" ON "DingbiaoResult"("scenarioId", "isWinner");

-- CreateIndex
CREATE UNIQUE INDEX "DingbiaoResult_scenarioId_candidateId_key" ON "DingbiaoResult"("scenarioId", "candidateId");

-- AddForeignKey
ALTER TABLE "ProjectRule" ADD CONSTRAINT "ProjectRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRuleProjectType" ADD CONSTRAINT "ProjectRuleProjectType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProjectRule"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCandidate" ADD CONSTRAINT "ProjectCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoExclusionRule" ADD CONSTRAINT "QingbiaoExclusionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoExclusionRuleCandidate" ADD CONSTRAINT "QingbiaoExclusionRuleCandidate_exclusionRuleId_fkey" FOREIGN KEY ("exclusionRuleId") REFERENCES "QingbiaoExclusionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoExclusionRuleCandidate" ADD CONSTRAINT "QingbiaoExclusionRuleCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoScenario" ADD CONSTRAINT "QingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoScenario" ADD CONSTRAINT "QingbiaoScenario_exclusionRuleId_fkey" FOREIGN KEY ("exclusionRuleId") REFERENCES "QingbiaoExclusionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoScenarioCandidate" ADD CONSTRAINT "QingbiaoScenarioCandidate_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "QingbiaoScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoScenarioCandidate" ADD CONSTRAINT "QingbiaoScenarioCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoResult" ADD CONSTRAINT "QingbiaoResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "QingbiaoScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QingbiaoResult" ADD CONSTRAINT "QingbiaoResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DingbiaoScenario" ADD CONSTRAINT "DingbiaoScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DingbiaoScenario" ADD CONSTRAINT "DingbiaoScenario_qingbiaoScenarioId_fkey" FOREIGN KEY ("qingbiaoScenarioId") REFERENCES "QingbiaoScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DingbiaoScenario" ADD CONSTRAINT "DingbiaoScenario_sourceQingbiaoScenarioId_fkey" FOREIGN KEY ("sourceQingbiaoScenarioId") REFERENCES "QingbiaoScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DingbiaoResult" ADD CONSTRAINT "DingbiaoResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "DingbiaoScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DingbiaoResult" ADD CONSTRAINT "DingbiaoResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProjectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain integrity constraints not expressible in the Prisma schema.
ALTER TABLE "Project"
ADD CONSTRAINT "Project_revisions_check"
CHECK ("qingbiaoInputRevision" >= 1 AND "dingbiaoInputRevision" >= 1);

ALTER TABLE "ProjectRule"
ADD CONSTRAINT "ProjectRule_amounts_check"
CHECK ("maxBidPrice" > 0 AND "nonCompetitiveFee" >= 0 AND "nonCompetitiveFee" < "maxBidPrice"),
ADD CONSTRAINT "ProjectRule_scores_check"
CHECK ("totalBidPriceScore" >= 0 AND "rankDeduction" >= 0);

ALTER TABLE "ProjectCandidate"
ADD CONSTRAINT "ProjectCandidate_bidPrice_check"
CHECK ("bidPrice" >= 0),
ADD CONSTRAINT "ProjectCandidate_discountRate_check"
CHECK ("netDiscountRate" >= 0 AND "netDiscountRate" <= 1),
ADD CONSTRAINT "ProjectCandidate_scores_check"
CHECK (
  "trademarkScore" >= 0 AND
  "technicalScore" >= 0 AND
  "similarExperienceScore" >= 0 AND
  "otherScore" >= 0
);

ALTER TABLE "CompanyPerformance"
ADD CONSTRAINT "CompanyPerformance_year_check" CHECK ("year" >= 2000),
ADD CONSTRAINT "CompanyPerformance_quarter_check" CHECK ("quarter" IN (1, 2, 3, 4)),
ADD CONSTRAINT "CompanyPerformance_score_check" CHECK ("score" >= 0);

ALTER TABLE "QingbiaoExclusionRule"
ADD CONSTRAINT "QingbiaoExclusionRule_ruleIndex_check"
CHECK ("ruleIndex" IN (1, 2, 3, 4));

ALTER TABLE "QingbiaoScenario"
ADD CONSTRAINT "QingbiaoScenario_k2_check" CHECK ("k2Value" IN (0, 1, 2, 3)),
ADD CONSTRAINT "QingbiaoScenario_values_check"
CHECK ("referencePriceB" >= 0 AND "version" >= 1 AND "inputRevision" >= 1);

ALTER TABLE "QingbiaoResult"
ADD CONSTRAINT "QingbiaoResult_values_check"
CHECK (
  "performanceScore" >= 0 AND
  "priceDifference" >= 0 AND
  "priceRank" >= 1 AND
  "priceScore" >= 0 AND
  "totalScore" >= 0 AND
  "finalRank" >= 1
);

ALTER TABLE "DingbiaoScenario"
ADD CONSTRAINT "DingbiaoScenario_k2_check" CHECK ("qingbiaoK2Value" IN (0, 1, 2, 3)),
ADD CONSTRAINT "DingbiaoScenario_finalistCount_check" CHECK ("finalistCount" IN (3, 4, 5)),
ADD CONSTRAINT "DingbiaoScenario_finalDrawSlot_check" CHECK ("finalDrawSlot" IN (1, 2, 3)),
ADD CONSTRAINT "DingbiaoScenario_finalDrawIndex_check"
CHECK ("finalDrawIndex" IS NULL OR "finalDrawIndex" IN (1, 2, 3)),
ADD CONSTRAINT "DingbiaoScenario_values_check"
CHECK ("benchmarkPriceM" >= 0 AND "version" >= 1 AND "inputRevision" >= 1);

ALTER TABLE "DingbiaoResult"
ADD CONSTRAINT "DingbiaoResult_values_check"
CHECK ("bidPrice" >= 0 AND "differenceToM" >= 0 AND "rank" >= 1),
ADD CONSTRAINT "DingbiaoResult_sourceQingbiaoRank_check"
CHECK ("sourceQingbiaoRank" IS NULL OR "sourceQingbiaoRank" >= 1),
ADD CONSTRAINT "DingbiaoResult_netDiscountRateSnapshot_check"
CHECK (
  "netDiscountRateSnapshot" IS NULL OR
  ("netDiscountRateSnapshot" >= 0 AND "netDiscountRateSnapshot" <= 1)
);

-- Partial business identities that Prisma cannot represent cross-provider.
CREATE UNIQUE INDEX "ProjectCandidate_one_our_company_per_project"
ON "ProjectCandidate"("projectId")
WHERE "isOurCompany" = true;

CREATE UNIQUE INDEX "QingbiaoScenario_legacy_project_k2_version_key"
ON "QingbiaoScenario"("projectId", "k2Value", "version")
WHERE "exclusionRuleId" IS NULL;

CREATE UNIQUE INDEX "DingbiaoScenario_legacy_project_k2_finalist_draw_version_key"
ON "DingbiaoScenario"(
  "projectId",
  "qingbiaoK2Value",
  "finalistCount",
  "finalDrawSlot",
  "version"
)
WHERE "sourceQingbiaoScenarioId" IS NULL;

CREATE UNIQUE INDEX "DingbiaoResult_one_winner_per_scenario"
ON "DingbiaoResult"("scenarioId")
WHERE "isWinner" = true;

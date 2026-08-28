ALTER TABLE "Project"
ADD COLUMN "performanceInputRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PerformanceWeightedSnapshot" (
    "projectId" TEXT NOT NULL PRIMARY KEY,
    "inputRevision" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startQuarter" INTEGER NOT NULL CHECK ("startQuarter" IN (1, 2, 3, 4)),
    "endYear" INTEGER NOT NULL,
    "endQuarter" INTEGER NOT NULL CHECK ("endQuarter" IN (1, 2, 3, 4)),
    "weightingMethod" TEXT NOT NULL,
    "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PerformanceWeightedSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PerformanceWeightedSnapshot_inputRevision_idx"
ON "PerformanceWeightedSnapshot"("inputRevision");
CREATE INDEX "PerformanceWeightedSnapshot_savedAt_idx"
ON "PerformanceWeightedSnapshot"("savedAt");

CREATE TABLE "PerformanceWeightedScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "classificationLevel" TEXT NOT NULL,
    "weightedAverage" DECIMAL(38, 20),
    "weightedAverageCanonical" TEXT,
    "quarterCount" INTEGER NOT NULL CHECK ("quarterCount" >= 0 AND "quarterCount" <= 12),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PerformanceWeightedScore_snapshot_fkey" FOREIGN KEY ("projectId") REFERENCES "PerformanceWeightedSnapshot" ("projectId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformanceWeightedScore_candidateId_projectId_fkey" FOREIGN KEY ("candidateId", "projectId") REFERENCES "ProjectCandidate" ("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PerformanceWeightedScore_projectId_candidateId_projectType_key"
ON "PerformanceWeightedScore"("projectId", "candidateId", "projectType");
CREATE INDEX "PerformanceWeightedScore_candidateId_idx"
ON "PerformanceWeightedScore"("candidateId");
CREATE INDEX "PerformanceWeightedScore_projectId_projectType_idx"
ON "PerformanceWeightedScore"("projectId", "projectType");

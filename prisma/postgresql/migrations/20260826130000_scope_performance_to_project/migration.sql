CREATE UNIQUE INDEX "ProjectCandidate_id_projectId_key"
ON "ProjectCandidate"("id", "projectId");

ALTER TABLE "CompanyPerformance"
ADD COLUMN "projectId" TEXT,
ADD COLUMN "candidateId" TEXT;

WITH "CandidateMatches" AS (
    SELECT
        cp."id" AS "performanceId",
        CASE WHEN COUNT(pc."id") = 1 THEN MIN(pc."projectId") ELSE NULL END AS "projectId",
        CASE WHEN COUNT(pc."id") = 1 THEN MIN(pc."id") ELSE NULL END AS "candidateId"
    FROM "CompanyPerformance" cp
    LEFT JOIN "ProjectCandidate" pc ON pc."companyName" = cp."companyName"
    GROUP BY cp."id"
)
UPDATE "CompanyPerformance" performance
SET
    "projectId" = matches."projectId",
    "candidateId" = matches."candidateId"
FROM "CandidateMatches" matches
WHERE matches."performanceId" = performance."id";

DROP INDEX "CompanyPerformance_companyName_projectType_year_quarter_key";

CREATE UNIQUE INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_key"
ON "CompanyPerformance"("projectId", "candidateId", "projectType", "year", "quarter");
CREATE INDEX "CompanyPerformance_projectId_year_quarter_idx"
ON "CompanyPerformance"("projectId", "year", "quarter");
CREATE INDEX "CompanyPerformance_projectId_candidateId_projectType_idx"
ON "CompanyPerformance"("projectId", "candidateId", "projectType");

ALTER TABLE "CompanyPerformance"
ADD CONSTRAINT "CompanyPerformance_scope_pair_check"
CHECK (("projectId" IS NULL AND "candidateId" IS NULL) OR ("projectId" IS NOT NULL AND "candidateId" IS NOT NULL)),
ADD CONSTRAINT "CompanyPerformance_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "CompanyPerformance_candidateId_projectId_fkey"
FOREIGN KEY ("candidateId", "projectId") REFERENCES "ProjectCandidate"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PerformanceQuarterArchive"
ADD COLUMN "projectId" TEXT;

WITH "ArchiveProjects" AS (
    SELECT
        archive."id" AS "archiveId",
        CASE
            WHEN COUNT(performance."id") > 0
             AND COUNT(performance."id") = COUNT(performance."projectId")
             AND COUNT(DISTINCT performance."projectId") = 1
            THEN MIN(performance."projectId")
            ELSE NULL
        END AS "projectId"
    FROM "PerformanceQuarterArchive" archive
    LEFT JOIN "CompanyPerformance" performance
      ON performance."year" = archive."year"
     AND performance."quarter" = archive."quarter"
    GROUP BY archive."id"
)
UPDATE "PerformanceQuarterArchive" archive
SET "projectId" = projects."projectId"
FROM "ArchiveProjects" projects
WHERE projects."archiveId" = archive."id";

DROP INDEX "PerformanceQuarterArchive_year_quarter_key";

CREATE UNIQUE INDEX "PerformanceQuarterArchive_projectId_year_quarter_key"
ON "PerformanceQuarterArchive"("projectId", "year", "quarter");
CREATE INDEX "PerformanceQuarterArchive_projectId_savedAt_idx"
ON "PerformanceQuarterArchive"("projectId", "savedAt");

ALTER TABLE "PerformanceQuarterArchive"
ADD CONSTRAINT "PerformanceQuarterArchive_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

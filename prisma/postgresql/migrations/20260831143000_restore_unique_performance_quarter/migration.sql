CREATE TEMP TABLE "_PerformanceQuarterDedup" AS
SELECT
    MIN("id") AS "keeperId",
    "projectId",
    "candidateId",
    "projectType",
    "year",
    "quarter",
    AVG("score") AS "averageScore"
FROM "CompanyPerformance"
WHERE "projectId" IS NOT NULL AND "candidateId" IS NOT NULL
GROUP BY "projectId", "candidateId", "projectType", "year", "quarter";

UPDATE "CompanyPerformance" AS target
SET
    "score" = dedup."averageScore",
    "classificationLevel" = latest."classificationLevel"
FROM "_PerformanceQuarterDedup" AS dedup,
LATERAL (
    SELECT source."classificationLevel"
    FROM "CompanyPerformance" AS source
    WHERE source."projectId" = dedup."projectId"
      AND source."candidateId" = dedup."candidateId"
      AND source."projectType" = dedup."projectType"
      AND source."year" = dedup."year"
      AND source."quarter" = dedup."quarter"
    ORDER BY source."updatedAt" DESC, source."id" DESC
    LIMIT 1
) AS latest
WHERE target."id" = dedup."keeperId";

DELETE FROM "CompanyPerformance" AS target
USING "_PerformanceQuarterDedup" AS dedup
WHERE target."projectId" = dedup."projectId"
  AND target."candidateId" = dedup."candidateId"
  AND target."projectType" = dedup."projectType"
  AND target."year" = dedup."year"
  AND target."quarter" = dedup."quarter"
  AND target."id" <> dedup."keeperId";

DROP TABLE "_PerformanceQuarterDedup";

DROP INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_idx";

CREATE UNIQUE INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_key"
ON "CompanyPerformance"("projectId", "candidateId", "projectType", "year", "quarter");

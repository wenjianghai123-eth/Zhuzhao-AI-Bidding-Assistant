-- The former detail-entry UI allowed several records for one scoped quarter.
-- Preserve the signed-off historical meaning by collapsing those records to
-- their arithmetic quarter average before restoring the canonical grid key.
CREATE TEMP TABLE "_PerformanceQuarterDedup" AS
SELECT
    MIN("id") AS "keeperId",
    "projectId",
    "candidateId",
    "projectType",
    "year",
    "quarter",
    AVG(CAST("score" AS NUMERIC)) AS "averageScore"
FROM "CompanyPerformance"
WHERE "projectId" IS NOT NULL AND "candidateId" IS NOT NULL
GROUP BY "projectId", "candidateId", "projectType", "year", "quarter";

UPDATE "CompanyPerformance"
SET
    "score" = (
        SELECT "averageScore"
        FROM "_PerformanceQuarterDedup"
        WHERE "keeperId" = "CompanyPerformance"."id"
    ),
    "classificationLevel" = (
        SELECT latest."classificationLevel"
        FROM "CompanyPerformance" AS latest
        WHERE latest."projectId" = "CompanyPerformance"."projectId"
          AND latest."candidateId" = "CompanyPerformance"."candidateId"
          AND latest."projectType" = "CompanyPerformance"."projectType"
          AND latest."year" = "CompanyPerformance"."year"
          AND latest."quarter" = "CompanyPerformance"."quarter"
        ORDER BY latest."updatedAt" DESC, latest."id" DESC
        LIMIT 1
    )
WHERE "id" IN (SELECT "keeperId" FROM "_PerformanceQuarterDedup");

DELETE FROM "CompanyPerformance"
WHERE "projectId" IS NOT NULL
  AND "candidateId" IS NOT NULL
  AND "id" NOT IN (SELECT "keeperId" FROM "_PerformanceQuarterDedup");

DROP TABLE "_PerformanceQuarterDedup";

DROP INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_idx";

CREATE UNIQUE INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_key"
ON "CompanyPerformance"("projectId", "candidateId", "projectType", "year", "quarter");

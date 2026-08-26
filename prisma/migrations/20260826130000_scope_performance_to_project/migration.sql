CREATE UNIQUE INDEX "ProjectCandidate_id_projectId_key"
ON "ProjectCandidate"("id", "projectId");

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CompanyPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "candidateId" TEXT,
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
    CONSTRAINT "CompanyPerformance_score_check" CHECK ("score" >= 0),
    CONSTRAINT "CompanyPerformance_scope_pair_check" CHECK (("projectId" IS NULL AND "candidateId" IS NULL) OR ("projectId" IS NOT NULL AND "candidateId" IS NOT NULL)),
    CONSTRAINT "CompanyPerformance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyPerformance_candidateId_projectId_fkey" FOREIGN KEY ("candidateId", "projectId") REFERENCES "ProjectCandidate" ("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);

WITH "CandidateMatches" AS (
    SELECT
        cp."id" AS "performanceId",
        CASE WHEN COUNT(pc."id") = 1 THEN MIN(pc."projectId") ELSE NULL END AS "projectId",
        CASE WHEN COUNT(pc."id") = 1 THEN MIN(pc."id") ELSE NULL END AS "candidateId"
    FROM "CompanyPerformance" cp
    LEFT JOIN "ProjectCandidate" pc ON pc."companyName" = cp."companyName"
    GROUP BY cp."id"
)
INSERT INTO "new_CompanyPerformance" (
    "id", "projectId", "candidateId", "companyName", "projectType",
    "classificationLevel", "year", "quarter", "score", "createdAt", "updatedAt"
)
SELECT
    cp."id", matches."projectId", matches."candidateId", cp."companyName",
    cp."projectType", cp."classificationLevel", cp."year", cp."quarter",
    cp."score", cp."createdAt", cp."updatedAt"
FROM "CompanyPerformance" cp
JOIN "CandidateMatches" matches ON matches."performanceId" = cp."id";

DROP TABLE "CompanyPerformance";
ALTER TABLE "new_CompanyPerformance" RENAME TO "CompanyPerformance";

CREATE UNIQUE INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_key"
ON "CompanyPerformance"("projectId", "candidateId", "projectType", "year", "quarter");
CREATE INDEX "CompanyPerformance_projectId_year_quarter_idx"
ON "CompanyPerformance"("projectId", "year", "quarter");
CREATE INDEX "CompanyPerformance_projectId_candidateId_projectType_idx"
ON "CompanyPerformance"("projectId", "candidateId", "projectType");
CREATE INDEX "CompanyPerformance_companyName_projectType_idx"
ON "CompanyPerformance"("companyName", "projectType");

CREATE TABLE "new_PerformanceQuarterArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PerformanceQuarterArchive_quarter_check" CHECK ("quarter" BETWEEN 1 AND 4),
    CONSTRAINT "PerformanceQuarterArchive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
INSERT INTO "new_PerformanceQuarterArchive" (
    "id", "projectId", "year", "quarter", "savedAt", "createdAt", "updatedAt"
)
SELECT
    archive."id", projects."projectId", archive."year", archive."quarter",
    archive."savedAt", archive."createdAt", archive."updatedAt"
FROM "PerformanceQuarterArchive" archive
JOIN "ArchiveProjects" projects ON projects."archiveId" = archive."id";

DROP TABLE "PerformanceQuarterArchive";
ALTER TABLE "new_PerformanceQuarterArchive" RENAME TO "PerformanceQuarterArchive";

CREATE UNIQUE INDEX "PerformanceQuarterArchive_projectId_year_quarter_key"
ON "PerformanceQuarterArchive"("projectId", "year", "quarter");
CREATE INDEX "PerformanceQuarterArchive_projectId_savedAt_idx"
ON "PerformanceQuarterArchive"("projectId", "savedAt");
CREATE INDEX "PerformanceQuarterArchive_savedAt_idx"
ON "PerformanceQuarterArchive"("savedAt");

PRAGMA foreign_keys=ON;

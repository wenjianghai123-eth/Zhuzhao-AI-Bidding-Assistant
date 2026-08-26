CREATE TABLE "PerformanceQuarterArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PerformanceQuarterArchive_quarter_check" CHECK ("quarter" BETWEEN 1 AND 4)
);

CREATE UNIQUE INDEX "PerformanceQuarterArchive_year_quarter_key"
ON "PerformanceQuarterArchive"("year", "quarter");

CREATE INDEX "PerformanceQuarterArchive_savedAt_idx"
ON "PerformanceQuarterArchive"("savedAt");

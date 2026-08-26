CREATE TABLE "PerformanceQuarterArchive" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PerformanceQuarterArchive_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PerformanceQuarterArchive_quarter_check" CHECK ("quarter" BETWEEN 1 AND 4)
);

CREATE UNIQUE INDEX "PerformanceQuarterArchive_year_quarter_key"
ON "PerformanceQuarterArchive"("year", "quarter");

CREATE INDEX "PerformanceQuarterArchive_savedAt_idx"
ON "PerformanceQuarterArchive"("savedAt");

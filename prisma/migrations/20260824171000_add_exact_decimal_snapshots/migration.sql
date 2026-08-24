-- SQLite NUMERIC values use integer/REAL affinity and cannot exactly preserve
-- every Decimal.js result. The existing NUMERIC columns remain available for
-- queries and compatibility; these TEXT columns are the exact snapshot source.
--
-- Historical rows can only be backfilled from the value SQLite currently
-- stores. CAST(... AS TEXT) does not invent digits that were already lost.

ALTER TABLE "QingbiaoScenario"
ADD COLUMN "referencePriceBCanonical" TEXT;
ALTER TABLE "QingbiaoScenario"
ADD COLUMN "qingbiaoK1Canonical" TEXT;

UPDATE "QingbiaoScenario"
SET
    "referencePriceBCanonical" = CAST("referencePriceB" AS TEXT),
    "qingbiaoK1Canonical" = CAST("qingbiaoK1" AS TEXT);

ALTER TABLE "QingbiaoResult"
ADD COLUMN "performanceAverageCanonical" TEXT;
ALTER TABLE "QingbiaoResult"
ADD COLUMN "performanceScoreCanonical" TEXT;
ALTER TABLE "QingbiaoResult"
ADD COLUMN "priceDifferenceCanonical" TEXT;
ALTER TABLE "QingbiaoResult"
ADD COLUMN "priceScoreCanonical" TEXT;
ALTER TABLE "QingbiaoResult"
ADD COLUMN "totalScoreCanonical" TEXT;

UPDATE "QingbiaoResult"
SET
    "performanceAverageCanonical" = CAST("performanceAverage" AS TEXT),
    "performanceScoreCanonical" = CAST("performanceScore" AS TEXT),
    "priceDifferenceCanonical" = CAST("priceDifference" AS TEXT),
    "priceScoreCanonical" = CAST("priceScore" AS TEXT),
    "totalScoreCanonical" = CAST("totalScore" AS TEXT);

ALTER TABLE "DingbiaoScenario"
ADD COLUMN "finalDrawValueCanonical" TEXT;
ALTER TABLE "DingbiaoScenario"
ADD COLUMN "dingbiaoK1Canonical" TEXT;
ALTER TABLE "DingbiaoScenario"
ADD COLUMN "benchmarkPriceMCanonical" TEXT;

UPDATE "DingbiaoScenario"
SET
    "finalDrawValueCanonical" = CAST("finalDrawValue" AS TEXT),
    "dingbiaoK1Canonical" = CAST("dingbiaoK1" AS TEXT),
    "benchmarkPriceMCanonical" = CAST("benchmarkPriceM" AS TEXT);

ALTER TABLE "DingbiaoResult"
ADD COLUMN "bidPriceCanonical" TEXT;
ALTER TABLE "DingbiaoResult"
ADD COLUMN "netDiscountRateSnapshotCanonical" TEXT;
ALTER TABLE "DingbiaoResult"
ADD COLUMN "differenceToMCanonical" TEXT;

UPDATE "DingbiaoResult"
SET
    "bidPriceCanonical" = CAST("bidPrice" AS TEXT),
    "netDiscountRateSnapshotCanonical" =
        CASE
            WHEN "netDiscountRateSnapshot" IS NULL THEN NULL
            ELSE CAST("netDiscountRateSnapshot" AS TEXT)
        END,
    "differenceToMCanonical" = CAST("differenceToM" AS TEXT);

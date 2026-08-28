import { describe, expect, it } from "vitest";

import {
  calculatePerformanceWeightedRow,
  calculateWeightedPerformanceScore,
  generatePerformanceQuarterRange,
  nextPerformanceQuarter,
} from "@/domain/performance/performance-weighted-score";

describe("performance weighted score", () => {
  const threeQuarterAverages = [
    { projectType: "CURTAIN_WALL" as const, year: 2026, quarter: 1, score: "80", detailCount: 1 },
    { projectType: "CURTAIN_WALL" as const, year: 2026, quarter: 2, score: "90", detailCount: 1 },
    { projectType: "CURTAIN_WALL" as const, year: 2026, quarter: 3, score: "100", detailCount: 1 },
  ];

  it("calculates the equal recent-12 fixture", () => {
    expect(
      calculateWeightedPerformanceScore({
        quarterAverages: threeQuarterAverages,
        method: "EQUAL_RECENT_12",
      }).weightedAverage,
    ).toBe("90");
  });

  it("calculates the linear-recency fixture from oldest weight 1 to newest weight n", () => {
    expect(
      calculateWeightedPerformanceScore({
        quarterAverages: threeQuarterAverages,
        method: "LINEAR_RECENCY_RECENT_12",
      }).weightedAverage,
    ).toBe("93.333333333333333333");
  });

  it("uses weights 1 through 12 with a total weight of 78", () => {
    const result = calculateWeightedPerformanceScore({
      quarterAverages: Array.from({ length: 12 }, (_, index) => ({
        projectType: "CURTAIN_WALL" as const,
        year: 2023 + Math.floor(index / 4),
        quarter: (index % 4) + 1,
        score: String(index + 1),
        detailCount: 1,
      })),
      method: "LINEAR_RECENCY_RECENT_12",
    });
    expect(result.weightedAverage).toBe("8.3333333333333333333");
    expect(result.quarterCount).toBe(12);
  });

  it("renumbers weights over valid quarters and ignores a missing quarter", () => {
    expect(
      calculateWeightedPerformanceScore({
        quarterAverages: [
          threeQuarterAverages[0]!,
          { ...threeQuarterAverages[1]!, quarter: 3 },
          { ...threeQuarterAverages[2]!, quarter: 4 },
        ],
        method: "LINEAR_RECENCY_RECENT_12",
      }).weightedAverage,
    ).toBe("93.333333333333333333");
  });

  it("takes the latest 12 of 16 quarters and restarts their weights at 1", () => {
    const result = calculateWeightedPerformanceScore({
      quarterAverages: Array.from({ length: 16 }, (_, index) => ({
        projectType: "CURTAIN_WALL" as const,
        year: 2023 + Math.floor(index / 4),
        quarter: (index % 4) + 1,
        score: String(index + 1),
        detailCount: 1,
      })),
      method: "LINEAR_RECENCY_RECENT_12",
    });
    expect(result.participatingQuarters[0]?.score).toBe("5");
    expect(result.participatingQuarters[11]?.score).toBe("16");
    expect(result.weightedAverage).toBe("12.333333333333333333");
  });

  it.each([
    [["94"], "94"],
    [["90", "95"], "92.5"],
    [["90", "95", "92"], "92.333333333333333333"],
  ] as const)(
    "averages %s detail scores into one quarter without presentation rounding",
    (scores, expected) => {
      const calculation = calculatePerformanceWeightedRow(
        "CURTAIN_WALL",
        scores.map((score) => ({
          projectType: "CURTAIN_WALL" as const,
          year: 2026,
          quarter: 1,
          score,
        })),
        { year: 2026, quarter: 1 },
        { year: 2026, quarter: 1 },
      );
      expect(calculation.quarterAverages[0]?.score).toBe(expected);
    },
  );

  it("generates continuous dynamic quarter columns across years", () => {
    expect(
      generatePerformanceQuarterRange(
        { year: 2025, quarter: 3 },
        { year: 2026, quarter: 2 },
      ),
    ).toEqual([
      { year: 2025, quarter: 3 },
      { year: 2025, quarter: 4 },
      { year: 2026, quarter: 1 },
      { year: 2026, quarter: 2 },
    ]);
    expect(nextPerformanceQuarter({ year: 2026, quarter: 4 })).toEqual({
      year: 2027,
      quarter: 1,
    });
  });

  it("averages multiple details in one quarter and uses recent-12 logic", () => {
    const calculation = calculatePerformanceWeightedRow(
      "CURTAIN_WALL",
      [
        { projectType: "CURTAIN_WALL", year: 2026, quarter: 1, score: "88" },
        { projectType: "CURTAIN_WALL", year: 2026, quarter: 1, score: "92" },
        { projectType: "CURTAIN_WALL", year: 2026, quarter: 1, score: "96" },
        { projectType: "CURTAIN_WALL", year: 2026, quarter: 2, score: "84" },
      ],
      { year: 2025, quarter: 1 },
      { year: 2026, quarter: 2 },
    );

    expect(calculation.quarterAverages).toMatchObject([
      { year: 2026, quarter: 2, score: "84", detailCount: 1 },
      { year: 2026, quarter: 1, score: "92", detailCount: 3 },
    ]);
    expect(calculation.weightedAverage).toBe("88");
    expect(calculation.quarterCount).toBe(2);
  });

  it("keeps missing quarters absent instead of turning them into zero", () => {
    const calculation = calculatePerformanceWeightedRow(
      "DECORATION",
      [],
      { year: 2026, quarter: 1 },
      { year: 2026, quarter: 4 },
    );

    expect(calculation.quarterAverages).toEqual([]);
    expect(calculation.weightedAverage).toBeNull();
    expect(calculation.quarterCount).toBe(0);
  });

  it("uses at most the latest 12 available quarters", () => {
    const calculation = calculatePerformanceWeightedRow(
      "GENERAL_CONTRACT",
      Array.from({ length: 13 }, (_, index) => ({
        projectType: "GENERAL_CONTRACT" as const,
        year: 2023 + Math.floor(index / 4),
        quarter: (index % 4) + 1,
        score: index === 0 ? "0" : "100",
      })),
      { year: 2023, quarter: 1 },
      { year: 2026, quarter: 1 },
    );

    expect(calculation.weightedAverage).toBe("100");
    expect(calculation.quarterCount).toBe(12);
  });
});

import { describe, expect, it } from "vitest";

import {
  calculateRecentPerformanceAverage,
  type PerformanceScoreRecord,
} from "@/domain/performance/company-performance";

function record(
  projectType: PerformanceScoreRecord["projectType"],
  year: number,
  quarter: number,
  score: string,
): PerformanceScoreRecord {
  return { projectType, year, quarter, score };
}

describe("calculateRecentPerformanceAverage", () => {
  it("calculates a single project type average", () => {
    const result = calculateRecentPerformanceAverage(
      ["CURTAIN_WALL"],
      [
        record("CURTAIN_WALL", 2026, 2, "94"),
        record("CURTAIN_WALL", 2026, 1, "92"),
        record("CURTAIN_WALL", 2025, 4, "90"),
      ],
    );

    expect(result.status).toBe("complete");
    expect(result.averageScore).toBe("92");
    expect(result.projectTypeAverages).toEqual([
      {
        projectType: "CURTAIN_WALL",
        averageScore: "92",
        quarterCount: 3,
      },
    ]);
  });

  it("averages each project type first and then averages the project types", () => {
    const result = calculateRecentPerformanceAverage(
      ["CURTAIN_WALL", "DECORATION"],
      [
        record("CURTAIN_WALL", 2026, 2, "90"),
        record("CURTAIN_WALL", 2026, 1, "80"),
        record("DECORATION", 2026, 2, "90"),
        record("DECORATION", 2026, 1, "70"),
      ],
    );

    expect(result.status).toBe("complete");
    expect(result.averageScore).toBe("82.5");
    expect(result.projectTypeAverages).toEqual([
      {
        projectType: "CURTAIN_WALL",
        averageScore: "85",
        quarterCount: 2,
      },
      {
        projectType: "DECORATION",
        averageScore: "80",
        quarterCount: 2,
      },
    ]);
  });

  it("uses all available records when there are fewer than 12 quarters", () => {
    const result = calculateRecentPerformanceAverage(
      ["LABORATORY"],
      [
        record("LABORATORY", 2026, 1, "90"),
        record("LABORATORY", 2025, 4, "70"),
      ],
    );

    expect(result.status).toBe("complete");
    expect(result.averageScore).toBe("80");
    expect(result.projectTypeAverages[0]?.quarterCount).toBe(2);
  });

  it("sorts by year and quarter and limits each project type to the latest 12", () => {
    const latestTwelve = [
      record("GENERAL_CONTRACT", 2026, 4, "100"),
      record("GENERAL_CONTRACT", 2026, 3, "100"),
      record("GENERAL_CONTRACT", 2026, 2, "100"),
      record("GENERAL_CONTRACT", 2026, 1, "100"),
      record("GENERAL_CONTRACT", 2025, 4, "100"),
      record("GENERAL_CONTRACT", 2025, 3, "100"),
      record("GENERAL_CONTRACT", 2025, 2, "100"),
      record("GENERAL_CONTRACT", 2025, 1, "100"),
      record("GENERAL_CONTRACT", 2024, 4, "100"),
      record("GENERAL_CONTRACT", 2024, 3, "100"),
      record("GENERAL_CONTRACT", 2024, 2, "100"),
      record("GENERAL_CONTRACT", 2024, 1, "100"),
    ];
    const result = calculateRecentPerformanceAverage(
      ["GENERAL_CONTRACT"],
      [
        record("GENERAL_CONTRACT", 2023, 4, "0"),
        ...latestTwelve.toReversed(),
      ],
    );

    expect(result.status).toBe("complete");
    expect(result.averageScore).toBe("100");
    expect(result.projectTypeAverages[0]?.quarterCount).toBe(12);
  });

  it("returns every requested project type as missing when no data exists", () => {
    const result = calculateRecentPerformanceAverage(
      ["CURTAIN_WALL", "DECORATION"],
      [],
    );

    expect(result).toEqual({
      status: "missing_data",
      averageScore: null,
      projectTypeAverages: [],
      missingProjectTypes: ["CURTAIN_WALL", "DECORATION"],
    });
  });

  it("returns partial averages and explicit missing project types without using zero", () => {
    const result = calculateRecentPerformanceAverage(
      ["CURTAIN_WALL", "DECORATION"],
      [record("CURTAIN_WALL", 2026, 2, "90")],
    );

    expect(result.status).toBe("missing_data");
    expect(result.averageScore).toBeNull();
    expect(result.missingProjectTypes).toEqual(["DECORATION"]);
    expect(result.projectTypeAverages).toEqual([
      {
        projectType: "CURTAIN_WALL",
        averageScore: "90",
        quarterCount: 1,
      },
    ]);
  });
});

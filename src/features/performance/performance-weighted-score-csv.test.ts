import { describe, expect, it } from "vitest";

import { buildPerformanceWeightedScoreCsv } from "@/features/performance/performance-weighted-score-csv";
import type { PerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";

describe("weighted performance CSV", () => {
  it("exports dynamic quarters and keeps missing scores empty instead of zero", () => {
    const data: PerformanceWeightedPageData = {
      projectId: "p1",
      projectName: "项目一",
      inputRevision: 1,
      candidates: [{ id: "c1", companyName: "甲公司" }],
      projectTypes: ["CURTAIN_WALL"],
      quarters: [{ year: 2026, quarter: 1 }, { year: 2026, quarter: 2 }],
      start: { year: 2026, quarter: 1 },
      end: { year: 2026, quarter: 2 },
      weightingMethod: "EQUAL_RECENT_12",
      catalogRows: [{
        candidateId: "c1",
        companyName: "甲公司",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        classificationLevels: ["A"],
        classificationConflict: false,
        quarterValues: [
          { year: 2026, quarter: 1, averageScore: "88", detailCount: 1 },
          { year: 2026, quarter: 2, averageScore: null, detailCount: 0 },
        ],
        weightedAverage: "88",
        quarterCount: 1,
        hasDetails: true,
      }],
      suggestedRows: [],
      initialRows: [],
      savedRows: [],
      unlinkedRecordCount: 0,
      classificationConflictCount: 0,
      snapshotStatus: "not_saved",
      savedAt: null,
      savedInputRevision: null,
    };
    const csv = buildPerformanceWeightedScoreCsv(
      data,
      [{ candidateId: "c1", projectType: "CURTAIN_WALL", classificationLevel: "A" }],
      { CURTAIN_WALL: "幕墙" },
    );
    expect(csv).toContain('"2026 Q1","2026 Q2"');
    expect(csv).toContain('"加权方式"');
    expect(csv).toContain('"等权平均（近12季度算术平均）"');
    expect(csv).toContain('"88","","88"');
    expect(csv).not.toContain('"88","0","88"');
  });
});

import { describe, expect, it } from "vitest";

import type { ProjectCandidatesSnapshot } from "@/domain/candidates/project-candidate";
import type { ProjectSettingsSnapshot } from "@/domain/projects/project-settings";
import type { PerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";
import {
  getQingbiaoReadiness,
  type QingbiaoReadinessDependencies,
} from "@/server/application/qingbiao-readiness-service";
import type { ProjectOverviewSnapshot } from "@/server/repositories/project-catalog-repository";

const projectId = "project-readiness";
const overview: ProjectOverviewSnapshot = {
  id: projectId,
  name: "清标前检查项目",
  status: "DRAFT",
  updatedAt: "2026-08-30T00:00:00.000Z",
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  projectTypes: ["CURTAIN_WALL"],
  candidateCount: 3,
  settingsIssue: null,
  hasCompleteSettings: true,
  hasOurCompany: false,
  currentQingbiaoScenarioCount: 0,
  currentDingbiaoScenarioCount: 0,
};
const settings: ProjectSettingsSnapshot = {
  id: projectId,
  name: overview.name,
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  projectTypes: ["CURTAIN_WALL"],
  qingbiaoDrawValue1: "0",
  qingbiaoDrawValue2: "0.01",
  qingbiaoDrawValue3: "0.02",
  qingbiaoDrawValue4: "0.03",
  totalBidPriceScore: "40",
  similarExperienceScore: "10",
  otherScore: "10",
  rankDeduction: "2",
  finalDrawValue1: "0",
  finalDrawValue2: "0.01",
  finalDrawValue3: "0.02",
};
const candidates: ProjectCandidatesSnapshot = {
  projectId,
  projectName: overview.name,
  candidates: ["A", "B", "C"].map((name, index) => ({
    id: `c${index + 1}`,
    projectId,
    companyName: `${name}公司`,
    bidPrice: String(900 + index * 10),
    netDiscountRate: "0.1",
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: false,
  })),
};

function performance(
  snapshotStatus: PerformanceWeightedPageData["snapshotStatus"] = "current",
): PerformanceWeightedPageData {
  return {
    projectId,
    projectName: overview.name,
    inputRevision: 1,
    candidates: candidates.candidates.map(({ id, companyName }) => ({
      id,
      companyName,
    })),
    projectTypes: ["CURTAIN_WALL"],
    quarters: [{ year: 2026, quarter: 1 }],
    start: { year: 2026, quarter: 1 },
    end: { year: 2026, quarter: 1 },
    weightingMethod: "EQUAL_RECENT_12",
    catalogRows: candidates.candidates.map((candidate) => ({
      candidateId: candidate.id,
      companyName: candidate.companyName,
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      classificationLevels: ["A"],
      classificationConflict: false,
      quarterValues: [
        {
          year: 2026,
          quarter: 1,
          averageScore: "80",
          detailCount: 1,
        },
      ],
      weightedAverage: "80",
      quarterCount: 1,
      hasDetails: true,
    })),
    suggestedRows: [],
    initialRows: [],
    savedRows: [],
    unlinkedRecordCount: 0,
    classificationConflictCount: 0,
    snapshotStatus,
    savedAt: snapshotStatus === "not_saved" ? null : "2026-08-30T00:00:00.000Z",
    savedInputRevision: snapshotStatus === "not_saved" ? null : 1,
  };
}

function dependencies(overrides?: {
  settings?: ProjectSettingsSnapshot | null;
  candidates?: ProjectCandidatesSnapshot;
  performance?: PerformanceWeightedPageData;
}): QingbiaoReadinessDependencies {
  return {
    projectReader: async () => overview,
    settingsReader: async () =>
      overrides && "settings" in overrides
        ? (overrides.settings ?? null)
        : settings,
    candidatesReader: async () => overrides?.candidates ?? candidates,
    performanceReader: async () => overrides?.performance ?? performance(),
  };
}

describe("Qingbiao readiness", () => {
  it("returns ready when every persisted precondition is current", async () => {
    await expect(getQingbiaoReadiness(projectId, dependencies())).resolves.toEqual({
      ready: true,
      issues: [],
    });
  });

  it("lists the concrete fields when project settings do not exist", async () => {
    const readiness = await getQingbiaoReadiness(
      projectId,
      dependencies({ settings: null }),
    );

    expect(readiness?.issues).toContainEqual(
      expect.objectContaining({
        code: "PROJECT_RULE_INCOMPLETE",
        message: expect.stringContaining(
          "项目类型、最高投标限价、不可竞争费、总投标报价分值、排名递减扣分值",
        ),
        actionHref: `/projects/${projectId}/settings`,
      }),
    );
  });

  it("collects candidate and performance issues in one result", async () => {
    const invalidCandidates: ProjectCandidatesSnapshot = {
      ...candidates,
      candidates: candidates.candidates.map((candidate, index) =>
        index === 0 ? { ...candidate, netDiscountRate: "-0.1" } : candidate,
      ),
    };
    const completePerformance = performance("not_saved");
    const missingPerformance = {
      ...completePerformance,
      catalogRows: completePerformance.catalogRows.slice(1),
    };

    const readiness = await getQingbiaoReadiness(
      projectId,
      dependencies({
        candidates: invalidCandidates,
        performance: missingPerformance,
      }),
    );

    expect(readiness?.ready).toBe(false);
    expect(readiness?.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "CANDIDATE_NET_DISCOUNT_INVALID",
        "PERFORMANCE_DATA_MISSING",
        "PERFORMANCE_WEIGHTED_NOT_SAVED",
      ]),
    );
    expect(
      readiness?.issues.find(({ code }) => code === "PERFORMANCE_DATA_MISSING"),
    ).toMatchObject({ candidateId: "c1", projectType: "CURTAIN_WALL" });
  });

  it("returns field-specific settings and automatic-exclusion issues", async () => {
    const readiness = await getQingbiaoReadiness(
      projectId,
      dependencies({
        settings: { ...settings, rankDeduction: "-1" },
        candidates: { ...candidates, candidates: candidates.candidates.slice(0, 2) },
      }),
    );

    expect(readiness?.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "QINGBIAO_RANK_DEDUCTION_INVALID",
        "AUTOMATIC_EXCLUSION_INVALID",
      ]),
    );
  });
});

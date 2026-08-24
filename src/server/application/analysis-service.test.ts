import { describe, expect, it } from "vitest";

import { getAnalysisPageData } from "@/server/application/analysis-service";
import type {
  AnalysisProjectSnapshot,
  AnalysisRepository,
} from "@/server/repositories/analysis-repository";

const snapshot: AnalysisProjectSnapshot = {
  projectId: "project-1",
  projectName: "测试项目",
  qingbiaoState: "current",
  dingbiaoState: "not_calculated",
  currentQingbiaoScenarioCount: 16,
  requiredQingbiaoScenarioCount: 16,
  currentDingbiaoScenarioCount: 0,
  expectedValidDingbiaoScenarioCount: 0,
  candidates: [
    {
      candidateId: "candidate-1",
      companyName: "我方公司",
      isOurCompany: true,
    },
  ],
  qingbiaoScenarios: ([1, 2, 3, 4] as const).flatMap((ruleIndex) =>
    ([0, 1, 2, 3] as const).map((qingbiaoK2Value) => ({
      sourceQingbiaoScenarioId: `source-${ruleIndex}-${qingbiaoK2Value}`,
      exclusionRuleId: `rule-${ruleIndex}`,
      ruleIndex,
      exclusionRuleLabel: null,
      qingbiaoK2Value,
      qingbiaoK1Fraction: "0.1",
      referencePriceB: "910",
      candidates: [
        { candidateId: "candidate-1", totalScore: "99", finalRank: 1 },
      ],
    })),
  ),
  dingbiaoScenarios: [],
};

function repositoryWith(
  value: AnalysisProjectSnapshot | null,
): AnalysisRepository {
  return {
    async findProjectSnapshot() {
      return value;
    },
  };
}

describe("getAnalysisPageData", () => {
  it("builds page data only from the saved result snapshot", async () => {
    const result = await getAnalysisPageData(
      "project-1",
      repositoryWith(snapshot),
    );

    expect(result).toMatchObject({
      projectId: "project-1",
      projectName: "测试项目",
      qingbiaoState: "current",
      dingbiaoState: "not_calculated",
      currentQingbiaoScenarioCount: 16,
      analysisResult: { status: "ready" },
    });
  });

  it("returns null for an unknown project", async () => {
    await expect(
      getAnalysisPageData("missing", repositoryWith(null)),
    ).resolves.toBeNull();
  });
});

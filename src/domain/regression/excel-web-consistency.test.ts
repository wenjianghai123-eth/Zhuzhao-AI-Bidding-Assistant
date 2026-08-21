import { describe, expect, it } from "vitest";

import {
  calculateDingbiao,
  type DingbiaoCalculationInput,
  type DingbiaoCalculationResult,
} from "@/domain/dingbiao";
import {
  calculateQingbiaoScenario,
  type QingbiaoScenarioResult,
} from "@/domain/qingbiao";
import { excelFormulaGoldenFixture } from "@/domain/regression/__tests__/fixtures/excel-formula-golden";

function requireQingbiaoResult(): QingbiaoScenarioResult {
  const result = calculateQingbiaoScenario(
    excelFormulaGoldenFixture.qingbiaoInput,
  );
  if (!result.success) {
    throw new Error("Expected the Excel golden qingbiao fixture to calculate.");
  }
  return result.value;
}

function findFixtureCandidate(candidateId: string) {
  const candidate = excelFormulaGoldenFixture.candidates.find(
    (item) => item.candidateId === candidateId,
  );
  if (!candidate) {
    throw new Error(`Golden fixture candidate ${candidateId} was not found.`);
  }
  return candidate;
}

function buildDingbiaoInput(
  qingbiao: QingbiaoScenarioResult,
  rateRepresentation: "percentage_points" | "stored_fractions",
): DingbiaoCalculationInput {
  return {
    qingbiaoK2: qingbiao.qingbiaoK2,
    qingbiaoResults: qingbiao.candidates.map((result) => {
      const candidate = findFixtureCandidate(result.candidateId);
      return {
        candidateId: candidate.candidateId,
        bidPrice: candidate.bidPrice,
        netDiscountRate:
          rateRepresentation === "percentage_points"
            ? candidate.netDiscountRatePercentagePoints
            : candidate.netDiscountRateStoredFraction,
        isOurCompany: candidate.isOurCompany,
        finalRank: result.finalRank,
      };
    }),
    maxBidPrice: excelFormulaGoldenFixture.qingbiaoInput.rules.maxBidPrice,
    nonCompetitiveFee:
      excelFormulaGoldenFixture.qingbiaoInput.rules.nonCompetitiveFee,
    finalDrawValues:
      rateRepresentation === "percentage_points"
        ? excelFormulaGoldenFixture.finalDrawValuesPercentagePoints
        : excelFormulaGoldenFixture.finalDrawValuesStoredFractions,
  };
}

function normalizeDingbiaoResult(result: DingbiaoCalculationResult) {
  if (result.status !== "calculated") {
    throw new Error("Expected the Excel golden dingbiao fixture to calculate.");
  }

  return result.groups.map((group) => {
    if (group.status !== "available") {
      throw new Error(`Expected N=${group.finalistCount} to be available.`);
    }
    return {
      finalistCount: group.finalistCount,
      dingbiaoK1: group.dingbiaoK1,
      simulationWinRate: group.simulationWinRate.simulationWinRate,
      scenarios: group.scenarios.map((scenario) => ({
        finalDrawSlot: scenario.finalDrawSlot,
        finalDrawValue: scenario.finalDrawValue,
        benchmarkPriceM: scenario.benchmarkPriceM,
        winnerCandidateId: scenario.winnerCandidateId,
        candidates: scenario.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          differenceToM: candidate.differenceToM,
          rank: candidate.rank,
        })),
      })),
    };
  });
}

describe("Excel formula to Web domain regression", () => {
  it("matches the frozen Excel-derived qingbiao expectations", () => {
    expect(requireQingbiaoResult()).toEqual(
      excelFormulaGoldenFixture.expectedQingbiao,
    );
  });

  it("remains deterministic when candidate input order changes", () => {
    const result = calculateQingbiaoScenario({
      ...excelFormulaGoldenFixture.qingbiaoInput,
      candidates: [...excelFormulaGoldenFixture.candidates].reverse(),
    });

    expect(result).toEqual({
      success: true,
      value: excelFormulaGoldenFixture.expectedQingbiao,
    });
  });

  it("matches Excel dingbiao formulas when rates and draw values use percentage points", () => {
    const input = buildDingbiaoInput(
      requireQingbiaoResult(),
      "percentage_points",
    );
    const result = calculateDingbiao(input);

    expect(normalizeDingbiaoResult(result)).toEqual(
      excelFormulaGoldenFixture.expectedDingbiao,
    );
    expect(
      normalizeDingbiaoResult(
        calculateDingbiao({
          ...input,
          qingbiaoResults: input.qingbiaoResults
            ? [...input.qingbiaoResults].reverse()
            : null,
        }),
      ),
    ).toEqual(excelFormulaGoldenFixture.expectedDingbiao);
  });

  it("characterizes the pending stored-fraction mismatch without changing business code", () => {
    const result = calculateDingbiao(
      buildDingbiaoInput(requireQingbiaoResult(), "stored_fractions"),
    );
    const normalized = normalizeDingbiaoResult(result);

    expect(
      normalized.map((group) => ({
        finalistCount: group.finalistCount,
        dingbiaoK1: group.dingbiaoK1,
        benchmarkPrices: group.scenarios.map(
          (scenario) => scenario.benchmarkPriceM,
        ),
        winners: group.scenarios.map(
          (scenario) => scenario.winnerCandidateId,
        ),
        simulationWinRate: group.simulationWinRate,
      })),
    ).toEqual([
      {
        finalistCount: 5,
        dingbiaoK1: "0.818",
        benchmarkPrices: ["107.362", "107.452", "107.542"],
        winners: ["c5", "c5", "c5"],
        simulationWinRate: "0",
      },
      {
        finalistCount: 4,
        dingbiaoK1: "0.81",
        benchmarkPrices: ["107.29", "107.38", "107.47"],
        winners: ["c5", "c5", "c5"],
        simulationWinRate: "0",
      },
      {
        finalistCount: 3,
        dingbiaoK1: "0.83333333333333333333",
        benchmarkPrices: ["107.5", "107.59", "107.68"],
        winners: ["c2", "c2", "c2"],
        simulationWinRate: "0",
      },
    ]);
    expect(normalized).not.toEqual(excelFormulaGoldenFixture.expectedDingbiao);
  });
});

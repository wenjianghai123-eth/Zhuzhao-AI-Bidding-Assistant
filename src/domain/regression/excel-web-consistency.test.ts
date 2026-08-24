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
): DingbiaoCalculationInput {
  return {
    finalists: qingbiao.candidates.map((result) => {
      const candidate = findFixtureCandidate(result.candidateId);
      return {
        candidateId: candidate.candidateId,
        bidPrice: candidate.bidPrice,
        netDiscountRateFraction: candidate.netDiscountRateFraction,
        isOurCompany: candidate.isOurCompany,
        sourceQingbiaoRank: result.finalRank,
      };
    }),
    maxBidPrice: excelFormulaGoldenFixture.qingbiaoInput.rules.maxBidPrice,
    nonCompetitiveFee:
      excelFormulaGoldenFixture.qingbiaoInput.rules.nonCompetitiveFee,
    finalDrawValueFractions: excelFormulaGoldenFixture.finalDrawValueFractions,
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
      dingbiaoK1Fraction: group.dingbiaoK1Fraction,
      simulationWinRate: group.simulationWinRate.simulationWinRate,
      scenarios: group.scenarios.map((scenario) => ({
        finalDrawIndex: scenario.finalDrawIndex,
        finalDrawValueFraction: scenario.finalDrawValueFraction,
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

  it("applies the approved Dingbiao fraction formula deterministically to the legacy fixture", () => {
    const input = buildDingbiaoInput(requireQingbiaoResult());
    const result = calculateDingbiao(input);
    const normalized = normalizeDingbiaoResult(result);
    expect(normalized[0]).toMatchObject({
      finalistCount: 5,
      dingbiaoK1Fraction: "0.818",
    });
    expect(normalized[0]?.scenarios[0]).toMatchObject({
      finalDrawIndex: 1,
      finalDrawValueFraction: "0",
      benchmarkPriceM: "263.8",
    });
    expect(
      normalizeDingbiaoResult(
        calculateDingbiao({
          ...input,
          finalists: input.finalists
            ? [...input.finalists].reverse()
            : null,
        }),
      ),
    ).toEqual(normalized);
  });

});

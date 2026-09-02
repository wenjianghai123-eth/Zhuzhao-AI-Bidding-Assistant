import { describe, expect, it } from "vitest";

import { QINGBIAO_EXCLUSION_RULE_INDEXES } from "@/domain/qingbiao";
import { qingbiao20260820GoldenFixture } from "@/domain/qingbiao/fixtures/20260820-golden.fixture";
import { calculateEntryGuaranteeByScenario } from "@/domain/qingbiao-reverse-simulation";
import {
  buildQingbiaoEntryGuaranteeViewModel,
  type QingbiaoEntryGuaranteeCalculator,
  type QingbiaoEntryGuaranteeCandidateInput,
} from "@/server/application/qingbiao-entry-guarantee-service";

const candidates: readonly QingbiaoEntryGuaranteeCandidateInput[] =
  qingbiao20260820GoldenFixture.candidates.map((candidate) => ({
    id: candidate.candidateId,
    companyName: `Company ${candidate.candidateId}`,
    bidPrice: candidate.bidPrice,
    netDiscountRateFraction: candidate.netDiscountRateFraction ?? "0",
    performance: candidate.performance,
    trademarkScore: candidate.trademarkScore,
    technicalScore: candidate.technicalScore,
    similarExperienceScore: candidate.similarExperienceScore,
    otherScore: candidate.otherScore,
    isOurCompany: candidate.candidateId === "A",
  }));

const exclusionRules = QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => ({
  id: `rule-${ruleIndex}`,
  ruleIndex,
}));

const coarseCalculator: QingbiaoEntryGuaranteeCalculator = (input) =>
  calculateEntryGuaranteeByScenario({
    ...input,
    searchPolicy: {
      minimumRateFraction: "0",
      maximumRateFraction: "0.2",
      rateStepFraction: "0.02",
    },
  });

function createInput(
  overrides: Partial<
    Parameters<typeof buildQingbiaoEntryGuaranteeViewModel>[0]
  > = {},
): Parameters<typeof buildQingbiaoEntryGuaranteeViewModel>[0] {
  return {
    calculationStatus: "current",
    savedScenarioCount: 16,
    performanceWeightedSnapshotStatus: "current",
    candidates,
    exclusionRules,
    rules: qingbiao20260820GoldenFixture.input.rules,
    calculator: coarseCalculator,
    ...overrides,
  };
}

describe("buildQingbiaoEntryGuaranteeViewModel", () => {
  it("shows a blocker when our company is not configured", () => {
    expect(
      buildQingbiaoEntryGuaranteeViewModel(
        createInput({
          candidates: candidates.map((candidate) => ({
            ...candidate,
            isOurCompany: false,
          })),
        }),
      ),
    ).toEqual({
      status: "unavailable",
      reason: "our_company_missing",
      message: "未设置我方单位，无法进行入围保障测算。",
    });
  });

  it.each([
    ["not_calculated" as const, "not_calculated"],
    ["stale" as const, "stale"],
  ])("maps %s Qingbiao state without calculating", (status, reason) => {
    expect(
      buildQingbiaoEntryGuaranteeViewModel(
        createInput({ calculationStatus: status }),
      ),
    ).toMatchObject({ status: "unavailable", reason });
  });

  it("requires the saved performance snapshot used by formal Qingbiao", () => {
    expect(
      buildQingbiaoEntryGuaranteeViewModel(
        createInput({ performanceWeightedSnapshotStatus: "not_saved" }),
      ),
    ).toMatchObject({
      status: "unavailable",
      reason: "performance_unavailable",
    });
  });

  it("builds both targets with 16 read-only scenarios", () => {
    const result = buildQingbiaoEntryGuaranteeViewModel(createInput());

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.ourCompanyName).toBe("Company A");
    expect(result.calculation.targets.TOP5.scenarios).toHaveLength(16);
    expect(result.calculation.targets.TOP3.scenarios).toHaveLength(16);
  });
});

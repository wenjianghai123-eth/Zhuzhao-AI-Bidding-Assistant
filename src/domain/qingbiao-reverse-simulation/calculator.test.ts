import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import { qingbiao20260820GoldenFixture } from "@/domain/qingbiao/fixtures/20260820-golden.fixture";
import { QINGBIAO_EXCLUSION_RULE_INDEXES } from "@/domain/qingbiao";
import {
  calculateBidPriceFromNetDiscountRate,
  calculateEntryGuaranteeByScenario,
  calculateGlobalEntryGuarantee,
  type QingbiaoEntryGuaranteeInput,
} from "@/domain/qingbiao-reverse-simulation";

function createInput(
  overrides: Partial<QingbiaoEntryGuaranteeInput> = {},
): QingbiaoEntryGuaranteeInput {
  return {
    ourCandidateId: "A",
    candidates: qingbiao20260820GoldenFixture.candidates,
    rules: qingbiao20260820GoldenFixture.input.rules,
    exclusionRules: QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => ({
      exclusionRuleId: `rule-${ruleIndex}`,
      ruleIndex,
    })),
    searchPolicy: {
      minimumRateFraction: "0",
      maximumRateFraction: "0.2",
      rateStepFraction: "0.01",
    },
    ...overrides,
  };
}

describe("calculateBidPriceFromNetDiscountRate", () => {
  it.each([
    ["0", "1000"],
    ["0.1", "910"],
    ["1", "100"],
  ])(
    "converts rate %s with the approved competitive-amount formula",
    (netDiscountRateFraction, expectedBidPrice) => {
      expect(
        calculateBidPriceFromNetDiscountRate({
          netDiscountRateFraction,
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
        }),
      ).toEqual({ success: true, bidPrice: expectedBidPrice });
    },
  );

  it("returns typed validation failures for invalid rates and project ranges", () => {
    expect(
      calculateBidPriceFromNetDiscountRate({
        netDiscountRateFraction: "1.01",
        maxBidPrice: "1000",
        nonCompetitiveFee: "100",
      }),
    ).toMatchObject({
      success: false,
      errors: [{ code: "QINGBIAO_BID_PRICE_RATE_OUT_OF_RANGE" }],
    });
    expect(
      calculateBidPriceFromNetDiscountRate({
        netDiscountRateFraction: "0.1",
        maxBidPrice: "100",
        nonCompetitiveFee: "100",
      }),
    ).toMatchObject({
      success: false,
      errors: [{ code: "QINGBIAO_BID_PRICE_INVALID_PROJECT_RANGE" }],
    });
  });
});

describe("calculateGlobalEntryGuarantee", () => {
  it("intersects every scenario interval union instead of taking their union", () => {
    expect(
      calculateGlobalEntryGuarantee([
        [
          { minimumRateFraction: "0.05", maximumRateFraction: "0.12" },
          { minimumRateFraction: "0.2", maximumRateFraction: "0.25" },
        ],
        [
          { minimumRateFraction: "0.1", maximumRateFraction: "0.22" },
        ],
        [
          { minimumRateFraction: "0.11", maximumRateFraction: "0.21" },
        ],
      ]),
    ).toEqual([
      { minimumRateFraction: "0.11", maximumRateFraction: "0.12" },
      { minimumRateFraction: "0.2", maximumRateFraction: "0.21" },
    ]);
  });

  it("returns no global guarantee when any scenario has no feasible rate", () => {
    expect(
      calculateGlobalEntryGuarantee([
        [{ minimumRateFraction: "0.1", maximumRateFraction: "0.2" }],
        [],
      ]),
    ).toEqual([]);
  });
});

describe("calculateEntryGuaranteeByScenario", () => {
  it("recalculates all 4 rules by 4 K2 values for TOP5 and TOP3", () => {
    const result = calculateEntryGuaranteeByScenario(createInput());

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.value.testedRateCount).toBe(21);
    expect(result.value.targets.TOP5.scenarios).toHaveLength(16);
    expect(result.value.targets.TOP3.scenarios).toHaveLength(16);
    expect(
      result.value.targets.TOP5.scenarios.map((scenario) => [
        scenario.ruleIndex,
        scenario.qingbiaoK2Value,
      ]),
    ).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
    ]);
    for (const target of [
      result.value.targets.TOP5,
      result.value.targets.TOP3,
    ]) {
      for (const scenario of target.scenarios) {
        for (const interval of scenario.intervals) {
          expect(
            new Decimal(interval.minimumRateFraction).lessThanOrEqualTo(
              interval.maximumRateFraction,
            ),
          ).toBe(true);
          expect(
            new Decimal(interval.minimumBidPrice).lessThanOrEqualTo(
              interval.maximumBidPrice,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("is deterministic and reacts to competitor bid changes", () => {
    const input = createInput();
    const first = calculateEntryGuaranteeByScenario(input);
    const repeated = calculateEntryGuaranteeByScenario(input);
    expect(repeated).toEqual(first);

    const changedCompetitor = calculateEntryGuaranteeByScenario(
      createInput({
        candidates: input.candidates.map((candidate) =>
          candidate.candidateId === "F"
            ? { ...candidate, bidPrice: "700" }
            : candidate,
        ),
      }),
    );
    expect(changedCompetitor).not.toEqual(first);
  });

  it("returns typed failures for a missing our-company candidate", () => {
    expect(
      calculateEntryGuaranteeByScenario(
        createInput({ ourCandidateId: "not-in-project" }),
      ),
    ).toMatchObject({
      success: false,
      errors: [
        { code: "QINGBIAO_ENTRY_GUARANTEE_OUR_CANDIDATE_NOT_FOUND" },
      ],
    });
  });
});

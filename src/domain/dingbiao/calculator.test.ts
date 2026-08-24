import { describe, expect, it } from "vitest";

import {
  calculateDingbiao,
  calculateDingbiaoK1,
  calculateFinalBenchmarkPrice,
  calculateSimulationWinRate,
  hasCompleteDingbiaoSimulation,
  selectTopFinalists,
} from "@/domain/dingbiao/calculator";
import {
  dingbiaoInput,
  findAvailableGroup,
  fiveQingbiaoResults,
} from "@/domain/dingbiao/__tests__/fixtures";
import { dingbiaoGoldenExpected } from "@/domain/dingbiao/fixtures/dingbiao-20260820-golden";

describe("dingbiao 20260820 golden fixture", () => {
  it("selects strict Qingbiao Top5 prefixes for N=5, N=4 and N=3", () => {
    for (const finalistCount of [5, 4, 3] as const) {
      const selection = selectTopFinalists(fiveQingbiaoResults, finalistCount);
      expect(selection.status).toBe("available");
      if (selection.status === "available") {
        expect(selection.finalists.map(({ candidateId }) => candidateId)).toEqual(
          ["c1", "c2", "c3", "c4", "c5"].slice(0, finalistCount),
        );
      }
    }
  });

  it("recalculates independent arithmetic K1 values and all nine scenarios", () => {
    const result = calculateDingbiao(dingbiaoInput);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }

    expect(result.groups).toHaveLength(3);
    for (const expected of dingbiaoGoldenExpected) {
      const group = findAvailableGroup(result.groups, expected.finalistCount);
      expect(group.dingbiaoK1Fraction).toBe(expected.dingbiaoK1Fraction);
      expect(group.simulationWinRate.simulationWinRate).toBe(
        expected.simulationWinRate,
      );
      expect(group.scenarios).toMatchObject(expected.scenarios);
      expect(group.scenarios.flatMap(({ candidates }) => candidates)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            netDiscountRateFraction: expect.any(String),
            sourceQingbiaoRank: expect.any(Number),
          }),
        ]),
      );
    }
    expect(result.groups.flatMap((group) =>
      group.status === "available" ? group.scenarios : [],
    )).toHaveLength(9);
    expect(hasCompleteDingbiaoSimulation(result)).toBe(true);
  });

  it("averages raw fractions directly without rounding or de-duplication", () => {
    const [first, second, third] = fiveQingbiaoResults;
    if (!first || !second || !third) {
      throw new Error("Golden fixture requires at least three finalists.");
    }
    const result = calculateDingbiaoK1(
      [
        { ...first, netDiscountRateFraction: "0.101" },
        { ...second, netDiscountRateFraction: "0.102" },
        { ...third, netDiscountRateFraction: "0.101" },
      ],
      3,
    );
    expect(result).toEqual({
      status: "calculated",
      dingbiaoK1Fraction: "0.10133333333333333333",
    });
  });

  it("uses M=(1-K1-draw)*(H-C)+C with one Decimal formula entry", () => {
    expect(
      calculateFinalBenchmarkPrice({
        finalistCount: 5,
        finalDrawIndex: 2,
        dingbiaoK1Fraction: "0.1",
        finalDrawValueFraction: "0.01",
        maxBidPrice: "1000",
        nonCompetitiveFee: "100",
      }),
    ).toEqual({
      status: "calculated",
      benchmarkFactor: "0.89",
      benchmarkPriceM: "901",
    });
  });

  it("returns a structured error when 1-K1-draw is non-positive", () => {
    expect(
      calculateFinalBenchmarkPrice({
        finalistCount: 4,
        finalDrawIndex: 3,
        dingbiaoK1Fraction: "0.99",
        finalDrawValueFraction: "0.01",
        maxBidPrice: "1000",
        nonCompetitiveFee: "100",
      }),
    ).toMatchObject({
      status: "validation_error",
      error: {
        code: "NON_POSITIVE_BENCHMARK_FACTOR",
        finalistCount: 4,
        finalDrawIndex: 3,
      },
    });
  });
});

describe("simulation and unavailable policies", () => {
  it.each([
    [0, ["x", "y", "z"], "0"],
    [1, ["our", "y", "z"], "0.33333333333333333333"],
    [2, ["our", "our", "z"], "0.66666666666666666667"],
    [3, ["our", "our", "our"], "1"],
  ] as const)("represents %i/3 wins as a decimal fraction", (wins, winners, rate) => {
    expect(calculateSimulationWinRate("our", winners)).toMatchObject({
      winCount: wins,
      simulationWinRate: rate,
    });
  });

  it("calculates normally without an our-company candidate", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      finalists: fiveQingbiaoResults.map((candidate) => ({
        ...candidate,
        isOurCompany: false,
      })),
    });
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") {
      expect(findAvailableGroup(result.groups, 5).simulationWinRate).toEqual({
        ourCompanyCandidateId: null,
        winCount: 0,
        simulationCount: 3,
        simulationWinRate: "0",
      });
    }
  });

  it("does not manufacture N=5 when only four source results exist", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      finalists: fiveQingbiaoResults.filter(
        ({ sourceQingbiaoRank }) => sourceQingbiaoRank <= 4,
      ),
    });
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") {
      expect(result.groups[0]).toMatchObject({
        status: "unavailable",
        reason: "insufficient_candidates",
        finalistCount: 5,
        availableCandidateCount: 4,
      });
      expect(result.groups[1]?.status).toBe("available");
      expect(result.groups[2]?.status).toBe("available");
    }
  });

  it("returns a structured missing-source state", () => {
    expect(calculateDingbiao({ ...dingbiaoInput, finalists: null })).toEqual({
      status: "qingbiao_result_not_found",
    });
  });
});

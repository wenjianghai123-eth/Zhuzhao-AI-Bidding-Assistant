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

describe("dingbiao finalist selection and K1", () => {
  it("selects Top 5, Top 4 and Top 3 by qingbiao finalRank", () => {
    expect(selectTopFinalists(fiveQingbiaoResults, 5)).toMatchObject({
      status: "available",
      finalists: [
        { candidateId: "c1" },
        { candidateId: "c2" },
        { candidateId: "c3" },
        { candidateId: "c4" },
        { candidateId: "c5" },
      ],
    });
    expect(selectTopFinalists(fiveQingbiaoResults, 4)).toMatchObject({
      status: "available",
      finalists: [
        { candidateId: "c1" },
        { candidateId: "c2" },
        { candidateId: "c3" },
        { candidateId: "c4" },
      ],
    });
    expect(selectTopFinalists(fiveQingbiaoResults, 3)).toMatchObject({
      status: "available",
      finalists: [
        { candidateId: "c1" },
        { candidateId: "c2" },
        { candidateId: "c3" },
      ],
    });
  });

  it("recalculates dingbiaoK1 independently for N=5, N=4 and N=3", () => {
    const result = calculateDingbiao(dingbiaoInput);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }

    expect(findAvailableGroup(result.groups, 5).dingbiaoK1).toBe("14");
    expect(findAvailableGroup(result.groups, 4).dingbiaoK1).toBe("13");
    expect(findAvailableGroup(result.groups, 3).dingbiaoK1).toBe("12");
    expect(
      calculateDingbiaoK1([
        { netDiscountRate: "10.1" },
        { netDiscountRate: "10.2" },
      ]),
    ).toBe("10.15");
  });
});

describe("dingbiao formulas and scenarios", () => {
  it("calculates M only through the approved Excel formula", () => {
    expect(
      calculateFinalBenchmarkPrice({
        dingbiaoK1: "10",
        finalDrawValue: "2",
        maxBidPrice: "1000",
        nonCompetitiveFee: "100",
      }),
    ).toBe("208");
  });

  it("produces three finalDrawValue scenarios for each N and nine scenarios total", () => {
    const result = calculateDingbiao(dingbiaoInput);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }

    const availableGroups = result.groups.filter(
      (group) => group.status === "available",
    );
    expect(availableGroups).toHaveLength(3);
    expect(availableGroups.flatMap((group) => group.scenarios)).toHaveLength(9);
    expect(findAvailableGroup(result.groups, 5).scenarios).toMatchObject([
      { finalDrawSlot: 1, finalDrawValue: "0", benchmarkPriceM: "226" },
      { finalDrawSlot: 2, finalDrawValue: "1", benchmarkPriceM: "235" },
      { finalDrawSlot: 3, finalDrawValue: "2", benchmarkPriceM: "244" },
    ]);
    expect(hasCompleteDingbiaoSimulation(result)).toBe(true);
  });

  it("keeps qingbiaoK2 separate from every finalDrawValue", () => {
    const result = calculateDingbiao(dingbiaoInput);
    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }

    for (const group of result.groups) {
      if (group.status === "available") {
        expect(group.scenarios.map((scenario) => scenario.qingbiaoK2)).toEqual([
          2, 2, 2,
        ]);
        expect(group.scenarios.map((scenario) => scenario.finalDrawValue)).toEqual([
          "0",
          "1",
          "2",
        ]);
      }
    }
  });
});

describe("模拟中标率", () => {
  it.each([
    {
      label: "0/3",
      winners: ["other-1", "other-2", "other-3"],
      winCount: 0,
      simulationWinRate: "0",
    },
    {
      label: "1/3",
      winners: ["our-company", "other-2", "other-3"],
      winCount: 1,
      simulationWinRate: "33.333333333333333333",
    },
    {
      label: "2/3",
      winners: ["our-company", "our-company", "other-3"],
      winCount: 2,
      simulationWinRate: "66.666666666666666667",
    },
    {
      label: "3/3",
      winners: ["our-company", "our-company", "our-company"],
      winCount: 3,
      simulationWinRate: "100",
    },
  ])("calculates our-company $label simulation win rate", (fixture) => {
    expect(
      calculateSimulationWinRate("our-company", fixture.winners),
    ).toEqual({
      ourCompanyCandidateId: "our-company",
      winCount: fixture.winCount,
      simulationCount: 3,
      simulationWinRate: fixture.simulationWinRate,
    });
  });
});

describe("dingbiao structured unavailable states", () => {
  it("marks N=5 unavailable when only four candidates exist", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      qingbiaoResults: fiveQingbiaoResults.filter(
        (candidate) => candidate.finalRank <= 4,
      ),
    });

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.groups[0]).toEqual({
      status: "unavailable",
      reason: "insufficient_candidates",
      finalistCount: 5,
      requiredCandidateCount: 5,
      availableCandidateCount: 4,
    });
    expect(result.groups[1]?.status).toBe("available");
    expect(result.groups[2]?.status).toBe("available");
  });

  it("marks N=5 and N=4 unavailable when only three candidates exist", () => {
    const result = calculateDingbiao({
      ...dingbiaoInput,
      qingbiaoResults: fiveQingbiaoResults.filter(
        (candidate) => candidate.finalRank <= 3,
      ),
    });

    expect(result.status).toBe("calculated");
    if (result.status !== "calculated") {
      return;
    }
    expect(result.groups[0]?.status).toBe("unavailable");
    expect(result.groups[1]).toEqual({
      status: "unavailable",
      reason: "insufficient_candidates",
      finalistCount: 4,
      requiredCandidateCount: 4,
      availableCandidateCount: 3,
    });
    expect(result.groups[2]?.status).toBe("available");
  });

  it("returns a structured state when the selected qingbiao result does not exist", () => {
    expect(
      calculateDingbiao({ ...dingbiaoInput, qingbiaoResults: null }),
    ).toEqual({
      status: "qingbiao_result_not_found",
      qingbiaoK2: 2,
    });
  });
});

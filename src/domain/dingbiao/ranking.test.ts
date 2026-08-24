import { describe, expect, it } from "vitest";

import {
  calculateDifferenceToBenchmark,
  rankDingbiaoCandidates,
} from "@/domain/dingbiao/ranking";

const candidate = (candidateId: string, bidPrice: string) => ({
  candidateId,
  bidPrice,
  netDiscountRateFraction: "0.1",
  isOurCompany: false,
  sourceQingbiaoRank: 1,
});

describe("dingbiao difference and deterministic winner ranking", () => {
  it("calculates the Decimal absolute difference to M", () => {
    expect(calculateDifferenceToBenchmark("123.45", "120.1")).toBe("3.35");
    expect(calculateDifferenceToBenchmark("116.75", "120.1")).toBe("3.35");
  });

  it("prefers the lower bid when differences tie", () => {
    const ranked = rankDingbiaoCandidates(
      [candidate("high", "110"), candidate("low", "90")],
      "100",
    );
    expect(ranked.map(({ candidateId, rank, isWinner }) => ({
      candidateId,
      rank,
      isWinner,
    }))).toEqual([
      { candidateId: "low", rank: 1, isWinner: true },
      { candidateId: "high", rank: 2, isWinner: false },
    ]);
  });

  it("uses candidateId when difference and bid are both identical", () => {
    const ranked = rankDingbiaoCandidates(
      [candidate("candidate-b", "100"), candidate("candidate-a", "100")],
      "100",
    );
    expect(ranked.map(({ candidateId }) => candidateId)).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
    expect(ranked.filter(({ isWinner }) => isWinner)).toHaveLength(1);
  });
});

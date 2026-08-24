import type {
  DingbiaoCalculationInput,
  DingbiaoFinalistCount,
  DingbiaoFinalistInput,
  FinalDrawIndex,
} from "@/domain/dingbiao";

export const dingbiaoGoldenFinalists: readonly DingbiaoFinalistInput[] = [
  {
    candidateId: "c4",
    bidPrice: "920",
    netDiscountRateFraction: "0.11",
    isOurCompany: false,
    sourceQingbiaoRank: 4,
  },
  {
    candidateId: "c2",
    bidPrice: "915",
    netDiscountRateFraction: "0.09",
    isOurCompany: false,
    sourceQingbiaoRank: 2,
  },
  {
    candidateId: "c5",
    bidPrice: "890",
    netDiscountRateFraction: "0.12",
    isOurCompany: false,
    sourceQingbiaoRank: 5,
  },
  {
    candidateId: "c1",
    bidPrice: "905",
    netDiscountRateFraction: "0.08",
    isOurCompany: true,
    sourceQingbiaoRank: 1,
  },
  {
    candidateId: "c3",
    bidPrice: "895",
    netDiscountRateFraction: "0.1",
    isOurCompany: false,
    sourceQingbiaoRank: 3,
  },
];

export const dingbiaoGoldenInput: DingbiaoCalculationInput = {
  finalists: dingbiaoGoldenFinalists,
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  finalDrawValueFractions: ["0", "0.01", "0.02"],
};

export const dingbiaoGoldenExpected: readonly {
  finalistCount: DingbiaoFinalistCount;
  dingbiaoK1Fraction: string;
  simulationWinRate: string;
  scenarios: readonly {
    finalDrawIndex: FinalDrawIndex;
    finalDrawValueFraction: string;
    benchmarkPriceM: string;
    winnerCandidateId: string;
  }[];
}[] = [
  {
    finalistCount: 5,
    dingbiaoK1Fraction: "0.1",
    simulationWinRate: "0.66666666666666666667",
    scenarios: [
      {
        finalDrawIndex: 1,
        finalDrawValueFraction: "0",
        benchmarkPriceM: "910",
        winnerCandidateId: "c1",
      },
      {
        finalDrawIndex: 2,
        finalDrawValueFraction: "0.01",
        benchmarkPriceM: "901",
        winnerCandidateId: "c1",
      },
      {
        finalDrawIndex: 3,
        finalDrawValueFraction: "0.02",
        benchmarkPriceM: "892",
        winnerCandidateId: "c5",
      },
    ],
  },
  {
    finalistCount: 4,
    dingbiaoK1Fraction: "0.095",
    simulationWinRate: "0.33333333333333333333",
    scenarios: [
      {
        finalDrawIndex: 1,
        finalDrawValueFraction: "0",
        benchmarkPriceM: "914.5",
        winnerCandidateId: "c2",
      },
      {
        finalDrawIndex: 2,
        finalDrawValueFraction: "0.01",
        benchmarkPriceM: "905.5",
        winnerCandidateId: "c1",
      },
      {
        finalDrawIndex: 3,
        finalDrawValueFraction: "0.02",
        benchmarkPriceM: "896.5",
        winnerCandidateId: "c3",
      },
    ],
  },
  {
    finalistCount: 3,
    dingbiaoK1Fraction: "0.09",
    simulationWinRate: "0.66666666666666666667",
    scenarios: [
      {
        finalDrawIndex: 1,
        finalDrawValueFraction: "0",
        benchmarkPriceM: "919",
        winnerCandidateId: "c2",
      },
      {
        finalDrawIndex: 2,
        finalDrawValueFraction: "0.01",
        benchmarkPriceM: "910",
        winnerCandidateId: "c1",
      },
      {
        finalDrawIndex: 3,
        finalDrawValueFraction: "0.02",
        benchmarkPriceM: "901",
        winnerCandidateId: "c1",
      },
    ],
  },
];

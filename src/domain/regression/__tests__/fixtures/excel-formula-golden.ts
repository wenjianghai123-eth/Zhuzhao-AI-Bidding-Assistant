import type { DingbiaoFinalistCount } from "@/domain/dingbiao";
import type {
  QingbiaoCandidateInput,
  QingbiaoScenarioInput,
  QingbiaoScenarioResult,
} from "@/domain/qingbiao";

interface ExcelGoldenCandidate extends QingbiaoCandidateInput {
  netDiscountRateFraction: string;
  isOurCompany: boolean;
}

export interface ExcelGoldenDingbiaoScenarioExpectation {
  finalDrawSlot: 1 | 2 | 3;
  finalDrawValue: string;
  benchmarkPriceM: string;
  winnerCandidateId: string;
  candidates: readonly {
    candidateId: string;
    differenceToM: string;
    rank: number;
  }[];
}

export interface ExcelGoldenDingbiaoGroupExpectation {
  finalistCount: DingbiaoFinalistCount;
  dingbiaoK1: string;
  simulationWinRate: string;
  scenarios: readonly ExcelGoldenDingbiaoScenarioExpectation[];
}

const candidates: readonly ExcelGoldenCandidate[] = [
  {
    candidateId: "c1",
    bidPrice: "790",
    performance: { status: "available", averageScore: "60" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.76",
    isOurCompany: false,
  },
  {
    candidateId: "c2",
    bidPrice: "830",
    performance: { status: "available", averageScore: "67" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.8",
    isOurCompany: false,
  },
  {
    candidateId: "c3",
    bidPrice: "840",
    performance: { status: "available", averageScore: "71" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.82",
    isOurCompany: true,
  },
  {
    candidateId: "c4",
    bidPrice: "865",
    performance: { status: "available", averageScore: "82" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.85",
    isOurCompany: false,
  },
  {
    candidateId: "c5",
    bidPrice: "760",
    performance: { status: "available", averageScore: "91" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.74",
    isOurCompany: false,
  },
  {
    candidateId: "c6",
    bidPrice: "900",
    performance: { status: "available", averageScore: "100" },
    trademarkScore: "9",
    technicalScore: "9",
    similarExperienceScore: "5",
    otherScore: "5",
    netDiscountRateFraction: "0.88",
    isOurCompany: false,
  },
];

const qingbiaoInput: QingbiaoScenarioInput = {
  qingbiaoK2: 0,
  selectedCandidateIds: ["c1", "c2", "c3"],
  candidates,
  rules: {
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    totalBidPriceScore: "40",
    rankDeduction: "2",
  },
};

const expectedQingbiao: QingbiaoScenarioResult = {
  qingbiaoK2: 0,
  referencePriceB: "820",
  qingbiaoK1: "0.2",
  candidates: [
    {
      candidateId: "c2",
      performanceAverage: "67",
      performanceScore: "1.75",
      priceDifference: "10",
      priceRank: 1,
      priceScore: "40",
      totalScore: "51.75",
      finalRank: 1,
    },
    {
      candidateId: "c3",
      performanceAverage: "71",
      performanceScore: "2.75",
      priceDifference: "20",
      priceRank: 2,
      priceScore: "38",
      totalScore: "50.75",
      finalRank: 2,
    },
    {
      candidateId: "c6",
      performanceAverage: "100",
      performanceScore: "10",
      priceDifference: "80",
      priceRank: 6,
      priceScore: "30",
      totalScore: "50",
      finalRank: 3,
    },
    {
      candidateId: "c5",
      performanceAverage: "91",
      performanceScore: "7.75",
      priceDifference: "60",
      priceRank: 5,
      priceScore: "32",
      totalScore: "49.75",
      finalRank: 4,
    },
    {
      candidateId: "c4",
      performanceAverage: "82",
      performanceScore: "5.5",
      priceDifference: "45",
      priceRank: 4,
      priceScore: "34",
      totalScore: "49.5",
      finalRank: 5,
    },
    {
      candidateId: "c1",
      performanceAverage: "60",
      performanceScore: "0",
      priceDifference: "30",
      priceRank: 3,
      priceScore: "36",
      totalScore: "46",
      finalRank: 6,
    },
  ],
};

const expectedDingbiao: readonly ExcelGoldenDingbiaoGroupExpectation[] = [
  {
    finalistCount: 5,
    dingbiaoK1: "0.818",
    simulationWinRate: "0.66666666666666666667",
    scenarios: [
      {
        finalDrawSlot: 1,
        finalDrawValue: "0",
        benchmarkPriceM: "836.2",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "3.8", rank: 1 },
          { candidateId: "c2", differenceToM: "6.2", rank: 2 },
          { candidateId: "c4", differenceToM: "28.8", rank: 3 },
          { candidateId: "c6", differenceToM: "63.8", rank: 4 },
          { candidateId: "c5", differenceToM: "76.2", rank: 5 },
        ],
      },
      {
        finalDrawSlot: 2,
        finalDrawValue: "0.01",
        benchmarkPriceM: "845.2",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "5.2", rank: 1 },
          { candidateId: "c2", differenceToM: "15.2", rank: 2 },
          { candidateId: "c4", differenceToM: "19.8", rank: 3 },
          { candidateId: "c6", differenceToM: "54.8", rank: 4 },
          { candidateId: "c5", differenceToM: "85.2", rank: 5 },
        ],
      },
      {
        finalDrawSlot: 3,
        finalDrawValue: "0.02",
        benchmarkPriceM: "854.2",
        winnerCandidateId: "c4",
        candidates: [
          { candidateId: "c4", differenceToM: "10.8", rank: 1 },
          { candidateId: "c3", differenceToM: "14.2", rank: 2 },
          { candidateId: "c2", differenceToM: "24.2", rank: 3 },
          { candidateId: "c6", differenceToM: "45.8", rank: 4 },
          { candidateId: "c5", differenceToM: "94.2", rank: 5 },
        ],
      },
    ],
  },
  {
    finalistCount: 4,
    dingbiaoK1: "0.81",
    simulationWinRate: "0.66666666666666666667",
    scenarios: [
      {
        finalDrawSlot: 1,
        finalDrawValue: "0",
        benchmarkPriceM: "829",
        winnerCandidateId: "c2",
        candidates: [
          { candidateId: "c2", differenceToM: "1", rank: 1 },
          { candidateId: "c3", differenceToM: "11", rank: 2 },
          { candidateId: "c5", differenceToM: "69", rank: 3 },
          { candidateId: "c6", differenceToM: "71", rank: 4 },
        ],
      },
      {
        finalDrawSlot: 2,
        finalDrawValue: "0.01",
        benchmarkPriceM: "838",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "2", rank: 1 },
          { candidateId: "c2", differenceToM: "8", rank: 2 },
          { candidateId: "c6", differenceToM: "62", rank: 3 },
          { candidateId: "c5", differenceToM: "78", rank: 4 },
        ],
      },
      {
        finalDrawSlot: 3,
        finalDrawValue: "0.02",
        benchmarkPriceM: "847",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "7", rank: 1 },
          { candidateId: "c2", differenceToM: "17", rank: 2 },
          { candidateId: "c6", differenceToM: "53", rank: 3 },
          { candidateId: "c5", differenceToM: "87", rank: 4 },
        ],
      },
    ],
  },
  {
    finalistCount: 3,
    dingbiaoK1: "0.83333333333333333333",
    simulationWinRate: "1",
    scenarios: [
      {
        finalDrawSlot: 1,
        finalDrawValue: "0",
        benchmarkPriceM: "850",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "10", rank: 1 },
          { candidateId: "c2", differenceToM: "20", rank: 2 },
          { candidateId: "c6", differenceToM: "50", rank: 3 },
        ],
      },
      {
        finalDrawSlot: 2,
        finalDrawValue: "0.01",
        benchmarkPriceM: "859",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "19", rank: 1 },
          { candidateId: "c2", differenceToM: "29", rank: 2 },
          { candidateId: "c6", differenceToM: "41", rank: 3 },
        ],
      },
      {
        finalDrawSlot: 3,
        finalDrawValue: "0.02",
        benchmarkPriceM: "868",
        winnerCandidateId: "c3",
        candidates: [
          { candidateId: "c3", differenceToM: "28", rank: 1 },
          { candidateId: "c6", differenceToM: "32", rank: 2 },
          { candidateId: "c2", differenceToM: "38", rank: 3 },
        ],
      },
    ],
  },
];

export const excelFormulaGoldenFixture = {
  source: "投标伴侣方案设计.xlsx中的文字公式（原文件没有数值样例）",
  candidates,
  qingbiaoInput,
  finalDrawValueFractions: ["0", "0.01", "0.02"] as const,
  expectedQingbiao,
  expectedDingbiao,
};

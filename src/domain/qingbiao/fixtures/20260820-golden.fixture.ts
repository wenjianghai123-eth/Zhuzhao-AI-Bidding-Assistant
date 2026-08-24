import type {
  QingbiaoCandidateV2Input,
  QingbiaoScenarioV2Input,
  QingbiaoScenarioV2Result,
} from "@/domain/qingbiao/v2-types";

const candidates: readonly QingbiaoCandidateV2Input[] = [
  {
    candidateId: "A",
    bidPrice: "905.5",
    netDiscountRateFraction: "0.1038",
    performance: { status: "available", averageScore: "60" },
    trademarkScore: "999",
    technicalScore: "999",
    similarExperienceScore: "10",
    otherScore: "0",
  },
  {
    candidateId: "B",
    bidPrice: "900",
    netDiscountRateFraction: "0.1041",
    performance: { status: "available", averageScore: "70" },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "9.5",
    otherScore: "0",
  },
  {
    candidateId: "C",
    bidPrice: "911",
    netDiscountRateFraction: "0.0949",
    performance: { status: "available", averageScore: "80" },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "0",
  },
  {
    candidateId: "D",
    bidPrice: "890",
    netDiscountRateFraction: "0.0952",
    performance: { status: "available", averageScore: "90" },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "0",
  },
  {
    candidateId: "E",
    bidPrice: "921",
    netDiscountRateFraction: "0.086",
    performance: { status: "available", averageScore: "100" },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "0",
  },
  {
    candidateId: "F",
    bidPrice: "905.5",
    netDiscountRateFraction: "0.12",
    performance: { status: "available", averageScore: "80" },
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "6",
    otherScore: "0",
  },
];

const input: QingbiaoScenarioV2Input = {
  scenario: {
    exclusionRuleId: "rule-1",
    qingbiaoK2Value: 1,
  },
  excludedCandidateIds: ["F"],
  candidates,
  rules: {
    maxBidPrice: "1000",
    nonCompetitiveFee: "100",
    totalBidPriceScore: "50",
    rankDeduction: "1",
  },
};

// Manual derivation:
// 10.38, 10.41, 9.49, 9.52, 8.60 percentage points
// -> HALF_UP integers 10, 10, 9, 10, 9
// -> unique 10, 9
// -> average 9.5 points -> K1 fraction 0.095
// K2=1 -> rate 0.01
// B=(1-0.095-0.01)*(1000-100)+100=905.5
const expectedOrderedResults = [
    {
      candidateId: "A",
      bidPrice: "905.5",
      netDiscountRateFraction: "0.1038",
      performanceAverage: "60",
      performanceScore: "0",
      priceDifference: "0",
      priceRank: 1,
      priceScore: "50",
      totalScore: "60",
      finalRank: 1,
    },
    {
      candidateId: "F",
      bidPrice: "905.5",
      netDiscountRateFraction: "0.12",
      performanceAverage: "80",
      performanceScore: "5",
      priceDifference: "0",
      priceRank: 2,
      priceScore: "49",
      totalScore: "60",
      finalRank: 2,
    },
    {
      candidateId: "B",
      bidPrice: "900",
      netDiscountRateFraction: "0.1041",
      performanceAverage: "70",
      performanceScore: "2.5",
      priceDifference: "5.5",
      priceRank: 3,
      priceScore: "48",
      totalScore: "60",
      finalRank: 3,
    },
    {
      candidateId: "E",
      bidPrice: "921",
      netDiscountRateFraction: "0.086",
      performanceAverage: "100",
      performanceScore: "10",
      priceDifference: "15.5",
      priceRank: 6,
      priceScore: "45",
      totalScore: "60",
      finalRank: 4,
    },
    {
      candidateId: "D",
      bidPrice: "890",
      netDiscountRateFraction: "0.0952",
      performanceAverage: "90",
      performanceScore: "7.5",
      priceDifference: "15.5",
      priceRank: 5,
      priceScore: "46",
      totalScore: "58.5",
      finalRank: 5,
    },
    {
      candidateId: "C",
      bidPrice: "911",
      netDiscountRateFraction: "0.0949",
      performanceAverage: "80",
      performanceScore: "5",
      priceDifference: "5.5",
      priceRank: 4,
      priceScore: "47",
      totalScore: "57",
      finalRank: 6,
    },
  ] as const;

const expectedScenario: QingbiaoScenarioV2Result = {
  metadata: {
    ruleVersion: "qingbiao-20260820-v2",
    exclusionRuleId: "rule-1",
    excludedCandidateIds: ["F"],
    k1CandidateIds: ["A", "B", "C", "D", "E"],
    rankingCandidateIds: ["A", "B", "C", "D", "E", "F"],
    rankingCandidatePolicy: "ALL_CANDIDATES",
    roundingMode: "HALF_UP",
  },
  qingbiaoK1Fraction: "0.095",
  qingbiaoK2Value: 1,
  qingbiaoK2Rate: "0.01",
  referencePriceB: "905.5",
  k1Calculation: {
    roundingMode: "HALF_UP",
    roundedCandidates: [
      {
        candidateId: "A",
        netDiscountRateFraction: "0.1038",
        percentagePoints: "10.38",
        roundedPercentagePoints: "10",
      },
      {
        candidateId: "B",
        netDiscountRateFraction: "0.1041",
        percentagePoints: "10.41",
        roundedPercentagePoints: "10",
      },
      {
        candidateId: "C",
        netDiscountRateFraction: "0.0949",
        percentagePoints: "9.49",
        roundedPercentagePoints: "9",
      },
      {
        candidateId: "D",
        netDiscountRateFraction: "0.0952",
        percentagePoints: "9.52",
        roundedPercentagePoints: "10",
      },
      {
        candidateId: "E",
        netDiscountRateFraction: "0.086",
        percentagePoints: "8.6",
        roundedPercentagePoints: "9",
      },
    ],
    uniqueRoundedPercentagePoints: ["10", "9"],
    qingbiaoK1Fraction: "0.095",
  },
  orderedResults: expectedOrderedResults,
  top5: expectedOrderedResults.slice(0, 5),
};

export const qingbiao20260820GoldenFixture = {
  source:
    "投标伴侣方案设计_20260820.xlsx文字规则；数值为人工构造并按规则逐步复核",
  candidates,
  input,
  expectedK2Scenarios: [
    { qingbiaoK2Value: 0 as const, qingbiaoK2Rate: "0", referencePriceB: "914.5" },
    { qingbiaoK2Value: 1 as const, qingbiaoK2Rate: "0.01", referencePriceB: "905.5" },
    { qingbiaoK2Value: 2 as const, qingbiaoK2Rate: "0.02", referencePriceB: "896.5" },
    { qingbiaoK2Value: 3 as const, qingbiaoK2Rate: "0.03", referencePriceB: "887.5" },
  ],
  expectedScenario,
};

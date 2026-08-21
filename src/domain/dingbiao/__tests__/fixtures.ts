import type {
  DingbiaoCalculationInput,
  DingbiaoFinalistCount,
  DingbiaoFinalistGroupResult,
  DingbiaoQingbiaoResultInput,
} from "@/domain/dingbiao";

export const fiveQingbiaoResults: readonly DingbiaoQingbiaoResultInput[] = [
  {
    candidateId: "c4",
    bidPrice: "210",
    netDiscountRate: "16",
    isOurCompany: false,
    finalRank: 4,
  },
  {
    candidateId: "c2",
    bidPrice: "190",
    netDiscountRate: "12",
    isOurCompany: false,
    finalRank: 2,
  },
  {
    candidateId: "c5",
    bidPrice: "220",
    netDiscountRate: "18",
    isOurCompany: false,
    finalRank: 5,
  },
  {
    candidateId: "c1",
    bidPrice: "180",
    netDiscountRate: "10",
    isOurCompany: true,
    finalRank: 1,
  },
  {
    candidateId: "c3",
    bidPrice: "200",
    netDiscountRate: "14",
    isOurCompany: false,
    finalRank: 3,
  },
];

export const dingbiaoInput: DingbiaoCalculationInput = {
  qingbiaoK2: 2,
  qingbiaoResults: fiveQingbiaoResults,
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  finalDrawValues: ["0", "1", "2"],
};

export function findAvailableGroup(
  groups: readonly DingbiaoFinalistGroupResult[],
  finalistCount: DingbiaoFinalistCount,
) {
  const group = groups.find(
    (candidateGroup) => candidateGroup.finalistCount === finalistCount,
  );
  if (!group || group.status !== "available") {
    throw new Error(`Expected N=${finalistCount} group to be available.`);
  }
  return group;
}

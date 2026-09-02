import Decimal from "decimal.js";

import {
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import type { QingbiaoPageData } from "@/server/application/qingbiao-service";
import type {
  SavedQingbiaoCalculationSnapshot,
  SavedQingbiaoScenarioSnapshot,
} from "@/server/repositories/qingbiao-repository";

export const QINGBIAO_RULE_PRESENTATIONS: Readonly<
  Record<
    QingbiaoExclusionRuleIndex,
    { label: string; shortDescription: string }
  >
> = {
  1: {
    label: "推优单位随机剔除（1名最高报价投标人）",
    shortDescription: "按投标总价自动剔除报价最高的1家单位",
  },
  2: {
    label: "推优单位随机剔除（2名较高报价投标人）",
    shortDescription: "按投标总价自动剔除报价最高的前2家单位",
  },
  3: {
    label: "推优单位随机剔除（1/3 较高报价投标人）",
    shortDescription:
      "按候选总数的1/3执行ROUND_HALF_UP取整，并自动剔除对应数量的高报价单位",
  },
  4: {
    label: "推优单位随机剔除（1/4 较高报价投标人）",
    shortDescription:
      "按候选总数的1/4执行ROUND_HALF_UP取整，并自动剔除对应数量的高报价单位",
  },
};

export interface QingbiaoHypotheticalDrawViewModel {
  bValue: string | null;
  difference: string | null;
  rank: number | null;
  priceScore: string | null;
}

export interface QingbiaoResultTableRowViewModel {
  candidateId: string;
  displayOrder: number;
  companyName: string;
  isOurCompany: boolean;
  bidPrice: string;
  netDiscountRateFraction: string;
  businessPreferred: boolean;
  technicalPreferred: boolean;
  totalBidPriceScore: string;
  weightedPerformanceAverage: string | null;
  performanceScore: string | null;
  similarExperienceScore: string;
  otherScore: string;
  averageK1Fraction: string | null;
  k2TotalScores: Readonly<Record<QingbiaoK2Value, string | null>>;
  hypotheticalDraws: Readonly<
    Record<QingbiaoK2Value, QingbiaoHypotheticalDrawViewModel>
  >;
}

export interface QingbiaoRuleResultViewModel {
  ruleIndex: QingbiaoExclusionRuleIndex;
  ruleLabel: string;
  ruleDescription: string;
  exclusionCount: number;
  excludedCandidateNames: readonly string[];
  rows: readonly QingbiaoResultTableRowViewModel[];
}

export interface QingbiaoResultViewModel {
  weightedPerformanceState: "current" | "missing" | "stale";
  rules: readonly QingbiaoRuleResultViewModel[];
}

function scenarioFor(
  calculation: SavedQingbiaoCalculationSnapshot,
  ruleIndex: QingbiaoExclusionRuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
) {
  return calculation.scenarios.find(
    (scenario) =>
      scenario.ruleIndex === ruleIndex &&
      scenario.qingbiaoK2Value === qingbiaoK2Value,
  );
}

function candidateResult(
  scenario: SavedQingbiaoScenarioSnapshot | undefined,
  candidateId: string,
) {
  return scenario?.orderedResults.find(
    (candidate) => candidate.candidateId === candidateId,
  );
}

function isPreferred(value: string) {
  try {
    return !new Decimal(value).isZero();
  } catch {
    return false;
  }
}

function mapK2Values<T>(
  mapper: (qingbiaoK2Value: QingbiaoK2Value) => T,
): Readonly<Record<QingbiaoK2Value, T>> {
  return {
    0: mapper(0),
    1: mapper(1),
    2: mapper(2),
    3: mapper(3),
  };
}

export function buildQingbiaoResultViewModel(
  pageData: QingbiaoPageData,
  calculation: SavedQingbiaoCalculationSnapshot,
): QingbiaoResultViewModel {
  const candidatesById = new Map(
    pageData.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const weightedPerformanceState =
    pageData.performanceWeightedSnapshotStatus === "stale"
      ? "stale"
      : pageData.performanceWeightedSnapshotStatus !== "current" ||
          pageData.candidates.some(
            (candidate) => candidate.performance.status === "missing",
          )
        ? "missing"
        : "current";

  return {
    weightedPerformanceState,
    rules: QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
      const rule = pageData.exclusionRules.find(
        (candidateRule) => candidateRule.ruleIndex === ruleIndex,
      );
      const scenarios = new Map(
        QINGBIAO_K2_VALUES.map((qingbiaoK2Value) => [
          qingbiaoK2Value,
          scenarioFor(calculation, ruleIndex, qingbiaoK2Value),
        ]),
      );
      const baseline = scenarios.get(0);
      const presentation = QINGBIAO_RULE_PRESENTATIONS[ruleIndex];
      const excludedCandidateNames = (rule?.excludedCandidateIds ?? []).map(
        (candidateId) =>
          candidatesById.get(candidateId)?.companyName ?? candidateId,
      );

      return {
        ruleIndex,
        ruleLabel: presentation.label,
        ruleDescription: presentation.shortDescription,
        exclusionCount: rule?.exclusionCount ?? 0,
        excludedCandidateNames,
        rows: pageData.candidates.map((candidate, index) => {
          const baselineResult = candidateResult(baseline, candidate.id);
          return {
            candidateId: candidate.id,
            displayOrder: index + 1,
            companyName: candidate.companyName,
            isOurCompany: candidate.isOurCompany,
            bidPrice: candidate.bidPrice,
            netDiscountRateFraction: candidate.netDiscountRateFraction,
            businessPreferred: isPreferred(candidate.trademarkScore),
            technicalPreferred: isPreferred(candidate.technicalScore),
            totalBidPriceScore: pageData.totalBidPriceScore,
            weightedPerformanceAverage:
              weightedPerformanceState === "current" &&
              candidate.performance.status === "available"
                ? candidate.performance.averageScore
                : null,
            performanceScore:
              weightedPerformanceState === "current"
                ? (baselineResult?.performanceScore ?? null)
                : null,
            similarExperienceScore: candidate.similarExperienceScore,
            otherScore: candidate.otherScore,
            averageK1Fraction: baseline?.qingbiaoK1Fraction ?? null,
            k2TotalScores: mapK2Values(
              (qingbiaoK2Value) =>
                candidateResult(
                  scenarios.get(qingbiaoK2Value),
                  candidate.id,
                )?.totalScore ?? null,
            ),
            hypotheticalDraws: mapK2Values((qingbiaoK2Value) => {
                const scenario = scenarios.get(qingbiaoK2Value);
                const result = candidateResult(scenario, candidate.id);
                return {
                  bValue: scenario?.referencePriceB ?? null,
                  difference: result?.priceDifference ?? null,
                  rank: result?.priceRank ?? null,
                  priceScore: result?.priceScore ?? null,
                };
              }),
          };
        }),
      };
    }),
  };
}

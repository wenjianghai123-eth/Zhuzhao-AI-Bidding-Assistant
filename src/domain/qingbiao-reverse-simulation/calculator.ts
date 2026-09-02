import Decimal from "decimal.js";

import {
  calculateAutomaticExclusionRules,
  calculateQingbiaoScenarioV2,
  CURRENT_QINGBIAO_RULE_VERSION,
  QINGBIAO_EXCLUSION_RULE_INDEXES,
  QINGBIAO_K2_VALUES,
  type QingbiaoExclusionRuleIndex,
  type QingbiaoK2Value,
} from "@/domain/qingbiao";
import { calculateBidPriceFromNetDiscountRate } from "@/domain/qingbiao-reverse-simulation/pricing";
import {
  DEFAULT_QINGBIAO_ENTRY_GUARANTEE_SEARCH_POLICY,
  type QingbiaoEntryGuaranteeCalculationResult,
  type QingbiaoEntryGuaranteeInput,
  type QingbiaoEntryGuaranteeInterval,
  type QingbiaoEntryGuaranteeRateInterval,
  type QingbiaoEntryGuaranteeScenarioResult,
  type QingbiaoEntryGuaranteeSearchPolicy,
  type QingbiaoEntryGuaranteeTarget,
  type QingbiaoEntryGuaranteeTargetResult,
} from "@/domain/qingbiao-reverse-simulation/types";

const TARGET_RANK_THRESHOLDS = {
  TOP5: 5,
  TOP3: 3,
} as const satisfies Readonly<Record<QingbiaoEntryGuaranteeTarget, 3 | 5>>;

interface MutableRateIntervalTracker {
  activeStart: string | null;
  latestFeasibleRate: string | null;
  intervals: QingbiaoEntryGuaranteeRateInterval[];
}

interface ValidatedSearchPolicy {
  minimumRateFraction: Decimal;
  maximumRateFraction: Decimal;
  rateStepFraction: Decimal;
  serialized: QingbiaoEntryGuaranteeSearchPolicy;
}

function scenarioIdentity(
  ruleIndex: QingbiaoExclusionRuleIndex,
  qingbiaoK2Value: QingbiaoK2Value,
) {
  return `${ruleIndex}:${qingbiaoK2Value}`;
}

function createIntervalTracker(): MutableRateIntervalTracker {
  return { activeStart: null, latestFeasibleRate: null, intervals: [] };
}

function recordRateFeasibility(
  tracker: MutableRateIntervalTracker,
  rateFraction: string,
  feasible: boolean,
) {
  if (feasible) {
    tracker.activeStart ??= rateFraction;
    tracker.latestFeasibleRate = rateFraction;
    return;
  }
  closeIntervalTracker(tracker);
}

function closeIntervalTracker(tracker: MutableRateIntervalTracker) {
  if (tracker.activeStart !== null && tracker.latestFeasibleRate !== null) {
    tracker.intervals.push({
      minimumRateFraction: tracker.activeStart,
      maximumRateFraction: tracker.latestFeasibleRate,
    });
  }
  tracker.activeStart = null;
  tracker.latestFeasibleRate = null;
}

function parseFiniteDecimal(value: string) {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function validateSearchPolicy(
  policy: QingbiaoEntryGuaranteeSearchPolicy,
): ValidatedSearchPolicy | null {
  const minimumRateFraction = parseFiniteDecimal(policy.minimumRateFraction);
  const maximumRateFraction = parseFiniteDecimal(policy.maximumRateFraction);
  const rateStepFraction = parseFiniteDecimal(policy.rateStepFraction);
  if (
    !minimumRateFraction ||
    !maximumRateFraction ||
    !rateStepFraction ||
    minimumRateFraction.isNegative() ||
    maximumRateFraction.greaterThan(1) ||
    maximumRateFraction.lessThan(minimumRateFraction) ||
    !rateStepFraction.greaterThan(0) ||
    rateStepFraction.greaterThan(
      maximumRateFraction.minus(minimumRateFraction),
    )
  ) {
    return null;
  }
  return {
    minimumRateFraction,
    maximumRateFraction,
    rateStepFraction,
    serialized: {
      minimumRateFraction: minimumRateFraction.toString(),
      maximumRateFraction: maximumRateFraction.toString(),
      rateStepFraction: rateStepFraction.toString(),
    },
  };
}

function intersectTwoIntervalSets(
  left: readonly QingbiaoEntryGuaranteeRateInterval[],
  right: readonly QingbiaoEntryGuaranteeRateInterval[],
) {
  const intersections: QingbiaoEntryGuaranteeRateInterval[] = [];
  for (const leftInterval of left) {
    for (const rightInterval of right) {
      const minimumRateFraction = Decimal.max(
        leftInterval.minimumRateFraction,
        rightInterval.minimumRateFraction,
      );
      const maximumRateFraction = Decimal.min(
        leftInterval.maximumRateFraction,
        rightInterval.maximumRateFraction,
      );
      if (minimumRateFraction.lessThanOrEqualTo(maximumRateFraction)) {
        intersections.push({
          minimumRateFraction: minimumRateFraction.toString(),
          maximumRateFraction: maximumRateFraction.toString(),
        });
      }
    }
  }
  return intersections;
}

export function calculateGlobalEntryGuarantee(
  scenarioIntervals: readonly (readonly QingbiaoEntryGuaranteeRateInterval[])[],
): readonly QingbiaoEntryGuaranteeRateInterval[] {
  const first = scenarioIntervals[0];
  if (!first) {
    return [];
  }
  return scenarioIntervals
    .slice(1)
    .reduce<readonly QingbiaoEntryGuaranteeRateInterval[]>(
      (current, next) => intersectTwoIntervalSets(current, next),
      first,
    );
}

function mapRateIntervalToBidPrice(
  interval: QingbiaoEntryGuaranteeRateInterval,
  rules: QingbiaoEntryGuaranteeInput["rules"],
): QingbiaoEntryGuaranteeInterval {
  const bidAtMinimumRate = calculateBidPriceFromNetDiscountRate({
    netDiscountRateFraction: interval.minimumRateFraction,
    maxBidPrice: rules.maxBidPrice,
    nonCompetitiveFee: rules.nonCompetitiveFee,
  });
  const bidAtMaximumRate = calculateBidPriceFromNetDiscountRate({
    netDiscountRateFraction: interval.maximumRateFraction,
    maxBidPrice: rules.maxBidPrice,
    nonCompetitiveFee: rules.nonCompetitiveFee,
  });
  if (!bidAtMinimumRate.success || !bidAtMaximumRate.success) {
    throw new RangeError("Validated entry-guarantee rate could not be priced.");
  }
  return {
    ...interval,
    minimumBidPrice: bidAtMaximumRate.bidPrice,
    maximumBidPrice: bidAtMinimumRate.bidPrice,
  };
}

function trackersForTarget() {
  return new Map(
    QINGBIAO_EXCLUSION_RULE_INDEXES.flatMap((ruleIndex) =>
      QINGBIAO_K2_VALUES.map(
        (qingbiaoK2Value) =>
          [
            scenarioIdentity(ruleIndex, qingbiaoK2Value),
            createIntervalTracker(),
          ] as const,
      ),
    ),
  );
}

function completeTargetResult(input: {
  target: QingbiaoEntryGuaranteeTarget;
  trackers: ReadonlyMap<string, MutableRateIntervalTracker>;
  exclusionRules: QingbiaoEntryGuaranteeInput["exclusionRules"];
  rules: QingbiaoEntryGuaranteeInput["rules"];
}): QingbiaoEntryGuaranteeTargetResult {
  const scenarios: QingbiaoEntryGuaranteeScenarioResult[] = [];
  for (const ruleIndex of QINGBIAO_EXCLUSION_RULE_INDEXES) {
    const exclusionRule = input.exclusionRules.find(
      (rule) => rule.ruleIndex === ruleIndex,
    );
    if (!exclusionRule) {
      throw new RangeError(`Validated exclusion rule ${ruleIndex} is missing.`);
    }
    for (const qingbiaoK2Value of QINGBIAO_K2_VALUES) {
      const tracker = input.trackers.get(
        scenarioIdentity(ruleIndex, qingbiaoK2Value),
      );
      if (!tracker) {
        throw new RangeError("Entry-guarantee interval tracker is missing.");
      }
      closeIntervalTracker(tracker);
      scenarios.push({
        exclusionRuleId: exclusionRule.exclusionRuleId,
        ruleIndex,
        qingbiaoK2Value,
        intervals: tracker.intervals.map((interval) =>
          mapRateIntervalToBidPrice(interval, input.rules),
        ),
      });
    }
  }
  const globalRateIntervals = calculateGlobalEntryGuarantee(
    scenarios.map((scenario) => scenario.intervals),
  );
  return {
    target: input.target,
    rankThreshold: TARGET_RANK_THRESHOLDS[input.target],
    scenarios,
    globalIntervals: globalRateIntervals.map((interval) =>
      mapRateIntervalToBidPrice(interval, input.rules),
    ),
  };
}

export function calculateEntryGuaranteeByScenario(
  input: QingbiaoEntryGuaranteeInput,
): QingbiaoEntryGuaranteeCalculationResult {
  const searchPolicy = validateSearchPolicy(
    input.searchPolicy ?? DEFAULT_QINGBIAO_ENTRY_GUARANTEE_SEARCH_POLICY,
  );
  if (!searchPolicy) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_ENTRY_GUARANTEE_INVALID_SEARCH_POLICY",
          message:
            "保障测算搜索范围必须位于0%至100%，且步长必须是小于搜索跨度的正数。",
        },
      ],
    };
  }
  if (
    !input.candidates.some(
      (candidate) => candidate.candidateId === input.ourCandidateId,
    )
  ) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_ENTRY_GUARANTEE_OUR_CANDIDATE_NOT_FOUND",
          message: "我方候选单位不属于当前项目。",
        },
      ],
    };
  }
  if (
    QINGBIAO_EXCLUSION_RULE_INDEXES.some(
      (ruleIndex) =>
        !input.exclusionRules.some((rule) => rule.ruleIndex === ruleIndex),
    )
  ) {
    return {
      success: false,
      errors: [
        {
          code: "QINGBIAO_ENTRY_GUARANTEE_RULE_SET_INCOMPLETE",
          message: "当前项目未配置完整的4条自动推优剔除规则。",
        },
      ],
    };
  }

  const top5Trackers = trackersForTarget();
  const top3Trackers = trackersForTarget();
  let testedRateCount = 0;
  for (
    let rate = searchPolicy.minimumRateFraction;
    rate.lessThanOrEqualTo(searchPolicy.maximumRateFraction);
    rate = rate.plus(searchPolicy.rateStepFraction)
  ) {
    const rateFraction = rate.toString();
    const ourBidPrice = calculateBidPriceFromNetDiscountRate({
      netDiscountRateFraction: rateFraction,
      maxBidPrice: input.rules.maxBidPrice,
      nonCompetitiveFee: input.rules.nonCompetitiveFee,
    });
    if (!ourBidPrice.success) {
      return {
        success: false,
        errors: [
          {
            code: "QINGBIAO_ENTRY_GUARANTEE_INVALID_SEARCH_POLICY",
            message: ourBidPrice.errors.map((error) => error.message).join("；"),
          },
        ],
      };
    }
    const candidates = input.candidates.map((candidate) =>
      candidate.candidateId === input.ourCandidateId
        ? {
            ...candidate,
            bidPrice: ourBidPrice.bidPrice,
            netDiscountRateFraction: rateFraction,
          }
        : candidate,
    );
    const automaticExclusions = calculateAutomaticExclusionRules(
      candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        bidPrice: candidate.bidPrice,
      })),
    );
    if (automaticExclusions.status === "invalid") {
      return {
        success: false,
        errors: [
          {
            code: "QINGBIAO_ENTRY_GUARANTEE_EXCLUSION_FAILED",
            messages: automaticExclusions.errors.map((error) => error.message),
            message: "自动推优剔除规则无法完成保障测算。",
          },
        ],
      };
    }

    for (const automaticRule of automaticExclusions.rules) {
      const exclusionRule = input.exclusionRules.find(
        (rule) => rule.ruleIndex === automaticRule.ruleIndex,
      );
      if (!exclusionRule) {
        return {
          success: false,
          errors: [
            {
              code: "QINGBIAO_ENTRY_GUARANTEE_RULE_SET_INCOMPLETE",
              message: `推优规则${automaticRule.ruleIndex}不存在。`,
            },
          ],
        };
      }
      for (const qingbiaoK2Value of QINGBIAO_K2_VALUES) {
        const scenario = calculateQingbiaoScenarioV2({
          scenario: {
            exclusionRuleId: exclusionRule.exclusionRuleId,
            qingbiaoK2Value,
          },
          excludedCandidateIds: automaticRule.excludedCandidateIds,
          candidates,
          rules: input.rules,
          ruleVersion: CURRENT_QINGBIAO_RULE_VERSION,
          rankingCandidatePolicy: { mode: "ALL_CANDIDATES" },
        });
        if (!scenario.success) {
          return {
            success: false,
            errors: [
              {
                code: "QINGBIAO_ENTRY_GUARANTEE_SCENARIO_FAILED",
                errors: scenario.errors,
                message: `规则${automaticRule.ruleIndex}、K2=${qingbiaoK2Value}%无法完成保障测算。`,
              },
            ],
          };
        }
        const ourResult = scenario.value.orderedResults.find(
          (candidate) => candidate.candidateId === input.ourCandidateId,
        );
        if (!ourResult) {
          return {
            success: false,
            errors: [
              {
                code: "QINGBIAO_ENTRY_GUARANTEE_OUR_RESULT_MISSING",
                message: "正式清标结果中缺少我方候选单位。",
              },
            ],
          };
        }
        const identity = scenarioIdentity(
          automaticRule.ruleIndex,
          qingbiaoK2Value,
        );
        const top5Tracker = top5Trackers.get(identity);
        const top3Tracker = top3Trackers.get(identity);
        if (!top5Tracker || !top3Tracker) {
          throw new RangeError("Entry-guarantee interval tracker is missing.");
        }
        recordRateFeasibility(
          top5Tracker,
          rateFraction,
          ourResult.finalRank <= TARGET_RANK_THRESHOLDS.TOP5,
        );
        recordRateFeasibility(
          top3Tracker,
          rateFraction,
          ourResult.finalRank <= TARGET_RANK_THRESHOLDS.TOP3,
        );
      }
    }
    testedRateCount += 1;
  }

  const top5 = completeTargetResult({
    target: "TOP5",
    trackers: top5Trackers,
    exclusionRules: input.exclusionRules,
    rules: input.rules,
  });
  const top3 = completeTargetResult({
    target: "TOP3",
    trackers: top3Trackers,
    exclusionRules: input.exclusionRules,
    rules: input.rules,
  });
  return {
    success: true,
    value: {
      ourCandidateId: input.ourCandidateId,
      searchPolicy: searchPolicy.serialized,
      testedRateCount,
      targets: { TOP5: top5, TOP3: top3 },
    },
  };
}

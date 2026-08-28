import {
  PERFORMANCE_WEIGHTING_METHODS,
  type PerformanceWeightingMethod,
} from "@/domain/performance/performance-weighted-score";

export const PERFORMANCE_WEIGHTING_METHOD_LABELS = {
  EQUAL_RECENT_12: "等权平均（近12季度算术平均）",
  LINEAR_RECENCY_RECENT_12: "时间线性加权（越近权重越高）",
} as const satisfies Readonly<Record<PerformanceWeightingMethod, string>>;

export const PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS = {
  EQUAL_RECENT_12: "最近最多12个有效季度权重相同。",
  LINEAR_RECENCY_RECENT_12:
    "最近最多12个有效季度按时间由旧到新赋权1、2、…、n，越新的季度权重越高。",
} as const satisfies Readonly<Record<PerformanceWeightingMethod, string>>;

export const PERFORMANCE_WEIGHTING_METHOD_OPTIONS =
  PERFORMANCE_WEIGHTING_METHODS.map((value) => ({
    value,
    label: PERFORMANCE_WEIGHTING_METHOD_LABELS[value],
    description: PERFORMANCE_WEIGHTING_METHOD_DESCRIPTIONS[value],
  }));


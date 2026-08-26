export const PROJECT_TYPE_LOCK_REASONS = [
  "PERFORMANCE_DATA",
  "QINGBIAO_DATA",
  "DINGBIAO_DATA",
  "ANALYSIS_DATA",
] as const;

export type ProjectTypeLockReason =
  (typeof PROJECT_TYPE_LOCK_REASONS)[number];

export interface ProjectTypeDependencyState {
  hasPerformanceData: boolean;
  hasQingbiaoData: boolean;
  hasDingbiaoData: boolean;
  hasAnalysisData: boolean;
}

export interface ProjectTypeEditState {
  locked: boolean;
  reasons: readonly ProjectTypeLockReason[];
}

export function evaluateProjectTypeEditState(
  dependencies: ProjectTypeDependencyState,
): ProjectTypeEditState {
  const reasons: ProjectTypeLockReason[] = [];

  if (dependencies.hasPerformanceData) {
    reasons.push("PERFORMANCE_DATA");
  }
  if (dependencies.hasQingbiaoData) {
    reasons.push("QINGBIAO_DATA");
  }
  if (dependencies.hasDingbiaoData) {
    reasons.push("DINGBIAO_DATA");
  }
  if (dependencies.hasAnalysisData) {
    reasons.push("ANALYSIS_DATA");
  }

  return { locked: reasons.length > 0, reasons };
}

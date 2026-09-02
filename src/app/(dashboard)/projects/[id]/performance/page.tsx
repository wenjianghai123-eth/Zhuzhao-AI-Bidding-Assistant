import { notFound } from "next/navigation";

import { PerformanceWeightedScoreManager } from "@/features/performance/components/performance-weighted-score-manager";
import { parsePerformanceWeightedRange } from "@/features/performance/performance-weighted-score-schema";
import { getPerformanceWeightedPageData } from "@/server/application/performance-weighted-score-service";

export default async function ProjectPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const weightedRange = parsePerformanceWeightedRange(resolvedSearchParams);
  const weightedScoreData = await getPerformanceWeightedPageData(
    projectId,
    weightedRange,
  );
  if (!weightedScoreData) {
    notFound();
  }

  return (
    <PerformanceWeightedScoreManager
      key={[
        projectId,
        weightedScoreData.start.year,
        weightedScoreData.end.year,
        weightedScoreData.weightingMethod,
        weightedScoreData.inputRevision,
        weightedScoreData.snapshotStatus,
      ].join("|")}
      data={weightedScoreData}
    />
  );
}

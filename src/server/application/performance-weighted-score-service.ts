import {
  combineProjectTypePerformanceAverages,
  type RecentPerformanceAverageResult,
} from "@/domain/performance/company-performance";
import {
  calculatePerformanceWeightedRow,
  comparePerformanceQuarters,
  DEFAULT_PERFORMANCE_WEIGHTING_METHOD,
  generatePerformanceQuarterRange,
  normalizePerformanceWeightingMethod,
  performanceQuarterIndex,
  type PerformanceQuarter,
  type PerformanceQuarterRef,
  type PerformanceWeightingMethod,
} from "@/domain/performance/performance-weighted-score";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  prismaPerformanceWeightedScoreRepository,
  type PerformanceWeightedScoreRepository,
} from "@/server/repositories/performance-weighted-score-repository";

export interface PerformanceWeightedRowConfig {
  candidateId: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
}

export interface PerformanceWeightedCatalogRow extends PerformanceWeightedRowConfig {
  companyName: string;
  classificationLevels: readonly string[];
  classificationConflict: boolean;
  quarterValues: readonly {
    year: number;
    quarter: PerformanceQuarter;
    averageScore: string | null;
    detailCount: number;
  }[];
  weightedAverage: string | null;
  quarterCount: number;
  hasDetails: boolean;
}

export type PerformanceWeightedSnapshotStatus = "not_saved" | "current" | "stale";

export interface PerformanceWeightedPageData {
  projectId: string;
  projectName: string;
  inputRevision: number;
  candidates: readonly { id: string; companyName: string }[];
  projectTypes: readonly ProjectTypeValue[];
  quarters: readonly PerformanceQuarterRef[];
  start: PerformanceQuarterRef;
  end: PerformanceQuarterRef;
  weightingMethod: PerformanceWeightingMethod;
  catalogRows: readonly PerformanceWeightedCatalogRow[];
  suggestedRows: readonly PerformanceWeightedRowConfig[];
  initialRows: readonly PerformanceWeightedRowConfig[];
  savedRows: readonly PerformanceWeightedRowConfig[];
  unlinkedRecordCount: number;
  classificationConflictCount: number;
  snapshotStatus: PerformanceWeightedSnapshotStatus;
  savedAt: string | null;
  savedInputRevision: number | null;
}

function quarterFromIndex(index: number): PerformanceQuarterRef {
  const year = Math.floor(index / 4);
  return { year, quarter: ((index % 4) + 1) as PerformanceQuarter };
}

function defaultRange(
  records: readonly { year: number; quarter: number }[],
  savedStart?: PerformanceQuarterRef,
  savedEnd?: PerformanceQuarterRef,
) {
  if (savedStart && savedEnd) return { start: savedStart, end: savedEnd };
  const latestIndex = records.reduce(
    (latest, record) =>
      Math.max(latest, record.year * 4 + record.quarter - 1),
    Number.NEGATIVE_INFINITY,
  );
  const now = new Date();
  const current = {
    year: now.getFullYear(),
    quarter: (Math.floor(now.getMonth() / 3) + 1) as PerformanceQuarter,
  };
  const end = Number.isFinite(latestIndex) ? quarterFromIndex(latestIndex) : current;
  return {
    start: quarterFromIndex(performanceQuarterIndex(end) - 11),
    end,
  };
}

function buildCatalogRows(
  source: NonNullable<Awaited<ReturnType<PerformanceWeightedScoreRepository["findSource"]>>>,
  start: PerformanceQuarterRef,
  end: PerformanceQuarterRef,
  weightingMethod: PerformanceWeightingMethod,
): readonly PerformanceWeightedCatalogRow[] {
  const quarters = generatePerformanceQuarterRange(start, end);
  const rows: PerformanceWeightedCatalogRow[] = [];
  for (const candidate of source.project.candidates) {
    for (const projectType of source.project.projectTypes) {
      const records = source.records.filter(
        (record) =>
          record.candidateId === candidate.id && record.projectType === projectType,
      );
      const calculation = calculatePerformanceWeightedRow(
        projectType,
        records,
        start,
        end,
        weightingMethod,
      );
      const averages = new Map(
        calculation.quarterAverages.map((average) => [
          `${average.year}-${average.quarter}`,
          average,
        ]),
      );
      const classificationLevels = [
        ...new Set(
          records
            .map(({ classificationLevel }) => classificationLevel.trim())
            .filter((classificationLevel) => classificationLevel.length > 0),
        ),
      ].toSorted();
      rows.push({
        candidateId: candidate.id,
        companyName: candidate.companyName,
        projectType,
        classificationLevel:
          classificationLevels.length === 1
            ? (classificationLevels[0] ?? "")
            : "",
        classificationLevels,
        classificationConflict: classificationLevels.length > 1,
        quarterValues: quarters.map((quarter) => {
          const average = averages.get(`${quarter.year}-${quarter.quarter}`);
          return {
            ...quarter,
            averageScore: average?.score ?? null,
            detailCount: average?.detailCount ?? 0,
          };
        }),
        weightedAverage: calculation.weightedAverage,
        quarterCount: calculation.quarterCount,
        hasDetails: records.length > 0,
      });
    }
  }
  return rows;
}

export async function getPerformanceWeightedPageData(
  projectId: string,
  requestedOptions: {
    start?: PerformanceQuarterRef;
    end?: PerformanceQuarterRef;
    weightingMethod?: PerformanceWeightingMethod;
  } = {},
  repository: PerformanceWeightedScoreRepository = prismaPerformanceWeightedScoreRepository,
): Promise<PerformanceWeightedPageData | null> {
  const source = await repository.findSource(projectId);
  if (!source) return null;
  const saved = source.savedSnapshot;
  const fallback = defaultRange(
    source.records,
    saved
      ? { year: saved.startYear, quarter: saved.startQuarter as PerformanceQuarter }
      : undefined,
    saved
      ? { year: saved.endYear, quarter: saved.endQuarter as PerformanceQuarter }
      : undefined,
  );
  const start = requestedOptions.start ?? fallback.start;
  const end = requestedOptions.end ?? fallback.end;
  const normalizedRange =
    comparePerformanceQuarters(start, end) <= 0
      ? { start, end }
      : fallback;
  const savedWeightingMethod = saved
    ? normalizePerformanceWeightingMethod(saved.weightingMethod)
    : null;
  const weightingMethod =
    requestedOptions.weightingMethod ??
    savedWeightingMethod ??
    DEFAULT_PERFORMANCE_WEIGHTING_METHOD;
  const catalogRows = buildCatalogRows(
    source,
    normalizedRange.start,
    normalizedRange.end,
    weightingMethod,
  );
  const currentCandidateIds = new Set(
    source.project.candidates.map(({ id }) => id),
  );

  const suggestedRows = catalogRows
    .filter((row) => row.hasDetails)
    .map(({ candidateId, projectType, classificationLevel }) => ({
      candidateId,
      projectType,
      classificationLevel,
    }));
  const savedRows =
    saved?.rows
      .filter(
        ({ candidateId, projectType }) =>
          currentCandidateIds.has(candidateId) &&
          source.project.projectTypes.includes(projectType),
      )
      .map(({ candidateId, projectType, classificationLevel }) => ({
        candidateId,
        projectType,
        classificationLevel,
      })) ?? [];
  const automaticByIdentity = new Map(
    suggestedRows.map((row) => [`${row.candidateId}:${row.projectType}`, row]),
  );
  const initialRows = [
    ...savedRows.map((row) =>
      automaticByIdentity.get(`${row.candidateId}:${row.projectType}`) ?? row,
    ),
    ...suggestedRows.filter(
      (row) =>
        !savedRows.some(
          (savedRow) =>
            savedRow.candidateId === row.candidateId &&
            savedRow.projectType === row.projectType,
        ),
    ),
  ];

  return {
    projectId,
    projectName: source.project.name,
    inputRevision: source.project.inputRevision,
    candidates: source.project.candidates,
    projectTypes: source.project.projectTypes,
    quarters: generatePerformanceQuarterRange(normalizedRange.start, normalizedRange.end),
    ...normalizedRange,
    weightingMethod,
    catalogRows,
    suggestedRows,
    initialRows,
    savedRows,
    unlinkedRecordCount: source.unlinkedRecordCount,
    classificationConflictCount: catalogRows.filter(
      ({ classificationConflict }) => classificationConflict,
    ).length,
    snapshotStatus:
      saved === null
        ? "not_saved"
        : saved.inputRevision === source.project.inputRevision &&
            savedWeightingMethod === weightingMethod &&
            saved.startYear === normalizedRange.start.year &&
            saved.startQuarter === normalizedRange.start.quarter &&
            saved.endYear === normalizedRange.end.year &&
            saved.endQuarter === normalizedRange.end.quarter
          ? "current"
          : "stale",
    savedAt: saved?.savedAt.toISOString() ?? null,
    savedInputRevision: saved?.inputRevision ?? null,
  };
}

export interface SavePerformanceWeightedScoresInput {
  expectedInputRevision: number;
  start: PerformanceQuarterRef;
  end: PerformanceQuarterRef;
  weightingMethod: PerformanceWeightingMethod;
  rows: readonly PerformanceWeightedRowConfig[];
}

export type SavePerformanceWeightedScoresResult =
  | { status: "saved"; savedAt: string }
  | { status: "unchanged" }
  | { status: "project_not_found" }
  | { status: "revision_conflict" }
  | { status: "invalid_scope" };

export async function savePerformanceWeightedScores(
  projectId: string,
  input: SavePerformanceWeightedScoresInput,
  repository: PerformanceWeightedScoreRepository = prismaPerformanceWeightedScoreRepository,
): Promise<SavePerformanceWeightedScoresResult> {
  const source = await repository.findSource(projectId);
  if (!source) return { status: "project_not_found" };
  if (source.project.inputRevision !== input.expectedInputRevision) {
    return { status: "revision_conflict" };
  }
  if (comparePerformanceQuarters(input.start, input.end) > 0) {
    return { status: "invalid_scope" };
  }

  const catalog = buildCatalogRows(
    source,
    input.start,
    input.end,
    input.weightingMethod,
  );
  const catalogByIdentity = new Map(
    catalog.map((row) => [`${row.candidateId}:${row.projectType}`, row]),
  );
  const calculatedRows = input.rows.flatMap((row) => {
    const calculation = catalogByIdentity.get(`${row.candidateId}:${row.projectType}`);
    return calculation
      ? [{
          candidateId: row.candidateId,
          projectType: row.projectType,
          classificationLevel: calculation.hasDetails
            ? calculation.classificationLevel
            : row.classificationLevel.trim(),
          weightedAverage: calculation.weightedAverage,
          quarterCount: calculation.quarterCount,
        }]
      : [];
  });
  if (calculatedRows.length !== input.rows.length) {
    return { status: "invalid_scope" };
  }

  const result = await repository.saveSnapshot(projectId, {
    expectedInputRevision: input.expectedInputRevision,
    startYear: input.start.year,
    startQuarter: input.start.quarter,
    endYear: input.end.year,
    endQuarter: input.end.quarter,
    weightingMethod: input.weightingMethod,
    rows: calculatedRows,
  });
  return result.status === "saved"
    ? { status: "saved", savedAt: result.savedAt.toISOString() }
    : result;
}

export async function getSavedPerformanceAverage(
  projectId: string,
  candidateId: string,
  projectTypes: readonly ProjectTypeValue[],
  repository: PerformanceWeightedScoreRepository = prismaPerformanceWeightedScoreRepository,
): Promise<RecentPerformanceAverageResult> {
  const source = await repository.findSource(projectId);
  if (
    !source ||
    !source.savedSnapshot ||
    source.savedSnapshot.inputRevision !== source.project.inputRevision
  ) {
    if (projectTypes.length === 0) {
      return {
        status: "no_project_types",
        averageScore: null,
        projectTypeAverages: [],
        missingProjectTypes: [],
      };
    }
    return {
      status: "missing_data",
      averageScore: null,
      projectTypeAverages: [],
      missingProjectTypes: [...new Set(projectTypes)],
    };
  }
  const rows = source.savedSnapshot.rows
    .filter(
      (row) =>
        row.candidateId === candidateId &&
        projectTypes.includes(row.projectType) &&
        row.weightedAverage !== null,
    )
    .flatMap((row) =>
      row.weightedAverage === null
        ? []
        : [{
            projectType: row.projectType,
            averageScore: row.weightedAverage,
            quarterCount: row.quarterCount,
          }],
    );
  return combineProjectTypePerformanceAverages(projectTypes, rows);
}

/**
 * Verification/import orchestration helper. The interactive page performs the
 * same two explicit steps locally: synchronize distinct detail rows, then save.
 */
export async function saveSynchronizedPerformanceWeightedScores(
  projectId: string,
  repository: PerformanceWeightedScoreRepository = prismaPerformanceWeightedScoreRepository,
) {
  const page = await getPerformanceWeightedPageData(projectId, {}, repository);
  if (!page) return { status: "project_not_found" } as const;
  return savePerformanceWeightedScores(
    projectId,
    {
      expectedInputRevision: page.inputRevision,
      start: page.start,
      end: page.end,
      weightingMethod: page.weightingMethod,
      rows: page.suggestedRows,
    },
    repository,
  );
}

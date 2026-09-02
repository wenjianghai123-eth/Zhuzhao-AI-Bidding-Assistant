import Decimal from "decimal.js";

import {
  calculatePerformanceQuarterAverages,
  combineProjectTypePerformanceAverages,
  type RecentPerformanceAverageResult,
} from "@/domain/performance/company-performance";
import {
  calculatePerformanceWeightedRow,
  comparePerformanceQuarters,
  DEFAULT_PERFORMANCE_WEIGHTING_METHOD,
  generatePerformanceQuarterRange,
  normalizePerformanceWeightingMethod,
  type PerformanceQuarter,
  type PerformanceQuarterRef,
  type PerformanceWeightingMethod,
} from "@/domain/performance/performance-weighted-score";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  prismaPerformanceWeightedScoreRepository,
  type PerformanceWeightedScoreRepository,
  type PerformanceWeightedSource,
} from "@/server/repositories/performance-weighted-score-repository";

export interface PerformanceWeightedRowConfig {
  candidateId: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
}

export interface PerformanceWeightedQuarterValue {
  year: number;
  quarter: PerformanceQuarter;
  score?: string | null;
  /** Compatibility alias for pre-grid read models. */
  averageScore?: string | null;
  detailCount?: number;
}

export interface PerformanceWeightedGridRow extends PerformanceWeightedRowConfig {
  quarterValues: readonly PerformanceWeightedQuarterValue[];
}

export interface PerformanceWeightedCatalogRow extends PerformanceWeightedGridRow {
  companyName: string;
  classificationLevels: readonly string[];
  classificationConflict: boolean;
  weightedAverage: string | null;
  quarterCount: number;
  hasValues?: boolean;
  /** Compatibility alias retained for Qingbiao readiness consumers. */
  hasDetails: boolean;
}

export type PerformanceWeightedSnapshotStatus = "not_saved" | "current" | "stale";

export type PerformanceWeightedSnapshotLookupStatus =
  | PerformanceWeightedSnapshotStatus
  | "project_not_found";

export interface PerformanceWeightedPageData {
  projectId: string;
  projectName: string;
  inputRevision: number;
  candidates: readonly { id: string; companyName: string }[];
  projectTypes: readonly ProjectTypeValue[];
  quarters: readonly PerformanceQuarterRef[];
  availableYears?: readonly number[];
  start: PerformanceQuarterRef;
  end: PerformanceQuarterRef;
  weightingMethod: PerformanceWeightingMethod;
  catalogRows: readonly PerformanceWeightedCatalogRow[];
  suggestedRows: readonly PerformanceWeightedGridRow[];
  initialRows: readonly PerformanceWeightedGridRow[];
  savedRows: readonly PerformanceWeightedGridRow[];
  unlinkedRecordCount: number;
  classificationConflictCount?: number;
  snapshotStatus: PerformanceWeightedSnapshotStatus;
  savedAt: string | null;
  savedInputRevision: number | null;
}

function defaultRange(
  records: readonly { year: number }[],
  savedStartYear?: number,
  savedEndYear?: number,
) {
  if (savedStartYear !== undefined && savedEndYear !== undefined) {
    return {
      start: { year: savedStartYear, quarter: 1 as const },
      end: { year: savedEndYear, quarter: 4 as const },
    };
  }
  const currentYear = new Date().getFullYear();
  const latestYear = records.reduce(
    (latest, record) => Math.max(latest, record.year),
    currentYear,
  );
  return {
    start: { year: latestYear - 2, quarter: 1 as const },
    end: { year: latestYear, quarter: 4 as const },
  };
}

function normalizeWholeYearRange(
  requested: { start?: PerformanceQuarterRef; end?: PerformanceQuarterRef },
  fallback: { start: PerformanceQuarterRef; end: PerformanceQuarterRef },
) {
  const start = {
    year: requested.start?.year ?? fallback.start.year,
    quarter: 1 as const,
  };
  const end = {
    year: requested.end?.year ?? fallback.end.year,
    quarter: 4 as const,
  };
  return comparePerformanceQuarters(start, end) <= 0
    ? { start, end }
    : fallback;
}

function identity(row: PerformanceWeightedRowConfig) {
  return `${row.candidateId}:${row.projectType}`;
}

function buildAllQuarterValues(
  projectType: ProjectTypeValue,
  records: PerformanceWeightedSource["records"],
  start: PerformanceQuarterRef,
  end: PerformanceQuarterRef,
): readonly PerformanceWeightedQuarterValue[] {
  const averages = new Map(calculatePerformanceQuarterAverages(
    records.filter((record) => record.projectType === projectType),
  ).map((average) => [`${average.year}:Q${average.quarter}`, average]));
  return generatePerformanceQuarterRange(start, end).map((quarter) => {
    const average = averages.get(`${quarter.year}:Q${quarter.quarter}`);
    return {
      ...quarter,
      score: average?.score ?? null,
      averageScore: average?.score ?? null,
      detailCount: average?.detailCount ?? 0,
    };
  });
}

function buildCatalogRows(
  source: PerformanceWeightedSource,
  start: PerformanceQuarterRef,
  end: PerformanceQuarterRef,
  weightingMethod: PerformanceWeightingMethod,
): readonly PerformanceWeightedCatalogRow[] {
  const rows: PerformanceWeightedCatalogRow[] = [];
  for (const candidate of source.project.candidates) {
    for (const projectType of source.project.projectTypes) {
      const records = source.records.filter(
        (record) =>
          record.candidateId === candidate.id && record.projectType === projectType,
      );
      const classificationLevels = [...new Set(
        records
          .map(({ classificationLevel }) => classificationLevel.trim())
          .filter(Boolean),
      )].toSorted();
      const classificationLevel =
        classificationLevels.length === 1 ? classificationLevels[0] ?? "" : "";
      const calculation = calculatePerformanceWeightedRow(
        projectType,
        records,
        start,
        end,
        weightingMethod,
      );
      rows.push({
        candidateId: candidate.id,
        companyName: candidate.companyName,
        projectType,
        classificationLevel,
        classificationLevels,
        classificationConflict: classificationLevels.length > 1,
        quarterValues: buildAllQuarterValues(projectType, records, start, end),
        weightedAverage: calculation.weightedAverage,
        quarterCount: calculation.quarterCount,
        hasValues: records.length > 0,
        hasDetails: records.length > 0,
      });
    }
  }
  return rows;
}

function toGridRow(row: PerformanceWeightedCatalogRow): PerformanceWeightedGridRow {
  return {
    candidateId: row.candidateId,
    projectType: row.projectType,
    classificationLevel: row.classificationLevel,
    quarterValues: row.quarterValues,
  };
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
    saved?.startYear,
    saved?.endYear,
  );
  const normalizedRange = normalizeWholeYearRange(requestedOptions, fallback);
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
  const catalogByIdentity = new Map(
    catalogRows.map((row) => [identity(row), row]),
  );
  const currentCandidateIds = new Set(
    source.project.candidates.map(({ id }) => id),
  );

  const suggestedRows = catalogRows
    .filter((row) => row.hasValues ?? row.hasDetails)
    .map(toGridRow);
  const savedRows =
    saved?.rows.flatMap((row) => {
      if (
        !currentCandidateIds.has(row.candidateId) ||
        !source.project.projectTypes.includes(row.projectType)
      ) {
        return [];
      }
      const catalog = catalogByIdentity.get(identity(row));
      return [{
        candidateId: row.candidateId,
        projectType: row.projectType,
        classificationLevel:
          catalog?.classificationLevel || row.classificationLevel,
        quarterValues: catalog?.quarterValues ?? [],
      }];
    }) ?? [];
  const initialRows = [
    ...savedRows,
    ...suggestedRows.filter(
      (row) => !savedRows.some((savedRow) => identity(savedRow) === identity(row)),
    ),
  ];
  const recordYears = source.records.map(({ year }) => year);
  const minYear = Math.min(normalizedRange.start.year, ...recordYears);
  const maxYear = Math.max(normalizedRange.end.year, ...recordYears);
  const availableYears = Array.from(
    { length: maxYear - minYear + 3 },
    (_, index) => minYear + index,
  );

  return {
    projectId,
    projectName: source.project.name,
    inputRevision: source.project.inputRevision,
    candidates: source.project.candidates,
    projectTypes: source.project.projectTypes,
    quarters: generatePerformanceQuarterRange(normalizedRange.start, normalizedRange.end),
    availableYears,
    ...normalizedRange,
    weightingMethod,
    catalogRows,
    suggestedRows,
    initialRows,
    savedRows,
    unlinkedRecordCount: source.unlinkedRecordCount,
    classificationConflictCount: catalogRows.filter(
      (row) => row.classificationConflict,
    ).length,
    snapshotStatus:
      saved === null
        ? "not_saved"
        : saved.inputRevision === source.project.inputRevision &&
            savedWeightingMethod === weightingMethod &&
            saved.startYear === normalizedRange.start.year &&
            saved.startQuarter === 1 &&
            saved.endYear === normalizedRange.end.year &&
            saved.endQuarter === 4
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
  rows: readonly (PerformanceWeightedRowConfig & {
    quarterValues?: readonly PerformanceWeightedQuarterValue[];
  })[];
}

export type SavePerformanceWeightedScoresResult =
  | { status: "saved"; savedAt: string }
  | { status: "unchanged" }
  | { status: "project_not_found" }
  | { status: "revision_conflict" }
  | { status: "invalid_scope" };

function normalizeScore(value: string | null) {
  if (value === null || value.trim().length === 0) return null;
  try {
    const decimal = new Decimal(value);
    return decimal.isNegative() ? undefined : decimal.toString();
  } catch {
    return undefined;
  }
}

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
  const normalizedRange = normalizeWholeYearRange(input, {
    start: input.start,
    end: input.end,
  });
  if (
    normalizedRange.start.year !== input.start.year ||
    normalizedRange.end.year !== input.end.year ||
    comparePerformanceQuarters(input.start, input.end) > 0
  ) {
    return { status: "invalid_scope" };
  }
  const quarters = generatePerformanceQuarterRange(
    normalizedRange.start,
    normalizedRange.end,
  );
  const expectedQuarterKeys = new Set(
    quarters.map(({ year, quarter }) => `${year}:Q${quarter}`),
  );
  const candidateIds = new Set(source.project.candidates.map(({ id }) => id));
  const identities = new Set<string>();
  const catalog = buildCatalogRows(
    source,
    normalizedRange.start,
    normalizedRange.end,
    input.weightingMethod,
  );
  const catalogByIdentity = new Map(catalog.map((row) => [identity(row), row]));
  const calculatedRows = [];

  for (const row of input.rows) {
    const rowKey = identity(row);
    if (
      identities.has(rowKey) ||
      !candidateIds.has(row.candidateId) ||
      !source.project.projectTypes.includes(row.projectType) ||
      row.classificationLevel.trim().length > 100
    ) {
      return { status: "invalid_scope" };
    }
    identities.add(rowKey);
    const fallbackValues = catalogByIdentity.get(rowKey)?.quarterValues ?? [];
    const submittedValues: readonly PerformanceWeightedQuarterValue[] =
      row.quarterValues ?? quarters.map((quarter) => ({
      ...quarter,
      score:
        fallbackValues.find(
          (value) => value.year === quarter.year && value.quarter === quarter.quarter,
        )?.score ?? fallbackValues.find(
          (value) => value.year === quarter.year && value.quarter === quarter.quarter,
        )?.averageScore ?? null,
      }));
    const submittedKeys = new Set<string>();
    const normalizedValues: {
      year: number;
      quarter: PerformanceQuarter;
      score: string | null;
    }[] = [];
    for (const value of submittedValues) {
      const key = `${value.year}:Q${value.quarter}`;
      const score = normalizeScore(value.score ?? value.averageScore ?? null);
      if (
        submittedKeys.has(key) ||
        !expectedQuarterKeys.has(key) ||
        score === undefined
      ) {
        return { status: "invalid_scope" };
      }
      submittedKeys.add(key);
      normalizedValues.push({ ...value, score });
    }
    if (submittedKeys.size !== expectedQuarterKeys.size) {
      return { status: "invalid_scope" };
    }
    const records = normalizedValues.flatMap((value) =>
      value.score === null
        ? []
        : [{
            projectType: row.projectType,
            year: value.year,
            quarter: value.quarter,
            score: value.score,
          }],
    );
    const calculation = calculatePerformanceWeightedRow(
      row.projectType,
      records,
      normalizedRange.start,
      normalizedRange.end,
      input.weightingMethod,
    );
    calculatedRows.push({
      candidateId: row.candidateId,
      projectType: row.projectType,
      classificationLevel: row.classificationLevel.trim(),
      quarterValues: normalizedValues,
      weightedAverage: calculation.weightedAverage,
      quarterCount: calculation.quarterCount,
    });
  }

  const saveInput = {
    expectedInputRevision: input.expectedInputRevision,
    startYear: normalizedRange.start.year,
    startQuarter: 1,
    endYear: normalizedRange.end.year,
    endQuarter: 4,
    weightingMethod: input.weightingMethod,
    rows: calculatedRows,
  };
  const result = repository.saveGrid
    ? await repository.saveGrid(projectId, saveInput)
    : repository.saveSnapshot
      ? await repository.saveSnapshot(projectId, {
          ...saveInput,
          rows: calculatedRows.map((row) => ({
            candidateId: row.candidateId,
            projectType: row.projectType,
            classificationLevel: row.classificationLevel,
            weightedAverage: row.weightedAverage,
            quarterCount: row.quarterCount,
          })),
        })
      : { status: "invalid_scope" as const };
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

export async function getPerformanceWeightedSnapshotStatus(
  projectId: string,
  repository: PerformanceWeightedScoreRepository = prismaPerformanceWeightedScoreRepository,
): Promise<PerformanceWeightedSnapshotLookupStatus> {
  const source = await repository.findSource(projectId);
  if (!source) return "project_not_found";
  if (!source.savedSnapshot) return "not_saved";
  return source.savedSnapshot.inputRevision === source.project.inputRevision
    ? "current"
    : "stale";
}

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
      rows: page.suggestedRows.map((row) => ({
        ...row,
        quarterValues: page.quarters.map((quarter) => ({
          ...quarter,
          score: row.quarterValues.find(
            (value) => value.year === quarter.year && value.quarter === quarter.quarter,
          )?.score ?? row.quarterValues.find(
            (value) => value.year === quarter.year && value.quarter === quarter.quarter,
          )?.averageScore ?? null,
        })),
      })),
    },
    repository,
  );
}

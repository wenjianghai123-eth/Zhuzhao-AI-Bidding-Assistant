import Decimal from "decimal.js";

import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  deserializePersistedDecimal,
  serializeDecimalForPersistence,
} from "@/server/db/decimal-persistence";
import { prisma } from "@/server/db/prisma";

export interface PerformanceWeightedSourceRecord {
  candidateId: string;
  companyName: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
  year: number;
  quarter: number;
  score: string;
}

export interface PerformanceWeightedCandidate {
  id: string;
  companyName: string;
}

export interface SavedPerformanceWeightedRow {
  candidateId: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
  weightedAverage: string | null;
  quarterCount: number;
}

export interface SavedPerformanceWeightedSnapshot {
  inputRevision: number;
  startYear: number;
  startQuarter: number;
  endYear: number;
  endQuarter: number;
  weightingMethod: string;
  savedAt: Date;
  rows: readonly SavedPerformanceWeightedRow[];
}

export interface PerformanceWeightedSource {
  project: {
    id: string;
    name: string;
    inputRevision: number;
    projectTypes: readonly ProjectTypeValue[];
    candidates: readonly PerformanceWeightedCandidate[];
  };
  records: readonly PerformanceWeightedSourceRecord[];
  unlinkedRecordCount: number;
  savedSnapshot: SavedPerformanceWeightedSnapshot | null;
}

export interface SavePerformanceQuarterValue {
  year: number;
  quarter: number;
  score: string | null;
}

export interface SavePerformanceWeightedGridRow extends SavedPerformanceWeightedRow {
  quarterValues: readonly SavePerformanceQuarterValue[];
}

export interface SavePerformanceWeightedGridInput {
  expectedInputRevision: number;
  startYear: number;
  startQuarter: number;
  endYear: number;
  endQuarter: number;
  weightingMethod: string;
  rows: readonly SavePerformanceWeightedGridRow[];
}

/** Legacy repository adapter shape retained for isolated service test doubles. */
export interface SavePerformanceWeightedSnapshotInput {
  expectedInputRevision: number;
  startYear: number;
  startQuarter: number;
  endYear: number;
  endQuarter: number;
  weightingMethod: string;
  rows: readonly SavedPerformanceWeightedRow[];
}

export type SavePerformanceWeightedSnapshotResult =
  | { status: "saved"; savedAt: Date; inputRevision?: number }
  | { status: "unchanged" }
  | { status: "project_not_found" }
  | { status: "revision_conflict" }
  | { status: "invalid_scope" };

export interface PerformanceWeightedScoreRepository {
  findSource(projectId: string): Promise<PerformanceWeightedSource | null>;
  saveGrid?(
    projectId: string,
    input: SavePerformanceWeightedGridInput,
  ): Promise<SavePerformanceWeightedSnapshotResult>;
  saveSnapshot?(
    projectId: string,
    input: SavePerformanceWeightedSnapshotInput,
  ): Promise<SavePerformanceWeightedSnapshotResult>;
}

function rowIdentity(candidateId: string, projectType: ProjectTypeValue) {
  return `${candidateId}:${projectType}`;
}

function quarterIdentity(
  candidateId: string,
  projectType: ProjectTypeValue,
  year: number,
  quarter: number,
) {
  return `${rowIdentity(candidateId, projectType)}:${year}:Q${quarter}`;
}

function decimalEqual(left: string, right: string) {
  try {
    return new Decimal(left).equals(new Decimal(right));
  } catch {
    return false;
  }
}

export const prismaPerformanceWeightedScoreRepository: PerformanceWeightedScoreRepository = {
  async findSource(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        performanceInputRevision: true,
        rule: {
          select: {
            projectTypes: {
              select: { projectType: true },
              orderBy: { projectType: "asc" },
            },
          },
        },
        candidates: {
          select: { id: true, companyName: true },
          orderBy: { companyName: "asc" },
        },
        performanceRecords: {
          select: {
            candidateId: true,
            companyName: true,
            candidate: { select: { companyName: true } },
            projectType: true,
            classificationLevel: true,
            year: true,
            quarter: true,
            score: true,
          },
          orderBy: [{ year: "asc" }, { quarter: "asc" }],
        },
        performanceWeightedSnapshot: {
          select: {
            inputRevision: true,
            startYear: true,
            startQuarter: true,
            endYear: true,
            endQuarter: true,
            weightingMethod: true,
            savedAt: true,
            scores: {
              select: {
                candidateId: true,
                projectType: true,
                classificationLevel: true,
                weightedAverage: true,
                weightedAverageCanonical: true,
                quarterCount: true,
              },
              orderBy: [{ candidateId: "asc" }, { projectType: "asc" }],
            },
          },
        },
      },
    });
    if (!project) return null;

    const records = project.performanceRecords.flatMap((record) =>
      record.candidateId === null
        ? []
        : [{
            candidateId: record.candidateId,
            companyName: record.candidate?.companyName ?? record.companyName,
            projectType: record.projectType,
            classificationLevel: record.classificationLevel,
            year: record.year,
            quarter: record.quarter,
            score: record.score.toString(),
          }],
    );
    const saved = project.performanceWeightedSnapshot;

    return {
      project: {
        id: project.id,
        name: project.name,
        inputRevision: project.performanceInputRevision,
        projectTypes: project.rule?.projectTypes.map(({ projectType }) => projectType) ?? [],
        candidates: project.candidates,
      },
      records,
      unlinkedRecordCount: project.performanceRecords.length - records.length,
      savedSnapshot: saved
        ? {
            inputRevision: saved.inputRevision,
            startYear: saved.startYear,
            startQuarter: saved.startQuarter,
            endYear: saved.endYear,
            endQuarter: saved.endQuarter,
            weightingMethod: saved.weightingMethod,
            savedAt: saved.savedAt,
            rows: saved.scores.map((row) => ({
              candidateId: row.candidateId,
              projectType: row.projectType,
              classificationLevel: row.classificationLevel,
              weightedAverage: row.weightedAverage === null
                ? null
                : deserializePersistedDecimal({
                    canonical: row.weightedAverageCanonical,
                    numeric: row.weightedAverage,
                  }),
              quarterCount: row.quarterCount,
            })),
          }
        : null,
    };
  },

  async saveGrid(projectId, input) {
    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: projectId },
        select: {
          performanceInputRevision: true,
          candidates: { select: { id: true, companyName: true } },
          rule: { select: { projectTypes: { select: { projectType: true } } } },
          performanceRecords: {
            where: { candidateId: { not: null } },
            select: {
              id: true,
              candidateId: true,
              companyName: true,
              projectType: true,
              classificationLevel: true,
              year: true,
              quarter: true,
              score: true,
            },
          },
          performanceWeightedSnapshot: {
            select: {
              inputRevision: true,
              startYear: true,
              startQuarter: true,
              endYear: true,
              endQuarter: true,
              weightingMethod: true,
              scores: {
                select: {
                  candidateId: true,
                  projectType: true,
                  classificationLevel: true,
                  weightedAverage: true,
                  weightedAverageCanonical: true,
                  quarterCount: true,
                },
              },
            },
          },
        },
      });
      if (!project) return { status: "project_not_found" } as const;
      if (project.performanceInputRevision !== input.expectedInputRevision) {
        return { status: "revision_conflict" } as const;
      }

      const candidateNames = new Map(project.candidates.map(({ id, companyName }) => [id, companyName]));
      const projectTypes = new Set(project.rule?.projectTypes.map(({ projectType }) => projectType) ?? []);
      const submittedIdentities = new Set<string>();
      for (const row of input.rows) {
        const identity = rowIdentity(row.candidateId, row.projectType);
        if (
          submittedIdentities.has(identity) ||
          !candidateNames.has(row.candidateId) ||
          !projectTypes.has(row.projectType)
        ) {
          return { status: "invalid_scope" } as const;
        }
        submittedIdentities.add(identity);
        const quarterKeys = new Set<string>();
        for (const value of row.quarterValues) {
          const key = `${value.year}:Q${value.quarter}`;
          if (quarterKeys.has(key) || value.quarter < 1 || value.quarter > 4) {
            return { status: "invalid_scope" } as const;
          }
          quarterKeys.add(key);
        }
      }

      const activeRecords = project.performanceRecords.filter(
        (record) => record.candidateId !== null && projectTypes.has(record.projectType),
      );
      const currentByKey = new Map(
        activeRecords.flatMap((record) => record.candidateId === null ? [] : [[
          quarterIdentity(record.candidateId, record.projectType, record.year, record.quarter),
          record,
        ] as const]),
      );
      const desiredByKey = new Map<string, {
        candidateId: string;
        companyName: string;
        projectType: ProjectTypeValue;
        classificationLevel: string;
        year: number;
        quarter: number;
        score: string;
      }>();

      for (const record of activeRecords) {
        if (record.candidateId === null) continue;
        const submitted = input.rows.find(
          (row) => row.candidateId === record.candidateId && row.projectType === record.projectType,
        );
        if (!submitted) continue;
        desiredByKey.set(
          quarterIdentity(record.candidateId, record.projectType, record.year, record.quarter),
          {
            candidateId: record.candidateId,
            companyName: candidateNames.get(record.candidateId) ?? record.companyName,
            projectType: record.projectType,
            classificationLevel: submitted.classificationLevel,
            year: record.year,
            quarter: record.quarter,
            score: record.score.toString(),
          },
        );
      }

      for (const row of input.rows) {
        const companyName = candidateNames.get(row.candidateId);
        if (!companyName) return { status: "invalid_scope" } as const;
        for (const value of row.quarterValues) {
          const key = quarterIdentity(row.candidateId, row.projectType, value.year, value.quarter);
          if (value.score === null) {
            desiredByKey.delete(key);
          } else {
            desiredByKey.set(key, {
              candidateId: row.candidateId,
              companyName,
              projectType: row.projectType,
              classificationLevel: row.classificationLevel,
              year: value.year,
              quarter: value.quarter,
              score: value.score,
            });
          }
        }
      }

      const recordsChanged = currentByKey.size !== desiredByKey.size || [...desiredByKey].some(([key, desired]) => {
        const current = currentByKey.get(key);
        return !current || current.companyName !== desired.companyName ||
          current.classificationLevel !== desired.classificationLevel ||
          !decimalEqual(current.score.toString(), desired.score);
      });
      const saved = project.performanceWeightedSnapshot;
      const savedRows = saved?.scores ?? [];
      const snapshotChanged = !saved ||
        saved.inputRevision !== input.expectedInputRevision ||
        saved.startYear !== input.startYear ||
        saved.startQuarter !== input.startQuarter ||
        saved.endYear !== input.endYear ||
        saved.endQuarter !== input.endQuarter ||
        saved.weightingMethod !== input.weightingMethod ||
        savedRows.length !== input.rows.length ||
        input.rows.some((row) => {
          const previous = savedRows.find(
            (savedRow) => savedRow.candidateId === row.candidateId && savedRow.projectType === row.projectType,
          );
          const previousAverage = previous
            ? previous.weightedAverage === null
              ? null
              : deserializePersistedDecimal({
                  canonical: previous.weightedAverageCanonical,
                  numeric: previous.weightedAverage,
                })
            : null;
          return !previous || previous.classificationLevel !== row.classificationLevel ||
            previous.quarterCount !== row.quarterCount ||
            (previousAverage === null) !== (row.weightedAverage === null) ||
            (previousAverage !== null && row.weightedAverage !== null && !decimalEqual(previousAverage, row.weightedAverage));
        });

      if (!recordsChanged && !snapshotChanged) return { status: "unchanged" } as const;

      for (const [key, current] of currentByKey) {
        if (!desiredByKey.has(key)) {
          await transaction.companyPerformance.delete({ where: { id: current.id } });
        }
      }
      for (const [key, desired] of desiredByKey) {
        const current = currentByKey.get(key);
        if (current) {
          if (
            current.companyName !== desired.companyName ||
            current.classificationLevel !== desired.classificationLevel ||
            !decimalEqual(current.score.toString(), desired.score)
          ) {
            await transaction.companyPerformance.update({
              where: { id: current.id },
              data: {
                companyName: desired.companyName,
                classificationLevel: desired.classificationLevel,
                score: serializeDecimalForPersistence(desired.score),
              },
            });
          }
        } else {
          await transaction.companyPerformance.create({
            data: {
              projectId,
              candidateId: desired.candidateId,
              companyName: desired.companyName,
              projectType: desired.projectType,
              classificationLevel: desired.classificationLevel,
              year: desired.year,
              quarter: desired.quarter,
              score: serializeDecimalForPersistence(desired.score),
            },
          });
        }
      }

      const nextInputRevision = input.expectedInputRevision + 1;
      const savedAt = new Date();
      await transaction.performanceWeightedSnapshot.upsert({
        where: { projectId },
        create: {
          projectId,
          inputRevision: nextInputRevision,
          startYear: input.startYear,
          startQuarter: input.startQuarter,
          endYear: input.endYear,
          endQuarter: input.endQuarter,
          weightingMethod: input.weightingMethod,
          savedAt,
        },
        update: {
          inputRevision: nextInputRevision,
          startYear: input.startYear,
          startQuarter: input.startQuarter,
          endYear: input.endYear,
          endQuarter: input.endQuarter,
          weightingMethod: input.weightingMethod,
          savedAt,
        },
      });
      await transaction.performanceWeightedScore.deleteMany({ where: { projectId } });
      if (input.rows.length > 0) {
        await transaction.performanceWeightedScore.createMany({
          data: input.rows.map((row) => {
            const weightedAverage = row.weightedAverage === null
              ? null
              : serializeDecimalForPersistence(row.weightedAverage);
            return {
              projectId,
              candidateId: row.candidateId,
              projectType: row.projectType,
              classificationLevel: row.classificationLevel,
              weightedAverage,
              weightedAverageCanonical: weightedAverage,
              quarterCount: row.quarterCount,
            };
          }),
        });
      }
      await transaction.project.update({
        where: { id: projectId },
        data: {
          performanceInputRevision: nextInputRevision,
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });
      return { status: "saved", savedAt, inputRevision: nextInputRevision } as const;
    });
  },
};

import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { deserializePersistedDecimal, serializeDecimalForPersistence } from "@/server/db/decimal-persistence";
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
  | { status: "saved"; savedAt: Date }
  | { status: "project_not_found" }
  | { status: "revision_conflict" }
  | { status: "invalid_scope" };

export interface PerformanceWeightedScoreRepository {
  findSource(projectId: string): Promise<PerformanceWeightedSource | null>;
  saveSnapshot(
    projectId: string,
    input: SavePerformanceWeightedSnapshotInput,
  ): Promise<SavePerformanceWeightedSnapshotResult>;
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
              weightedAverage:
                row.weightedAverage === null
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

  async saveSnapshot(projectId, input) {
    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: projectId },
        select: {
          performanceInputRevision: true,
          candidates: { select: { id: true } },
          rule: { select: { projectTypes: { select: { projectType: true } } } },
        },
      });
      if (!project) return { status: "project_not_found" } as const;
      if (project.performanceInputRevision !== input.expectedInputRevision) {
        return { status: "revision_conflict" } as const;
      }

      const candidateIds = new Set(project.candidates.map(({ id }) => id));
      const projectTypes = new Set(
        project.rule?.projectTypes.map(({ projectType }) => projectType) ?? [],
      );
      const identities = new Set<string>();
      for (const row of input.rows) {
        const identity = `${row.candidateId}:${row.projectType}`;
        if (
          identities.has(identity) ||
          !candidateIds.has(row.candidateId) ||
          !projectTypes.has(row.projectType)
        ) {
          return { status: "invalid_scope" } as const;
        }
        identities.add(identity);
      }

      const savedAt = new Date();
      await transaction.performanceWeightedSnapshot.upsert({
        where: { projectId },
        create: {
          projectId,
          inputRevision: input.expectedInputRevision,
          startYear: input.startYear,
          startQuarter: input.startQuarter,
          endYear: input.endYear,
          endQuarter: input.endQuarter,
          weightingMethod: input.weightingMethod,
          savedAt,
        },
        update: {
          inputRevision: input.expectedInputRevision,
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
            const weightedAverage =
              row.weightedAverage === null
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
          qingbiaoInputRevision: { increment: 1 },
          dingbiaoInputRevision: { increment: 1 },
        },
      });
      return { status: "saved", savedAt } as const;
    });
  },
};

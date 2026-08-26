import Decimal from "decimal.js";

import type { ProjectTypeValue } from "@/domain/projects/project-settings";

export interface CompanyPerformanceInput {
  candidateId: string;
  projectType: ProjectTypeValue;
  classificationLevel: string;
  year: number;
  quarter: number;
  score: string;
}

export interface CompanyPerformanceSnapshot extends CompanyPerformanceInput {
  id: string;
  projectId: string;
  companyName: string;
}

export interface ProjectPerformanceCandidate {
  id: string;
  companyName: string;
}

export interface ProjectPerformanceContext {
  id: string;
  name: string;
  candidates: readonly ProjectPerformanceCandidate[];
  projectTypes: readonly ProjectTypeValue[];
}

export interface PerformanceScoreRecord {
  projectType: ProjectTypeValue;
  year: number;
  quarter: number;
  score: string;
}

export interface ProjectTypePerformanceAverage {
  projectType: ProjectTypeValue;
  averageScore: string;
  quarterCount: number;
}

export type RecentPerformanceAverageResult =
  | {
      status: "complete";
      averageScore: string;
      projectTypeAverages: readonly ProjectTypePerformanceAverage[];
      missingProjectTypes: readonly ProjectTypeValue[];
    }
  | {
      status: "missing_data";
      averageScore: null;
      projectTypeAverages: readonly ProjectTypePerformanceAverage[];
      missingProjectTypes: readonly ProjectTypeValue[];
    }
  | {
      status: "no_project_types";
      averageScore: null;
      projectTypeAverages: readonly [];
      missingProjectTypes: readonly [];
    };

function compareQuarterDescending(
  left: PerformanceScoreRecord,
  right: PerformanceScoreRecord,
) {
  if (left.year !== right.year) {
    return left.year > right.year ? -1 : 1;
  }
  if (left.quarter !== right.quarter) {
    return left.quarter > right.quarter ? -1 : 1;
  }
  return 0;
}

function averageScores(records: readonly PerformanceScoreRecord[]) {
  const total = records.reduce(
    (sum, record) => sum.plus(new Decimal(record.score)),
    new Decimal(0),
  );
  return total.dividedBy(records.length).toString();
}

export function calculateRecentPerformanceAverage(
  projectTypes: readonly ProjectTypeValue[],
  records: readonly PerformanceScoreRecord[],
): RecentPerformanceAverageResult {
  const uniqueProjectTypes = [...new Set(projectTypes)];

  if (uniqueProjectTypes.length === 0) {
    return {
      status: "no_project_types",
      averageScore: null,
      projectTypeAverages: [],
      missingProjectTypes: [],
    };
  }

  const projectTypeAverages: ProjectTypePerformanceAverage[] = [];
  const missingProjectTypes: ProjectTypeValue[] = [];

  for (const projectType of uniqueProjectTypes) {
    const recentRecords = records
      .filter((record) => record.projectType === projectType)
      .toSorted(compareQuarterDescending)
      .slice(0, 12);

    if (recentRecords.length === 0) {
      missingProjectTypes.push(projectType);
      continue;
    }

    projectTypeAverages.push({
      projectType,
      averageScore: averageScores(recentRecords),
      quarterCount: recentRecords.length,
    });
  }

  if (missingProjectTypes.length > 0) {
    return {
      status: "missing_data",
      averageScore: null,
      projectTypeAverages,
      missingProjectTypes,
    };
  }

  const totalOfProjectTypeAverages = projectTypeAverages.reduce(
    (sum, item) => sum.plus(new Decimal(item.averageScore)),
    new Decimal(0),
  );

  return {
    status: "complete",
    averageScore: totalOfProjectTypeAverages
      .dividedBy(projectTypeAverages.length)
      .toString(),
    projectTypeAverages,
    missingProjectTypes,
  };
}

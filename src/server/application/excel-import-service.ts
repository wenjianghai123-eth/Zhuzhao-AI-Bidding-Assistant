import { createHash } from "node:crypto";

import type {
  ExcelImportData,
  ExcelImportFieldMapping,
  ExcelImportIssue,
  ExcelImportMapping,
  ExcelWorkbookData,
  ImportedCompanyPerformance,
} from "@/domain/imports";
import {
  parseExcelImportWorkbook,
  performanceImportIdentity,
} from "@/domain/imports";
import type { ExcelImportRepository } from "@/server/repositories/excel-import-repository";

const CANDIDATE_PREVIEW_LIMIT = 20;
const PERFORMANCE_PREVIEW_LIMIT = 30;

export interface ExcelImportPreview {
  fileName: string;
  fileSize: number;
  previewDigest: string;
  workbookSheets: readonly string[];
  mapping: ExcelImportMapping;
  fieldMappings: readonly ExcelImportFieldMapping[];
  issues: readonly ExcelImportIssue[];
  canImport: boolean;
  project: ExcelImportData["project"] | null;
  candidates: ExcelImportData["candidates"];
  performanceRecords: ExcelImportData["performanceRecords"];
  counts: {
    candidates: number;
    performanceRecords: number;
  };
}

export interface ExcelImportServiceDependencies {
  repository: ExcelImportRepository;
  workbookReader(bytes: Uint8Array): Promise<ExcelWorkbookData>;
}

function previewDigest(bytes: Uint8Array, mapping: ExcelImportMapping) {
  return createHash("sha256")
    .update(bytes)
    .update("\u0000")
    .update(JSON.stringify(mapping))
    .digest("hex");
}

function databaseConflictIssue(
  record: ImportedCompanyPerformance,
  sheetName: string,
): ExcelImportIssue {
  return {
    severity: "error",
    section: "performance",
    sheetName,
    rowNumber: record.sourceRow,
    columnName: record.sourceColumn,
    field: "score",
    message: `第${record.sourceRow}行 ${record.companyName} ${record.year}Q${record.quarter} 履约记录已存在，当前版本不会覆盖原数据。`,
  };
}

async function preparePreview(
  input: {
    bytes: Uint8Array;
    fileName: string;
    fileSize: number;
    mapping?: ExcelImportMapping;
  },
  dependencies: ExcelImportServiceDependencies,
) {
  const workbook = await dependencies.workbookReader(input.bytes);
  const parsed = parseExcelImportWorkbook(workbook, input.mapping);
  const issues = [...parsed.issues];

  if (parsed.data) {
    const existingIdentities =
      await dependencies.repository.findExistingPerformanceIdentities(
        parsed.data.performanceRecords,
      );
    for (const record of parsed.data.performanceRecords) {
      if (existingIdentities.has(performanceImportIdentity(record))) {
        issues.push(
          databaseConflictIssue(record, parsed.mapping.performanceSheetName),
        );
      }
    }
  }

  const canImport =
    parsed.data !== null &&
    !issues.some((item) => item.severity === "error");
  return {
    preview: {
      fileName: input.fileName,
      fileSize: input.fileSize,
      previewDigest: previewDigest(input.bytes, parsed.mapping),
      workbookSheets: parsed.workbookSheets,
      mapping: parsed.mapping,
      fieldMappings: parsed.fieldMappings,
      issues,
      canImport,
      project: parsed.data?.project ?? null,
      candidates:
        parsed.data?.candidates.slice(0, CANDIDATE_PREVIEW_LIMIT) ?? [],
      performanceRecords:
        parsed.data?.performanceRecords.slice(0, PERFORMANCE_PREVIEW_LIMIT) ?? [],
      counts: {
        candidates: parsed.data?.candidates.length ?? 0,
        performanceRecords: parsed.data?.performanceRecords.length ?? 0,
      },
    } satisfies ExcelImportPreview,
    data: parsed.data,
  };
}

export type PreviewExcelImportResult =
  | { status: "preview_ready"; preview: ExcelImportPreview }
  | { status: "invalid_workbook"; message: string };

export async function previewExcelImport(
  input: {
    bytes: Uint8Array;
    fileName: string;
    fileSize: number;
    mapping?: ExcelImportMapping;
  },
  dependencies: ExcelImportServiceDependencies,
): Promise<PreviewExcelImportResult> {
  try {
    const prepared = await preparePreview(input, dependencies);
    return { status: "preview_ready", preview: prepared.preview };
  } catch {
    return {
      status: "invalid_workbook",
      message: "Excel 文件无法解析，请确认文件未损坏且格式为 .xlsx。",
    };
  }
}

export type ConfirmExcelImportResult =
  | {
      status: "imported";
      projectId: string;
      candidateCount: number;
      performanceRecordCount: number;
    }
  | { status: "preview_mismatch"; message: string }
  | { status: "invalid_workbook"; message: string }
  | { status: "validation_error"; preview: ExcelImportPreview }
  | { status: "data_conflict"; message: string }
  | { status: "persistence_error"; message: string };

export async function confirmExcelImport(
  input: {
    bytes: Uint8Array;
    fileName: string;
    fileSize: number;
    mapping: ExcelImportMapping;
    expectedPreviewDigest: string;
  },
  dependencies: ExcelImportServiceDependencies,
): Promise<ConfirmExcelImportResult> {
  let prepared: Awaited<ReturnType<typeof preparePreview>>;
  try {
    prepared = await preparePreview(input, dependencies);
  } catch {
    return {
      status: "invalid_workbook",
      message: "Excel 文件无法重新解析，请重新上传并预览。",
    };
  }

  if (prepared.preview.previewDigest !== input.expectedPreviewDigest) {
    return {
      status: "preview_mismatch",
      message: "文件或字段映射已发生变化，请重新生成预览后再确认导入。",
    };
  }
  if (!prepared.preview.canImport || !prepared.data) {
    return { status: "validation_error", preview: prepared.preview };
  }

  try {
    const result = await dependencies.repository.importData(prepared.data);
    if (result.status === "performance_conflict") {
      return {
        status: "data_conflict",
        message: "确认导入前履约数据库已发生变化，未写入任何数据，请重新预览。",
      };
    }
    return {
      status: "imported",
      projectId: result.projectId,
      candidateCount: prepared.data.candidates.length,
      performanceRecordCount: prepared.data.performanceRecords.length,
    };
  } catch {
    return {
      status: "persistence_error",
      message: "导入事务执行失败，未写入任何数据，请检查后重试。",
    };
  }
}

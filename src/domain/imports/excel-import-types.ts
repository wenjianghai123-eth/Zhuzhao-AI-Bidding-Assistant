import type { ProjectCandidateInput } from "@/domain/candidates/project-candidate";
import type { CompanyPerformanceInput } from "@/domain/performance/company-performance";
import type { ProjectSettingsInput } from "@/domain/projects/project-settings";

export interface ExcelWorkbookCell {
  address: string;
  rowNumber: number;
  columnNumber: number;
  rawValue: string;
  displayText: string;
  isPercentage: boolean;
}

export interface ExcelWorkbookRow {
  rowNumber: number;
  cells: readonly ExcelWorkbookCell[];
}

export interface ExcelWorkbookSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: readonly ExcelWorkbookRow[];
}

export interface ExcelWorkbookData {
  sheets: readonly ExcelWorkbookSheet[];
}

export interface ExcelImportMapping {
  projectSheetName: string;
  candidateSheetName: string;
  performanceSheetName: string;
}

export type ExcelImportSection = "project" | "candidate" | "performance" | "workbook";

export interface ExcelImportFieldMapping {
  section: Exclude<ExcelImportSection, "workbook">;
  targetField: string;
  targetLabel: string;
  required: boolean;
  sourceSheet: string | null;
  sourceLocation: string | null;
  sourceLabel: string | null;
  detected: boolean;
}

export interface ExcelImportIssue {
  severity: "error" | "warning";
  section: ExcelImportSection;
  sheetName: string | null;
  rowNumber: number | null;
  columnName: string | null;
  field: string | null;
  message: string;
}

export interface ImportedProjectCandidate extends ProjectCandidateInput {
  sourceRow: number;
}

export interface ImportedCompanyPerformance extends CompanyPerformanceInput {
  sourceRow: number;
  sourceColumn: string;
}

export interface ExcelImportData {
  project: ProjectSettingsInput;
  candidates: readonly ImportedProjectCandidate[];
  performanceRecords: readonly ImportedCompanyPerformance[];
}

export interface ParsedExcelImport {
  workbookSheets: readonly string[];
  mapping: ExcelImportMapping;
  fieldMappings: readonly ExcelImportFieldMapping[];
  issues: readonly ExcelImportIssue[];
  data: ExcelImportData | null;
}

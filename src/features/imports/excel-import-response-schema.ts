import { z } from "zod";

import { PROJECT_TYPE_VALUES } from "@/domain/projects/project-settings";
import { excelImportMappingSchema } from "@/features/imports/excel-import-request";

const projectTypeSchema = z.enum(PROJECT_TYPE_VALUES);

const issueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  section: z.enum(["project", "candidate", "performance", "workbook"]),
  sheetName: z.string().nullable(),
  rowNumber: z.number().int().nullable(),
  columnName: z.string().nullable(),
  field: z.string().nullable(),
  message: z.string(),
});

const fieldMappingSchema = z.object({
  section: z.enum(["project", "candidate", "performance"]),
  targetField: z.string(),
  targetLabel: z.string(),
  required: z.boolean(),
  sourceSheet: z.string().nullable(),
  sourceLocation: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  detected: z.boolean(),
});

const projectSchema = z.object({
  name: z.string(),
  maxBidPrice: z.string(),
  nonCompetitiveFee: z.string(),
  projectTypes: z.array(projectTypeSchema),
  qingbiaoDrawValue1: z.string(),
  qingbiaoDrawValue2: z.string(),
  qingbiaoDrawValue3: z.string(),
  qingbiaoDrawValue4: z.string(),
  totalBidPriceScore: z.string(),
  similarExperienceScore: z.string(),
  otherScore: z.string(),
  rankDeduction: z.string(),
  finalDrawValue1: z.string(),
  finalDrawValue2: z.string(),
  finalDrawValue3: z.string(),
});

const candidateSchema = z.object({
  sourceRow: z.number().int(),
  companyName: z.string(),
  bidPrice: z.string(),
  netDiscountRate: z.string(),
  trademarkScore: z.string(),
  technicalScore: z.string(),
  similarExperienceScore: z.string(),
  otherScore: z.string(),
  isOurCompany: z.boolean(),
});

const performanceSchema = z.object({
  sourceRow: z.number().int(),
  sourceColumn: z.string(),
  companyName: z.string(),
  projectType: projectTypeSchema,
  classificationLevel: z.string(),
  year: z.number().int(),
  quarter: z.number().int(),
  score: z.string(),
});

export const excelImportPreviewSchema = z.object({
  fileName: z.string(),
  fileSize: z.number().int(),
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  workbookSheets: z.array(z.string()),
  mapping: excelImportMappingSchema,
  fieldMappings: z.array(fieldMappingSchema),
  issues: z.array(issueSchema),
  canImport: z.boolean(),
  project: projectSchema.nullable(),
  candidates: z.array(candidateSchema),
  performanceRecords: z.array(performanceSchema),
  counts: z.object({
    candidates: z.number().int(),
    performanceRecords: z.number().int(),
  }),
});

export const previewExcelImportResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("preview_ready"), preview: excelImportPreviewSchema }),
  z.object({ status: z.literal("invalid_workbook"), message: z.string() }),
]);

export const confirmExcelImportResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("imported"),
    projectId: z.string(),
    candidateCount: z.number().int(),
    performanceRecordCount: z.number().int(),
  }),
  z.object({ status: z.literal("preview_mismatch"), message: z.string() }),
  z.object({ status: z.literal("invalid_workbook"), message: z.string() }),
  z.object({
    status: z.literal("validation_error"),
    preview: excelImportPreviewSchema,
  }),
  z.object({ status: z.literal("data_conflict"), message: z.string() }),
  z.object({ status: z.literal("persistence_error"), message: z.string() }),
]);

export const importErrorResponseSchema = z.object({ message: z.string() }).passthrough();

export type ExcelImportPreviewView = z.infer<typeof excelImportPreviewSchema>;

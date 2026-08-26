import Decimal from "decimal.js";

import {
  candidateFormSchema,
  getCandidateFormFieldErrors,
  preferredStatusLabel,
  type CandidateFormFieldErrors,
  type CandidateFormValues,
} from "@/features/candidates/candidate-form-schema";

export const CANDIDATE_TABLE_COLUMNS = [
  "序号",
  "单位名称",
  "投标总价（万元）",
  "净下浮率",
  "商务优",
  "技术优",
  "同类业绩",
  "其他主客观分",
  "操作",
] as const;

export const CANDIDATE_CSV_COLUMNS = CANDIDATE_TABLE_COLUMNS.slice(0, -1);

const PASTE_COLUMN_COUNT = 7;
const HEADER_NAMES = new Set(["单位名称", "公司名称", "候选单位"]);

export interface CandidatePastePreviewRow {
  rowNumber: number;
  values: CandidateFormValues;
  fieldErrors: CandidateFormFieldErrors;
  messages: readonly string[];
}

export interface CandidatePastePreview {
  rows: readonly CandidatePastePreviewRow[];
  hasErrors: boolean;
}

function parsePreferredStatus(value: string) {
  const normalized = value.trim();
  if (normalized === "" || normalized === "无" || normalized === "0") {
    return "0";
  }
  if (normalized === "有" || normalized === "1") {
    return "1";
  }
  return normalized;
}

function addFieldError(
  errors: CandidateFormFieldErrors,
  field: keyof CandidateFormFieldErrors,
  message: string,
) {
  return {
    ...errors,
    [field]: [...(errors[field] ?? []), message],
  };
}

function messagesFromFieldErrors(errors: CandidateFormFieldErrors) {
  return [...new Set(Object.values(errors).flatMap((messages) => messages ?? []))];
}

function looksLikeHeader(cells: readonly string[]) {
  return HEADER_NAMES.has((cells[0] ?? "").trim());
}

export function parseCandidatePaste(text: string): CandidatePastePreview {
  const sourceRows = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line, index) => ({
      sourceRowNumber: index + 1,
      cells: line.split("\t"),
    }))
    .filter(({ cells }) => cells.some((cell) => cell.trim().length > 0));

  const dataRows = sourceRows[0] && looksLikeHeader(sourceRows[0].cells)
    ? sourceRows.slice(1)
    : sourceRows;

  let parsedRows = dataRows.map(({ sourceRowNumber, cells }) => {
    const normalizedCells = Array.from(
      { length: PASTE_COLUMN_COUNT },
      (_, index) => (cells[index] ?? "").trim(),
    );
    const values: CandidateFormValues = {
      companyName: normalizedCells[0] ?? "",
      bidPrice: normalizedCells[1] ?? "",
      netDiscountRate: normalizedCells[2] ?? "",
      trademarkScore: parsePreferredStatus(normalizedCells[3] ?? ""),
      technicalScore: parsePreferredStatus(normalizedCells[4] ?? ""),
      similarExperienceScore: normalizedCells[5] ?? "",
      otherScore: normalizedCells[6] ?? "",
      isOurCompany: false,
    };
    const validation = candidateFormSchema.safeParse(values);
    let fieldErrors = validation.success
      ? {}
      : getCandidateFormFieldErrors(validation.error);

    if (cells.length > PASTE_COLUMN_COUNT) {
      fieldErrors = addFieldError(
        fieldErrors,
        "otherScore",
        `第 ${sourceRowNumber} 行超过 ${PASTE_COLUMN_COUNT} 列，请检查制表符。`,
      );
    }

    return {
      rowNumber: sourceRowNumber,
      values: validation.success ? validation.data : values,
      fieldErrors,
      messages: messagesFromFieldErrors(fieldErrors),
    } satisfies CandidatePastePreviewRow;
  });

  const firstRowByCompanyName = new Map<string, number>();
  parsedRows = parsedRows.map((row) => {
    const companyName = row.values.companyName.trim();
    if (companyName.length === 0) {
      return row;
    }

    const firstRowNumber = firstRowByCompanyName.get(companyName);
    if (firstRowNumber === undefined) {
      firstRowByCompanyName.set(companyName, row.rowNumber);
      return row;
    }

    const fieldErrors = addFieldError(
      row.fieldErrors,
      "companyName",
      `与第 ${firstRowNumber} 行单位名称重复`,
    );
    return {
      ...row,
      fieldErrors,
      messages: messagesFromFieldErrors(fieldErrors),
    };
  });

  return {
    rows: parsedRows,
    hasErrors:
      parsedRows.length === 0 || parsedRows.some((row) => row.messages.length > 0),
  };
}

function escapeCsvCell(value: string | number) {
  const text = String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCandidateCsv(candidates: readonly CandidateFormValues[]) {
  const lines = [CANDIDATE_CSV_COLUMNS.map(escapeCsvCell).join(",")];
  for (const [index, candidate] of candidates.entries()) {
    lines.push(
      [
        index + 1,
        candidate.companyName,
        new Decimal(candidate.bidPrice).toString(),
        new Decimal(candidate.netDiscountRate).toString(),
        preferredStatusLabel(candidate.trademarkScore),
        preferredStatusLabel(candidate.technicalScore),
        new Decimal(candidate.similarExperienceScore).toString(),
        new Decimal(candidate.otherScore).toString(),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

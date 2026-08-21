import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

import type {
  ExcelWorkbookCell,
  ExcelWorkbookData,
} from "@/domain/imports";

function objectValue(value: object): string {
  if ("result" in value) {
    return primitiveValue(value.result);
  }
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText
      .flatMap((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? [String(part.text)]
          : [],
      )
      .join("");
  }
  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }
  if ("error" in value) {
    return String(value.error);
  }
  return "";
}

function primitiveValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return new Decimal(value).toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && value !== null) {
    return objectValue(value);
  }
  return "";
}

function safeDisplayText(cell: ExcelJS.Cell, fallback: string) {
  try {
    return cell.text || fallback;
  } catch {
    return fallback;
  }
}

export async function readExcelWorkbook(
  bytes: Uint8Array,
): Promise<ExcelWorkbookData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from([bytes]));

  return {
    sheets: workbook.worksheets.map((worksheet) => ({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      rows: worksheet
        .getRows(1, worksheet.rowCount)
        ?.map((row) => {
          const cells: ExcelWorkbookCell[] = [];
          row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
            const rawValue = primitiveValue(cell.value);
            const displayText = safeDisplayText(cell, rawValue);
            if (!rawValue && !displayText) {
              return;
            }
            cells.push({
              address: cell.address,
              rowNumber: row.number,
              columnNumber,
              rawValue,
              displayText,
              isPercentage: cell.numFmt?.includes("%") ?? false,
            });
          });
          return { rowNumber: row.number, cells };
        }) ?? [],
    })),
  };
}

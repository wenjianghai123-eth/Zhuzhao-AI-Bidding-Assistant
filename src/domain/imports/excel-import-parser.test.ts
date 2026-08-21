import { describe, expect, it } from "vitest";

import {
  parseExcelImportWorkbook,
  type ExcelWorkbookCell,
  type ExcelWorkbookData,
  type ExcelWorkbookRow,
  type ExcelWorkbookSheet,
} from "@/domain/imports";

function columnName(columnNumber: number) {
  let value = columnNumber;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cell(
  rowNumber: number,
  columnNumber: number,
  rawValue: string,
  options?: { displayText?: string; isPercentage?: boolean },
): ExcelWorkbookCell {
  return {
    address: `${columnName(columnNumber)}${rowNumber}`,
    rowNumber,
    columnNumber,
    rawValue,
    displayText: options?.displayText ?? rawValue,
    isPercentage: options?.isPercentage ?? false,
  };
}

function row(rowNumber: number, cells: readonly ExcelWorkbookCell[]): ExcelWorkbookRow {
  return { rowNumber, cells };
}

function sheet(name: string, rows: readonly ExcelWorkbookRow[]): ExcelWorkbookSheet {
  return {
    name,
    rowCount: Math.max(...rows.map((item) => item.rowNumber), 0),
    columnCount: Math.max(
      ...rows.flatMap((item) => item.cells.map((itemCell) => itemCell.columnNumber)),
      0,
    ),
    rows,
  };
}

function validWorkbook(): ExcelWorkbookData {
  return {
    sheets: [
      sheet("参数设置", [
        row(2, [cell(2, 1, "项目名称："), cell(2, 2, "  测试项目  ")]),
        row(3, [
          cell(3, 1, "最高投标限价（万元）："),
          cell(3, 2, "1000"),
          cell(3, 3, "不可竞争费（万元）："),
          cell(3, 4, "100"),
          cell(3, 5, "项目类型："),
          cell(3, 6, "幕墙 + 装修"),
        ]),
        row(6, [cell(6, 1, "总投标报价分值："), cell(6, 2, "40")]),
        row(7, [cell(7, 1, "排名递减扣分值："), cell(7, 2, "2")]),
        row(10, [
          cell(10, 1, "定标抽值"),
          cell(10, 2, "0"),
          cell(10, 3, "1"),
          cell(10, 4, "2"),
        ]),
        row(13, [
          cell(13, 2, "单位名称"),
          cell(13, 3, "投标总价（万元）"),
          cell(13, 4, "净下浮率"),
          cell(13, 5, "商标优"),
          cell(13, 6, "技术优"),
          cell(13, 7, "同类业绩"),
          cell(13, 8, "其他主客观分"),
          cell(13, 9, "我方单位"),
        ]),
        row(14, [
          cell(14, 2, "  甲公司  "),
          cell(14, 3, "800"),
          cell(14, 4, "10%"),
          cell(14, 5, "1"),
          cell(14, 6, "2"),
          cell(14, 7, "3"),
          cell(14, 8, "4"),
          cell(14, 9, "是"),
        ]),
        row(15, [
          cell(15, 2, "乙公司"),
          cell(15, 3, "820"),
          cell(15, 4, "0.12", { displayText: "12%", isPercentage: true }),
          cell(15, 5, "0"),
          cell(15, 6, "0"),
          cell(15, 7, "5"),
          cell(15, 8, "6"),
        ]),
      ]),
      sheet("履约信息", [
        row(3, [
          cell(3, 2, "单位名称"),
          cell(3, 3, "类型"),
          cell(3, 4, "分类分级等级"),
          cell(3, 5, "24年4季度平均分"),
          cell(3, 6, "2025Q1"),
          cell(3, 7, "加权平均分"),
        ]),
        row(4, [
          cell(4, 2, "  甲公司  "),
          cell(4, 3, "幕墙"),
          cell(4, 4, "A"),
          cell(4, 5, "88.5"),
          cell(4, 6, "90"),
          cell(4, 7, "89.25"),
        ]),
      ]),
      sheet("清标测算", [row(1, [cell(1, 1, "旧清标结果")])]),
      sheet("定标测算", [row(1, [cell(1, 1, "旧定标结果")])]),
    ],
  };
}

describe("parseExcelImportWorkbook", () => {
  it("parses project, candidates and wide quarterly performance input", () => {
    const result = parseExcelImportWorkbook(validWorkbook());

    expect(result.data?.project).toEqual({
      name: "测试项目",
      maxBidPrice: "1000",
      nonCompetitiveFee: "100",
      projectTypes: ["CURTAIN_WALL", "DECORATION"],
      totalBidPriceScore: "40",
      rankDeduction: "2",
      finalDrawValue1: "0",
      finalDrawValue2: "0.01",
      finalDrawValue3: "0.02",
    });
    expect(result.data?.candidates).toHaveLength(2);
    expect(result.data?.candidates[0]).toMatchObject({
      sourceRow: 14,
      companyName: "甲公司",
      netDiscountRate: "0.1",
      isOurCompany: true,
    });
    expect(result.data?.candidates[1]).toMatchObject({
      sourceRow: 15,
      companyName: "乙公司",
      netDiscountRate: "0.12",
      trademarkScore: "0",
    });
    expect(result.data?.performanceRecords).toEqual([
      {
        sourceRow: 4,
        sourceColumn: "E4",
        companyName: "甲公司",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        year: 2024,
        quarter: 4,
        score: "88.5",
      },
      {
        sourceRow: 4,
        sourceColumn: "F4",
        companyName: "甲公司",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        year: 2025,
        quarter: 1,
        score: "90",
      },
    ]);
    expect(result.issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(result.issues.filter((item) => item.severity === "warning")).toHaveLength(2);
  });

  it("reports the exact row and cell for an invalid number", () => {
    const workbook = validWorkbook();
    const settings = workbook.sheets[0];
    const invalidRows = settings?.rows.map((item) =>
      item.rowNumber === 15
        ? row(15, [
            ...(item.cells.filter((itemCell) => itemCell.columnNumber !== 3)),
            cell(15, 3, "八百二十"),
          ])
        : item,
    );
    const result = parseExcelImportWorkbook({
      sheets: [
        ...(settings && invalidRows ? [sheet(settings.name, invalidRows)] : []),
        ...workbook.sheets.slice(1),
      ],
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        section: "candidate",
        rowNumber: 15,
        columnName: "C15",
        field: "bidPrice",
      }),
    );
  });

  it("blocks missing required candidate fields", () => {
    const workbook = validWorkbook();
    const settings = workbook.sheets[0];
    const rowsWithoutBidHeader = settings?.rows.map((item) =>
      item.rowNumber === 13
        ? row(
            13,
            item.cells.filter((itemCell) => itemCell.columnNumber !== 3),
          )
        : item,
    );
    const result = parseExcelImportWorkbook({
      sheets: [
        ...(settings && rowsWithoutBidHeader
          ? [sheet(settings.name, rowsWithoutBidHeader)]
          : []),
        ...workbook.sheets.slice(1),
      ],
    });

    expect(result.data?.candidates).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        section: "candidate",
        rowNumber: 13,
        field: "bidPrice",
      }),
    );
  });

  it("reports duplicate candidate names after trimming whitespace", () => {
    const workbook = validWorkbook();
    const settings = workbook.sheets[0];
    const duplicateRows = settings?.rows.map((item) =>
      item.rowNumber === 15
        ? row(15, [
            cell(15, 2, "甲公司 "),
            ...item.cells.filter((itemCell) => itemCell.columnNumber !== 2),
          ])
        : item,
    );
    const result = parseExcelImportWorkbook({
      sheets: [
        ...(settings && duplicateRows ? [sheet(settings.name, duplicateRows)] : []),
        ...workbook.sheets.slice(1),
      ],
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        rowNumber: 15,
        field: "companyName",
        message: expect.stringContaining("与第14行重复"),
      }),
    );
  });

  it("does not parse Qingbiao or Dingbiao sheets as import data", () => {
    const result = parseExcelImportWorkbook(validWorkbook());

    expect(result.fieldMappings.every((item) => item.sourceSheet !== "清标测算")).toBe(true);
    expect(result.fieldMappings.every((item) => item.sourceSheet !== "定标测算")).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", sheetName: "清标测算" }),
        expect.objectContaining({ severity: "warning", sheetName: "定标测算" }),
      ]),
    );
  });
});

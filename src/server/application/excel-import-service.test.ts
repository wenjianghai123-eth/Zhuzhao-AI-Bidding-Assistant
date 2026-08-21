import { describe, expect, it } from "vitest";

import type {
  ExcelWorkbookCell,
  ExcelWorkbookData,
  ExcelWorkbookRow,
} from "@/domain/imports";
import {
  confirmExcelImport,
  previewExcelImport,
  type ExcelImportServiceDependencies,
} from "@/server/application/excel-import-service";
import type { ExcelImportRepository } from "@/server/repositories/excel-import-repository";

function cell(row: number, column: number, value: string): ExcelWorkbookCell {
  return {
    address: `${String.fromCharCode(64 + column)}${row}`,
    rowNumber: row,
    columnNumber: column,
    rawValue: value,
    displayText: value,
    isPercentage: false,
  };
}

function workbook(): ExcelWorkbookData {
  const settingsRows: ExcelWorkbookRow[] = [
    { rowNumber: 2, cells: [cell(2, 1, "项目名称"), cell(2, 2, "导入项目")] },
    {
      rowNumber: 3,
      cells: [
        cell(3, 1, "最高投标限价"),
        cell(3, 2, "1000"),
        cell(3, 3, "不可竞争费"),
        cell(3, 4, "100"),
        cell(3, 5, "项目类型"),
        cell(3, 6, "幕墙"),
      ],
    },
    { rowNumber: 6, cells: [cell(6, 1, "总投标报价分值"), cell(6, 2, "40")] },
    { rowNumber: 7, cells: [cell(7, 1, "排名递减扣分值"), cell(7, 2, "2")] },
    {
      rowNumber: 10,
      cells: [cell(10, 1, "定标抽值"), cell(10, 2, "0"), cell(10, 3, "1"), cell(10, 4, "2")],
    },
    {
      rowNumber: 13,
      cells: [
        cell(13, 2, "单位名称"),
        cell(13, 3, "投标总价"),
        cell(13, 4, "净下浮率"),
        cell(13, 5, "商标优"),
        cell(13, 6, "技术优"),
        cell(13, 7, "同类业绩"),
        cell(13, 8, "其他主客观分"),
      ],
    },
    {
      rowNumber: 14,
      cells: [
        cell(14, 2, "甲公司"),
        cell(14, 3, "800"),
        cell(14, 4, "10"),
        cell(14, 5, "0"),
        cell(14, 6, "0"),
        cell(14, 7, "5"),
        cell(14, 8, "5"),
      ],
    },
  ];
  const performanceRows: ExcelWorkbookRow[] = [
    {
      rowNumber: 3,
      cells: [
        cell(3, 2, "单位名称"),
        cell(3, 3, "类型"),
        cell(3, 4, "分类分级等级"),
        cell(3, 5, "2025Q1"),
      ],
    },
    {
      rowNumber: 4,
      cells: [
        cell(4, 2, "甲公司"),
        cell(4, 3, "幕墙"),
        cell(4, 4, "A"),
        cell(4, 5, "90"),
      ],
    },
  ];
  return {
    sheets: [
      { name: "参数设置", rowCount: 14, columnCount: 8, rows: settingsRows },
      { name: "履约信息", rowCount: 4, columnCount: 5, rows: performanceRows },
    ],
  };
}

function dependencies(input?: {
  existingIdentities?: ReadonlySet<string>;
  onImport?: () => void;
}): ExcelImportServiceDependencies {
  const repository: ExcelImportRepository = {
    async findExistingPerformanceIdentities() {
      return input?.existingIdentities ?? new Set();
    },
    async importData() {
      input?.onImport?.();
      return { status: "imported", projectId: "imported-project" };
    },
  };
  return {
    repository,
    async workbookReader() {
      return workbook();
    },
  };
}

const fileInput = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  fileName: "投标数据.xlsx",
  fileSize: 4,
};

describe("Excel import preview and confirmation", () => {
  it("previews valid data without writing to the repository", async () => {
    let importCount = 0;
    const result = await previewExcelImport(
      fileInput,
      dependencies({ onImport: () => (importCount += 1) }),
    );

    expect(result.status).toBe("preview_ready");
    if (result.status !== "preview_ready") {
      return;
    }
    expect(result.preview.canImport).toBe(true);
    expect(result.preview.counts).toEqual({ candidates: 1, performanceRecords: 1 });
    expect(importCount).toBe(0);
  });

  it("requires the exact preview digest before importing", async () => {
    let importCount = 0;
    const deps = dependencies({ onImport: () => (importCount += 1) });
    const preview = await previewExcelImport(fileInput, deps);
    expect(preview.status).toBe("preview_ready");
    if (preview.status !== "preview_ready") {
      return;
    }

    const result = await confirmExcelImport(
      {
        ...fileInput,
        mapping: preview.preview.mapping,
        expectedPreviewDigest: "0".repeat(64),
      },
      deps,
    );

    expect(result.status).toBe("preview_mismatch");
    expect(importCount).toBe(0);
  });

  it("imports only after a successful preview and confirmation", async () => {
    let importCount = 0;
    const deps = dependencies({ onImport: () => (importCount += 1) });
    const preview = await previewExcelImport(fileInput, deps);
    expect(preview.status).toBe("preview_ready");
    if (preview.status !== "preview_ready") {
      return;
    }

    const result = await confirmExcelImport(
      {
        ...fileInput,
        mapping: preview.preview.mapping,
        expectedPreviewDigest: preview.preview.previewDigest,
      },
      deps,
    );

    expect(result).toEqual({
      status: "imported",
      projectId: "imported-project",
      candidateCount: 1,
      performanceRecordCount: 1,
    });
    expect(importCount).toBe(1);
  });

  it("blocks existing performance records before transaction import", async () => {
    let importCount = 0;
    const identity = "甲公司\u0000CURTAIN_WALL\u00002025\u00001";
    const result = await previewExcelImport(
      fileInput,
      dependencies({
        existingIdentities: new Set([identity]),
        onImport: () => (importCount += 1),
      }),
    );

    expect(result.status).toBe("preview_ready");
    if (result.status !== "preview_ready") {
      return;
    }
    expect(result.preview.canImport).toBe(false);
    expect(result.preview.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        section: "performance",
        rowNumber: 4,
        message: expect.stringContaining("不会覆盖原数据"),
      }),
    );
    expect(importCount).toBe(0);
  });
});

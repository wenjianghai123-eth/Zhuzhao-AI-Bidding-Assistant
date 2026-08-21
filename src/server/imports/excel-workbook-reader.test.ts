import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseExcelImportWorkbook } from "@/domain/imports";
import { readExcelWorkbook } from "@/server/imports/excel-workbook-reader";

describe("readExcelWorkbook", () => {
  it("reads a real xlsx buffer and preserves percentage semantics", async () => {
    const workbook = new ExcelJS.Workbook();
    const settings = workbook.addWorksheet("参数设置");
    settings.getCell("A2").value = "项目名称";
    settings.getCell("B2").value = "XLSX测试项目";
    settings.getCell("A3").value = "最高投标限价（万元）";
    settings.getCell("B3").value = 1000;
    settings.getCell("C3").value = "不可竞争费（万元）";
    settings.getCell("D3").value = 100;
    settings.getCell("E3").value = "项目类型";
    settings.getCell("F3").value = "幕墙";
    settings.getCell("A6").value = "总投标报价分值";
    settings.getCell("B6").value = 40;
    settings.getCell("A7").value = "排名递减扣分值";
    settings.getCell("B7").value = 2;
    settings.getCell("A10").value = "定标抽值";
    settings.getCell("B10").value = 0;
    settings.getCell("C10").value = 1;
    settings.getCell("D10").value = 2;
    ["单位名称", "投标总价", "净下浮率", "商标优", "技术优", "同类业绩", "其他主客观分"].forEach(
      (value, index) => {
        settings.getCell(13, index + 2).value = value;
      },
    );
    settings.getCell("B14").value = "甲公司";
    settings.getCell("C14").value = 800;
    settings.getCell("D14").value = 0.1;
    settings.getCell("D14").numFmt = "0%";
    settings.getCell("E14").value = 0;
    settings.getCell("F14").value = 0;
    settings.getCell("G14").value = 5;
    settings.getCell("H14").value = 5;

    const performance = workbook.addWorksheet("履约信息");
    performance.getCell("B3").value = "单位名称";
    performance.getCell("C3").value = "类型";
    performance.getCell("D3").value = "分类分级等级";
    performance.getCell("E3").value = "2025Q1";
    performance.getCell("B4").value = "甲公司";
    performance.getCell("C4").value = "幕墙";
    performance.getCell("D4").value = "A";
    performance.getCell("E4").value = 90;

    const buffer = await workbook.xlsx.writeBuffer();
    const parsedWorkbook = await readExcelWorkbook(new Uint8Array(buffer));
    const parsedImport = parseExcelImportWorkbook(parsedWorkbook);

    expect(parsedImport.data?.candidates[0]?.netDiscountRate).toBe("0.1");
    expect(parsedImport.data?.performanceRecords[0]).toMatchObject({
      year: 2025,
      quarter: 1,
      score: "90",
    });
    expect(parsedImport.issues.filter((item) => item.severity === "error")).toEqual([]);
  });
});

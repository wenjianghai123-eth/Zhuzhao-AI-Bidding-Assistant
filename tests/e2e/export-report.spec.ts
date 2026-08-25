import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

const goldenProjectId = "golden-project-20260820-a";
const expectedSheetNames = [
  "项目概览",
  "候选单位",
  "履约信息",
  "清标场景摘要",
  "清标全场景",
  "定标场景摘要",
  "定标全场景",
  "全场景分析",
  "计算快照_审计",
] as const;

test("浏览器可下载并复核 Golden Excel", async ({ page }) => {
  await page.goto(`/projects/${goldenProjectId}/analysis`);
  await expect(page.getByText("69/144", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("47.92%", { exact: true }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出分析结果" }).click();
  const download = await downloadPromise;
  const suggestedFileName = download.suggestedFilename();
  expect(suggestedFileName).toMatch(/^烛照AI投标分析_.+_\d{8}\.xlsx$/u);
  expect(suggestedFileName).not.toMatch(/[<>:"/\\|?*\u0000-\u001F]/u);
  expect(suggestedFileName.length).toBeLessThanOrEqual(110);

  const downloadPath = await download.path();
  if (downloadPath === null) {
    throw new Error("Playwright did not expose the completed Excel download path.");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(downloadPath);
  expect(workbook.worksheets.map(({ name }) => name)).toEqual(
    expectedSheetNames,
  );
  expect(workbook.getWorksheet("清标场景摘要")?.rowCount).toBe(17);
  expect(workbook.getWorksheet("定标场景摘要")?.rowCount).toBe(145);

  const qingbiaoSheet = workbook.getWorksheet("清标场景摘要");
  expect(qingbiaoSheet?.getCell("C2").numFmt).toMatch(/%/u);
  expect(qingbiaoSheet?.getCell("D2").numFmt).toMatch(/%/u);
  const analysisSheet = workbook.getWorksheet("全场景分析");
  const rateRow = analysisSheet
    ?.getRows(1, analysisSheet.rowCount)
    ?.find((row) => row.getCell(2).text === "全场景模拟中标率");
  expect(rateRow?.getCell(3).value).toBeCloseTo(69 / 144, 10);
  expect(rateRow?.getCell(4).value).toBe(69);
  expect(rateRow?.getCell(5).value).toBe(144);
  expect(rateRow?.getCell(3).numFmt).toMatch(/%/u);
  expect(workbook.getWorksheet("计算快照_审计")?.rowCount).toBeGreaterThan(1);
});

test("报告页面遵守展示契约并具备可打印样式", async ({ page }) => {
  await page.goto(`/projects/${goldenProjectId}/report`);
  const report = page.locator("article.analysis-report");
  await expect(
    report.getByRole("heading", { name: "烛照AI投标分析报告" }).last(),
  ).toBeVisible();
  await expect(report.getByText("一、项目概况")).toBeVisible();
  await expect(report.getByText("二、清标模拟结果")).toBeVisible();
  await expect(report.getByText("三、定标模拟结果")).toBeVisible();
  await expect(report.getByText("四、竞争格局")).toBeVisible();
  await expect(report.getByText("五、重点场景")).toBeVisible();
  await expect(report.getByText("六、说明")).toBeVisible();
  await expect(report).toContainText("47.92%（69/144）");
  await expect(report).toContainText(
    "不代表现实事件发生概率，也不构成实际中标保证",
  );
  await expect(report).not.toContainText("golden-c");
  await expect(report).not.toContainText("NON_POSITIVE_BENCHMARK_FACTOR");
  await expect(report).not.toContainText("0.47916666666666666667");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("aside.print-hidden")).toBeHidden();
  await expect(page.locator("header.print-hidden")).toBeHidden();
  await expect(report.locator(".print-hidden")).toBeHidden();
  await expect(report).toHaveCSS("color", "rgb(0, 0, 0)");

  const printLayout = await report.evaluate((element) => ({
    reportWidth: element.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    pageBackground: getComputedStyle(document.body).backgroundColor,
    visibleButtons: [...element.querySelectorAll("button")].filter(
      (button) => button.getClientRects().length > 0,
    ).length,
  }));
  expect(printLayout.reportWidth).toBeLessThanOrEqual(
    printLayout.viewportWidth + 2,
  );
  expect(printLayout.pageBackground).toBe("rgb(255, 255, 255)");
  expect(printLayout.visibleButtons).toBe(0);
});

import "dotenv/config";

import ExcelJS from "exceljs";

import { parseExcelImportWorkbook } from "../src/domain/imports/excel-import-parser";
import {
  confirmRuntimeExcelImport,
  previewRuntimeExcelImport,
} from "../src/server/application/excel-import-runtime-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";
import { readExcelWorkbook } from "../src/server/imports/excel-workbook-reader";
import { prismaExcelImportRepository } from "../src/server/repositories/excel-import-repository";

assertSafeDestructiveDatabaseTarget(process.env.DATABASE_URL, "Excel import verification");

const projectName = "Excel导入事务验收项目";
const companyName = "Excel导入事务验收公司";

async function cleanVerificationData() {
  await prisma.project.deleteMany({ where: { name: projectName } });
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const settings = workbook.addWorksheet("参数设置");
  settings.getCell("A2").value = "项目名称";
  settings.getCell("B2").value = projectName;
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
  settings.getCell("B14").value = `  ${companyName}  `;
  settings.getCell("C14").value = 800;
  settings.getCell("D14").value = 10;
  settings.getCell("E14").value = 0;
  settings.getCell("F14").value = 0;
  settings.getCell("G14").value = 5;
  settings.getCell("H14").value = 5;

  const performance = workbook.addWorksheet("履约信息");
  performance.getCell("B3").value = "单位名称";
  performance.getCell("C3").value = "类型";
  performance.getCell("D3").value = "分类分级等级";
  performance.getCell("E3").value = "2025Q1";
  performance.getCell("F3").value = "2025Q2";
  performance.getCell("B4").value = companyName;
  performance.getCell("C4").value = "幕墙";
  performance.getCell("D4").value = "A";
  performance.getCell("E4").value = 90;
  performance.getCell("F4").value = 92;
  return workbook;
}

await cleanVerificationData();

try {
  const workbook = createWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const fileInput = {
    bytes,
    fileName: "excel-import-verification.xlsx",
    fileSize: bytes.byteLength,
  };
  const preview = await previewRuntimeExcelImport(fileInput);
  if (preview.status !== "preview_ready" || !preview.preview.canImport) {
    throw new Error("Excel import preview did not pass validation.");
  }
  const confirmed = await confirmRuntimeExcelImport({
    ...fileInput,
    mapping: preview.preview.mapping,
    expectedPreviewDigest: preview.preview.previewDigest,
  });
  if (confirmed.status !== "imported") {
    throw new Error(`Excel import confirmation failed: ${confirmed.status}`);
  }

  const [project, performanceRecords] = await Promise.all([
    prisma.project.findUnique({
      where: { id: confirmed.projectId },
      select: {
        name: true,
        candidates: { select: { id: true, companyName: true } },
      },
    }),
    prisma.companyPerformance.findMany({
      where: { projectId: confirmed.projectId },
      select: { projectId: true, candidateId: true, companyName: true },
    }),
  ]);
  if (
    project?.name !== projectName ||
    project.candidates[0]?.companyName !== companyName ||
    performanceRecords.length !== 2 ||
    performanceRecords.some(
      (record) =>
        record.projectId !== confirmed.projectId ||
        record.candidateId !== project.candidates[0]?.id,
    )
  ) {
    throw new Error("Persisted Excel import data does not match the preview.");
  }

  const parsed = parseExcelImportWorkbook(await readExcelWorkbook(bytes));
  if (!parsed.data) {
    throw new Error("Verification workbook did not parse after import.");
  }
  const secondImport = await prismaExcelImportRepository.importData(parsed.data);
  const projectCountAfterSecondImport = await prisma.project.count({
    where: { name: projectName },
  });
  if (
    secondImport.status !== "imported" ||
    projectCountAfterSecondImport !== 2
  ) {
    throw new Error("Same-company performance could not be isolated by project.");
  }
  const secondProjectPerformanceCount =
    await prisma.companyPerformance.count({
      where: {
        projectId: secondImport.projectId,
        companyName,
      },
    });
  if (secondProjectPerformanceCount !== 2) {
    throw new Error("Second import performance was not scoped to its project.");
  }

  console.log(
    JSON.stringify(
      {
        projectCreated: project.name,
        candidatesImported: project.candidates.length,
        performanceRecordsImported: performanceRecords.length,
        sameCompanySecondProjectAllowed: true,
        projectScopedCandidateRelationVerified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanVerificationData();
  await prisma.$disconnect();
}

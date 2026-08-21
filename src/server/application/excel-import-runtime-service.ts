import {
  confirmExcelImport,
  previewExcelImport,
} from "@/server/application/excel-import-service";
import { readExcelWorkbook } from "@/server/imports/excel-workbook-reader";
import { prismaExcelImportRepository } from "@/server/repositories/excel-import-repository";

const dependencies = {
  repository: prismaExcelImportRepository,
  workbookReader: readExcelWorkbook,
};

export function previewRuntimeExcelImport(
  input: Parameters<typeof previewExcelImport>[0],
) {
  return previewExcelImport(input, dependencies);
}

export function confirmRuntimeExcelImport(
  input: Parameters<typeof confirmExcelImport>[0],
) {
  return confirmExcelImport(input, dependencies);
}

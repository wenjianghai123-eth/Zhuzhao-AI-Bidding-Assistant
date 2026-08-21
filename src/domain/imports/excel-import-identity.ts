import type { ImportedCompanyPerformance } from "@/domain/imports/excel-import-types";

export function performanceImportIdentity(
  record: Pick<
    ImportedCompanyPerformance,
    "companyName" | "projectType" | "year" | "quarter"
  >,
) {
  return `${record.companyName}\u0000${record.projectType}\u0000${record.year}\u0000${record.quarter}`;
}

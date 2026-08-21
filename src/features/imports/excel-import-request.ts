import { z } from "zod";

import type { ExcelImportMapping } from "@/domain/imports";

export const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;

export function excelRequestIsTooLarge(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return false;
  }
  const parsed = Number(contentLength);
  return (
    Number.isFinite(parsed) &&
    parsed > MAX_EXCEL_FILE_SIZE + MAX_MULTIPART_OVERHEAD
  );
}

export const excelImportMappingSchema = z
  .object({
    projectSheetName: z.string().trim().min(1),
    candidateSheetName: z.string().trim().min(1),
    performanceSheetName: z.string().trim().min(1),
  })
  .strict();

export type ExcelUploadValidationResult =
  | {
      success: true;
      file: File;
      mapping?: ExcelImportMapping;
      previewDigest?: string;
    }
  | { success: false; message: string };

function parseMapping(value: FormDataEntryValue | null) {
  if (value === null || value === "") {
    return { success: true as const, mapping: undefined };
  }
  if (typeof value !== "string") {
    return { success: false as const, message: "字段映射格式无效。" };
  }
  try {
    const parsed: unknown = JSON.parse(value);
    const result = excelImportMappingSchema.safeParse(parsed);
    return result.success
      ? { success: true as const, mapping: result.data }
      : { success: false as const, message: "字段映射缺少必要工作表。" };
  } catch {
    return { success: false as const, message: "字段映射不是有效 JSON。" };
  }
}

export function validateExcelUploadFormData(
  formData: FormData,
  options: { requireMapping: boolean; requireDigest: boolean },
): ExcelUploadValidationResult {
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return { success: false, message: "请选择需要导入的 .xlsx 文件。" };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { success: false, message: "当前只支持 .xlsx 文件。" };
  }
  if (file.size === 0) {
    return { success: false, message: "上传文件不能为空。" };
  }
  if (file.size > MAX_EXCEL_FILE_SIZE) {
    return { success: false, message: "Excel 文件不能超过 10MB。" };
  }

  const mappingResult = parseMapping(formData.get("mapping"));
  if (!mappingResult.success) {
    return mappingResult;
  }
  if (options.requireMapping && !mappingResult.mapping) {
    return { success: false, message: "确认导入前必须提供已预览的字段映射。" };
  }

  const digestValue = formData.get("previewDigest");
  const previewDigest = typeof digestValue === "string" ? digestValue : undefined;
  if (
    options.requireDigest &&
    (!previewDigest || !/^[a-f0-9]{64}$/.test(previewDigest))
  ) {
    return { success: false, message: "预览凭证无效，请重新生成预览。" };
  }

  return {
    success: true,
    file,
    ...(mappingResult.mapping ? { mapping: mappingResult.mapping } : {}),
    ...(previewDigest ? { previewDigest } : {}),
  };
}

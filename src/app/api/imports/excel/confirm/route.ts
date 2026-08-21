import { revalidatePath } from "next/cache";

import {
  excelRequestIsTooLarge,
  validateExcelUploadFormData,
} from "@/features/imports/excel-import-request";
import { confirmRuntimeExcelImport } from "@/server/application/excel-import-runtime-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (excelRequestIsTooLarge(request)) {
    return Response.json({ message: "Excel 文件不能超过 10MB。" }, { status: 413 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ message: "上传请求格式无效。" }, { status: 400 });
  }
  const upload = validateExcelUploadFormData(formData, {
    requireMapping: true,
    requireDigest: true,
  });
  if (
    !upload.success ||
    !upload.mapping ||
    !upload.previewDigest
  ) {
    return Response.json(upload, { status: 400 });
  }

  const result = await confirmRuntimeExcelImport({
    bytes: new Uint8Array(await upload.file.arrayBuffer()),
    fileName: upload.file.name,
    fileSize: upload.file.size,
    mapping: upload.mapping,
    expectedPreviewDigest: upload.previewDigest,
  });
  if (result.status === "imported") {
    revalidatePath("/projects");
    revalidatePath("/performance");
    revalidatePath(`/projects/${result.projectId}`);
    return Response.json(result);
  }
  if (result.status === "validation_error") {
    return Response.json(result, { status: 422 });
  }
  if (result.status === "preview_mismatch" || result.status === "data_conflict") {
    return Response.json(result, { status: 409 });
  }
  return Response.json(result, { status: 500 });
}

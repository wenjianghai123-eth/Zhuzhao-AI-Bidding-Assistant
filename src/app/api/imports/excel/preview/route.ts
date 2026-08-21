import {
  excelRequestIsTooLarge,
  validateExcelUploadFormData,
} from "@/features/imports/excel-import-request";
import { previewRuntimeExcelImport } from "@/server/application/excel-import-runtime-service";

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
    requireMapping: false,
    requireDigest: false,
  });
  if (!upload.success) {
    return Response.json(upload, { status: 400 });
  }

  const result = await previewRuntimeExcelImport({
    bytes: new Uint8Array(await upload.file.arrayBuffer()),
    fileName: upload.file.name,
    fileSize: upload.file.size,
    ...(upload.mapping ? { mapping: upload.mapping } : {}),
  });
  return Response.json(result, {
    status: result.status === "preview_ready" ? 200 : 422,
  });
}

import { getRuntimeAnalysisDeliveryData } from "@/server/application/analysis-delivery-runtime-service";
import {
  createAnalysisExportFileName,
  createAnalysisExportWorkbook,
} from "@/server/exports/analysis-excel-exporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getRuntimeAnalysisDeliveryData(id);
  if (result.status === "project_not_found") {
    return new Response("项目不存在。", { status: 404 });
  }
  if (result.status === "unavailable") {
    return new Response(result.message, {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const bytes = await createAnalysisExportWorkbook(result.data);
  const fileName = createAnalysisExportFileName(
    result.data.project.projectName,
    new Date(result.data.generatedAt),
  );
  return new Response(bytes, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="zhuzhao-analysis.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

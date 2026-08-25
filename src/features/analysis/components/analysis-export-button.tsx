"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function getDownloadFileName(
  contentDisposition: string | null,
  fallback: string,
) {
  if (!contentDisposition) {
    return fallback;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return /filename="([^"]+)"/i.exec(contentDisposition)?.[1] ?? fallback;
}

export function AnalysisExportButton({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  const downloadLock = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadAnalysis() {
    if (!enabled || downloadLock.current || isDownloading) {
      return;
    }
    downloadLock.current = true;
    setIsDownloading(true);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/analysis/export`,
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) {
        const message = await response.text();
        toast.error(message || "分析结果导出失败，请稍后重试。");
        return;
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = getDownloadFileName(
        response.headers.get("Content-Disposition"),
        "烛照AI投标分析.xlsx",
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("分析结果已开始下载");
    } catch {
      toast.error("分析结果导出失败，请检查网络后重试。");
    } finally {
      downloadLock.current = false;
      setIsDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={!enabled || isDownloading}
      title={
        enabled
          ? "导出当前分析结果"
          : "当前分析结果已过期或不完整，请重新完成全场景测算。"
      }
      onClick={downloadAnalysis}
    >
      {isDownloading ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <Download />
      )}
      {isDownloading ? "正在导出" : "导出分析结果"}
    </Button>
  );
}

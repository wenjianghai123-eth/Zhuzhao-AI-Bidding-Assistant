"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry(): void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="页面数据加载失败"
      description="系统暂时无法读取页面数据，已有数据不会受到影响。请检查连接后重试。"
      action={
        <Button type="button" onClick={retry}>
          <RefreshCw aria-hidden="true" />
          重新加载
        </Button>
      }
    />
  );
}

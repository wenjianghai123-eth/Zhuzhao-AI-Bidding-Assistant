"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";

import "./globals.css";

export default function GlobalError({
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
    <html lang="zh-CN">
      <body>
        <main className="mx-auto flex min-h-svh max-w-3xl items-center px-4 py-10">
          <ErrorState
            className="w-full"
            title="应用暂时无法加载"
            description="发生了未预期的错误。请重新加载；若问题持续存在，请联系管理员。"
            action={
              <Button type="button" onClick={retry}>
                <RefreshCw aria-hidden="true" />
                重新加载
              </Button>
            }
          />
        </main>
      </body>
    </html>
  );
}

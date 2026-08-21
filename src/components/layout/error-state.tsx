import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ErrorState({
  title = "数据加载失败",
  description = "暂时无法获取页面数据，请稍后重试。",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
      role="alert"
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-destructive/25 bg-background text-destructive shadow-xs">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

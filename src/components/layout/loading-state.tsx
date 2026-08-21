import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function LoadingState({
  label = "正在加载，请稍候…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-32 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

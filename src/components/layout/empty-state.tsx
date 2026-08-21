import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg border bg-background text-primary shadow-xs">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QingbiaoReadinessIssue } from "@/server/application/qingbiao-readiness-service";

export function QingbiaoReadinessDialog({
  issues,
  open,
  onOpenChange,
}: {
  issues: readonly QingbiaoReadinessIssue[];
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="qingbiao-readiness-dialog"
      >
        <DialogHeader>
          <DialogTitle>暂不能进行清标测算</DialogTitle>
          <DialogDescription>
            请先完成以下 {issues.length} 项，再重新进行清标测算。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {issues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.candidateId ?? "project"}-${issue.projectType ?? "all"}-${index}`}
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-4"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-destructive">
                    {issue.category}
                  </p>
                  <p className="mt-1 font-medium">{issue.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {issue.message}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href={issue.actionHref}>{issue.actionLabel}</a>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

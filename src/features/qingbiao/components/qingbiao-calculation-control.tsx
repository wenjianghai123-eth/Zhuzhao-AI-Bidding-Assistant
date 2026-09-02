"use client";

import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { calculateQingbiaoAction } from "@/app/(dashboard)/projects/[id]/qingbiao/actions";
import { Button } from "@/components/ui/button";
import { QingbiaoReadinessDialog } from "@/features/qingbiao/components/qingbiao-readiness-dialog";
import type { QingbiaoReadiness } from "@/server/application/qingbiao-readiness-service";
import type { SavedQingbiaoCalculationSnapshot } from "@/server/repositories/qingbiao-repository";

function logQingbiaoClick(projectId: string, readinessReady: boolean) {
  if (process.env.NODE_ENV === "development") {
    console.info(
      JSON.stringify({
        event: "QINGBIAO_CLICK",
        projectId,
        readinessReady,
      }),
    );
  }
}

export function QingbiaoCalculationControl({
  projectId,
  initialReadiness,
  onCalculated,
  onIssuesChange,
}: {
  projectId: string;
  initialReadiness: QingbiaoReadiness;
  onCalculated?(calculation: SavedQingbiaoCalculationSnapshot): void;
  onIssuesChange?(issues: readonly string[]): void;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const operationLock = useRef(false);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function runCalculation() {
    logQingbiaoClick(projectId, readiness.ready);
    if (operationLock.current || isPending) {
      toast.info("清标测算正在进行中，请稍候。");
      return;
    }
    operationLock.current = true;
    setIsPending(true);
    onIssuesChange?.([]);
    try {
      const result = await calculateQingbiaoAction(projectId);
      if (result.status === "success") {
        setReadiness({ ready: true, issues: [] });
        onCalculated?.(result.calculation);
        toast.success(result.message);
        router.refresh();
        return;
      }
      if (result.status === "invalid") {
        onIssuesChange?.(result.issues);
        if (result.readinessIssues.length > 0) {
          setReadiness({ ready: false, issues: result.readinessIssues });
          setDialogOpen(true);
        }
      }
      toast.error(result.message);
    } catch {
      const message = "清标测算请求失败，未保存任何新结果。";
      onIssuesChange?.([message]);
      toast.error(message);
    } finally {
      operationLock.current = false;
      setIsPending(false);
    }
  }

  return (
    <>
      <div id="qingbiao-readiness" className="flex-1 text-sm">
        {readiness.ready ? (
          <span className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            清标测算条件已满足
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-amber-800">
            <AlertTriangle className="size-4" aria-hidden="true" />
            还有 {readiness.issues.length} 项信息需要完善
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-1 text-amber-900"
              onClick={() => setDialogOpen(true)}
            >
              查看缺失项
            </Button>
          </span>
        )}
      </div>
      <Button
        type="button"
        data-testid="qingbiao-calculate-button"
        disabled={isPending}
        aria-describedby="qingbiao-readiness"
        onClick={runCalculation}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Play />}
        {isPending ? "清标测算中..." : "清标测算"}
      </Button>
      <QingbiaoReadinessDialog
        issues={readiness.issues}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}

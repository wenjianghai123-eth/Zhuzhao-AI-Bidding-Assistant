"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Building2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteCandidateAction,
  setOurCandidateAction,
} from "@/app/(dashboard)/projects/[id]/candidates/actions";
import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CandidateListItem } from "@/features/candidates/candidate-form-schema";
import { CandidateDialog } from "@/features/candidates/components/candidate-dialog";
import {
  formatMoney,
  formatScore,
} from "@/lib/formatters";
import { formatPercentagePoints } from "@/lib/presentation";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; candidate: CandidateListItem };

interface CandidatesManagerProps {
  projectId: string;
  projectName: string;
  candidates: readonly CandidateListItem[];
}

export function CandidatesManager({
  projectId,
  projectName,
  candidates,
}: CandidatesManagerProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CandidateListItem | null>(
    null,
  );
  const [isActionPending, startActionTransition] = useTransition();
  const actionLock = useRef(false);
  const ourCompany = candidates.find((candidate) => candidate.isOurCompany);

  function setAsOurCompany(candidate: CandidateListItem) {
    if (actionLock.current || isActionPending) {
      return;
    }
    actionLock.current = true;
    startActionTransition(async () => {
      try {
        const result = await setOurCandidateAction(projectId, candidate.id);

        if (result.status === "success") {
          toast.success(result.message);
          router.refresh();
          return;
        }
        if (result.status === "unchanged") {
          toast.info(result.message);
          return;
        }
        toast.error(result.message);
      } catch {
        toast.error("设置我方单位失败，请检查网络后重试");
      } finally {
        actionLock.current = false;
      }
    });
  }

  function deleteCandidate() {
    if (!deleteTarget || actionLock.current || isActionPending) {
      return;
    }

    actionLock.current = true;
    startActionTransition(async () => {
      try {
        const result = await deleteCandidateAction(projectId, deleteTarget.id);
        if (result.status === "success") {
          toast.success(result.message);
          setDeleteTarget(null);
          router.refresh();
          return;
        }
        toast.error(result.message);
      } catch {
        toast.error("删除候选单位失败，原数据未发生变化");
      } finally {
        actionLock.current = false;
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Candidates"
        title="候选单位"
        description={`维护“${projectName}”的候选单位、投标报价与评分输入。`}
        actions={
          <Button type="button" onClick={() => setEditor({ mode: "create" })}>
            <Plus />
            新增候选单位
          </Button>
        }
      />

      {candidates.length < 5 ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>当前候选单位不足5家，将无法进行 N=5 定标模拟。</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">候选单位数量</p>
              <p className="mt-2 text-2xl font-semibold">{candidates.length} 家</p>
            </div>
            <Building2 className="size-5 text-primary" aria-hidden="true" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">当前我方单位</p>
              <p className="mt-2 font-medium">
                {ourCompany?.companyName ?? "尚未设置"}
              </p>
            </div>
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>候选单位清单</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-center">序号</TableHead>
                <TableHead className="min-w-56">单位名称</TableHead>
                <TableHead className="text-right">投标总价</TableHead>
                <TableHead className="text-right">净下浮率</TableHead>
                <TableHead className="text-right">商标优</TableHead>
                <TableHead className="text-right">技术优</TableHead>
                <TableHead className="text-right">同类业绩</TableHead>
                <TableHead className="text-right">其他主客观分</TableHead>
                <TableHead className="text-center">我方单位</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10}>
                    <EmptyState
                      className="m-3"
                      icon={Building2}
                      title="暂无候选单位"
                      description="新增候选单位后，可录入报价、评分并设置我方单位。"
                      action={
                        <Button
                          type="button"
                          onClick={() => setEditor({ mode: "create" })}
                        >
                          <Plus />
                          新增候选单位
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate, index) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="pl-4 text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {candidate.companyName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(candidate.bidPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercentagePoints(candidate.netDiscountRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.trademarkScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.technicalScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.similarExperienceScore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(candidate.otherScore)}
                    </TableCell>
                    <TableCell className="text-center">
                      {candidate.isOurCompany ? (
                        <Badge>我方</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isActionPending}
                            aria-label={`操作 ${candidate.companyName}`}
                          >
                            {isActionPending ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <MoreHorizontal />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onSelect={() =>
                              setEditor({ mode: "edit", candidate })
                            }
                          >
                            <Pencil />
                            编辑
                          </DropdownMenuItem>
                          {!candidate.isOurCompany ? (
                            <DropdownMenuItem
                              onSelect={() => setAsOurCompany(candidate)}
                            >
                              <ShieldCheck />
                              设为我方
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleteTarget(candidate)}
                          >
                            <Trash2 />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editor ? (
        <CandidateDialog
          key={
            editor.mode === "create"
              ? "create-candidate"
              : `edit-${editor.candidate.id}`
          }
          projectId={projectId}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditor(null);
            }
          }}
          {...editor}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除候选单位"
        description={`确定删除“${deleteTarget?.companyName ?? "该候选单位"}”吗？相关测算结果将失效，该操作无法撤销。`}
        confirmLabel="确认删除"
        pendingLabel="正在删除"
        destructive
        pending={isActionPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={deleteCandidate}
      />
    </div>
  );
}

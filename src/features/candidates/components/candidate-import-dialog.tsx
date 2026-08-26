"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ClipboardPaste, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { preferredStatusLabel, type CandidateFormValues } from "@/features/candidates/candidate-form-schema";
import { parseCandidatePaste } from "@/features/candidates/candidate-table-contract";

interface CandidateImportDialogProps {
  open: boolean;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(rows: readonly CandidateFormValues[]): Promise<boolean>;
}

export function CandidateImportDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: CandidateImportDialogProps) {
  const [pastedText, setPastedText] = useState("");
  const preview = useMemo(() => parseCandidatePaste(pastedText), [pastedText]);

  async function confirmImport() {
    if (preview.hasErrors || preview.rows.length === 0 || pending) {
      return;
    }
    const succeeded = await onConfirm(preview.rows.map(({ values }) => values));
    if (succeeded) {
      setPastedText("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>批量导入 / 粘贴数据</DialogTitle>
          <DialogDescription>
            从 Excel 复制七列数据并粘贴：单位名称、投标总价、净下浮率、商务优、技术优、同类业绩、其他主客观分。净下浮率输入 17.8 表示 17.8%。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="candidate-paste-data" className="text-sm font-medium">
            粘贴候选单位数据
          </label>
          <textarea
            id="candidate-paste-data"
            value={pastedText}
            rows={7}
            disabled={pending}
            placeholder={
              "星辉幕墙工程有限公司\t9860.5\t17.8\t有\t无\t8\t12\n和越装饰工程有限公司\t9720\t19\t无\t有\t7\t11"
            }
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setPastedText(event.target.value)}
          />
        </div>

        <section className="space-y-2" aria-labelledby="candidate-import-preview-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="candidate-import-preview-title" className="font-medium">
              导入预览
            </h3>
            <span className="text-xs text-muted-foreground">
              共 {preview.rows.length} 行
            </span>
          </div>

          {preview.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              粘贴后将在这里显示校验预览，不会立即写入数据库。
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行</TableHead>
                    <TableHead>单位名称</TableHead>
                    <TableHead>投标总价</TableHead>
                    <TableHead>净下浮率</TableHead>
                    <TableHead>商务优</TableHead>
                    <TableHead>技术优</TableHead>
                    <TableHead>同类业绩</TableHead>
                    <TableHead>其他主客观分</TableHead>
                    <TableHead>校验</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={row.messages.length > 0 ? "bg-destructive/5" : undefined}
                    >
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.values.companyName || "—"}</TableCell>
                      <TableCell>{row.values.bidPrice || "—"}</TableCell>
                      <TableCell>
                        {row.values.netDiscountRate
                          ? `${row.values.netDiscountRate}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {preferredStatusLabel(row.values.trademarkScore)}
                      </TableCell>
                      <TableCell>
                        {preferredStatusLabel(row.values.technicalScore)}
                      </TableCell>
                      <TableCell>
                        {row.values.similarExperienceScore || "—"}
                      </TableCell>
                      <TableCell>{row.values.otherScore || "—"}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        {row.messages.length > 0 ? (
                          <span className="inline-flex items-start gap-1 text-xs text-destructive">
                            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                            {row.messages.join("；")}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-700">可导入</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={preview.hasErrors || preview.rows.length === 0 || pending}
            onClick={confirmImport}
          >
            {pending ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
            {pending ? "正在导入" : `确认导入 ${preview.rows.length} 行`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

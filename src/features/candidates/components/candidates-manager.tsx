"use client";

import {
  type ChangeEvent,
  type FocusEvent,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Building2,
  Download,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkCreateCandidatesAction,
  createCandidateAction,
  deleteCandidateAction,
  setOurCandidateAction,
  updateCandidateAction,
} from "@/app/(dashboard)/projects/[id]/candidates/actions";
import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  candidateFormHasUserInput,
  candidateFormSchema,
  candidateFormValuesAreEqual,
  createEmptyCandidateFormValues,
  getCandidateFormFieldErrors,
  toCandidateFormData,
  type CandidateFormField,
  type CandidateFormFieldErrors,
  type CandidateFormValues,
  type CandidateListItem,
} from "@/features/candidates/candidate-form-schema";
import {
  CANDIDATE_TABLE_COLUMNS,
  createCandidateCsv,
} from "@/features/candidates/candidate-table-contract";
import { CandidateImportDialog } from "@/features/candidates/components/candidate-import-dialog";
import { cn } from "@/lib/utils";

type EditableCandidateField = Exclude<CandidateFormField, "isOurCompany">;
type RowSaveState = "clean" | "dirty" | "saving" | "saved" | "error";

interface EditableCandidateRow {
  key: string;
  candidateId: string | null;
  values: CandidateFormValues;
  savedValues: CandidateFormValues | null;
  fieldErrors: CandidateFormFieldErrors;
  saveState: RowSaveState;
}

interface CandidatesManagerProps {
  projectId: string;
  projectName: string;
  candidates: readonly CandidateListItem[];
}

function cloneValues(values: CandidateFormValues): CandidateFormValues {
  return { ...values };
}

function toPersistedRow(candidate: CandidateListItem): EditableCandidateRow {
  const values = cloneValues(candidate);
  return {
    key: candidate.id,
    candidateId: candidate.id,
    values,
    savedValues: cloneValues(values),
    fieldErrors: {},
    saveState: "clean",
  };
}

function rowIsDirty(row: EditableCandidateRow) {
  if (!row.savedValues) {
    return candidateFormHasUserInput(row.values);
  }
  return !candidateFormValuesAreEqual(row.values, row.savedValues);
}

function fieldErrorId(rowKey: string, field: EditableCandidateField) {
  return `candidate-row-${rowKey}-${field}-error`;
}

function safeCsvFilename(projectName: string) {
  const safeName = projectName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return `${safeName || "投标项目"}-候选单位.csv`;
}

export function CandidatesManager({
  projectId,
  projectName,
  candidates,
}: CandidatesManagerProps) {
  const router = useRouter();
  const draftSequence = useRef(0);
  const saveLocks = useRef(new Set<string>());
  const skipBlurForRow = useRef<string | null>(null);
  const [rows, setRows] = useState<EditableCandidateRow[]>(() =>
    candidates.map(toPersistedRow),
  );
  const [latestDraftKey, setLatestDraftKey] = useState<string | null>(null);
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [ourCompanyPendingId, setOurCompanyPendingId] = useState<string | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importPending, setImportPending] = useState(false);

  const persistedCount = rows.filter((row) => row.candidateId !== null).length;
  const deleteTarget = rows.find((row) => row.key === deleteTargetKey) ?? null;

  function addDraftRow() {
    draftSequence.current += 1;
    const key = `draft-${draftSequence.current}`;
    setRows((current) => [
      ...current,
      {
        key,
        candidateId: null,
        values: createEmptyCandidateFormValues(),
        savedValues: null,
        fieldErrors: {},
        saveState: "clean",
      },
    ]);
    setLatestDraftKey(key);
  }

  function updateField(
    rowKey: string,
    field: EditableCandidateField,
    value: string,
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }
        const values = { ...row.values, [field]: value };
        const fieldErrors = { ...row.fieldErrors };
        delete fieldErrors[field];
        const saveState =
          row.savedValues && candidateFormValuesAreEqual(values, row.savedValues)
            ? "clean"
            : "dirty";
        return { ...row, values, fieldErrors, saveState };
      }),
    );
  }

  function updateOurCompanyLocally(rowKey: string) {
    setRows((current) =>
      current.map((row) => {
        const isOurCompany = row.key === rowKey;
        if (row.values.isOurCompany === isOurCompany) {
          return row;
        }
        const values = { ...row.values, isOurCompany };
        return {
          ...row,
          values,
          saveState:
            row.savedValues && candidateFormValuesAreEqual(values, row.savedValues)
              ? "clean"
              : "dirty",
        };
      }),
    );
  }

  function restoreSavedOurCompanyState() {
    setRows((current) =>
      current.map((row) => {
        if (!row.savedValues) {
          return { ...row, values: { ...row.values, isOurCompany: false } };
        }
        const values = {
          ...row.values,
          isOurCompany: row.savedValues.isOurCompany,
        };
        return {
          ...row,
          values,
          saveState: candidateFormValuesAreEqual(values, row.savedValues)
            ? "clean"
            : "dirty",
        };
      }),
    );
  }

  async function saveRow(rowKey: string) {
    const row = rows.find((candidateRow) => candidateRow.key === rowKey);
    if (!row || saveLocks.current.has(rowKey)) {
      return;
    }
    if (!rowIsDirty(row)) {
      return;
    }
    if (row.candidateId === null && !candidateFormHasUserInput(row.values)) {
      return;
    }

    const validation = candidateFormSchema.safeParse(row.values);
    if (!validation.success) {
      const fieldErrors = getCandidateFormFieldErrors(validation.error);
      setRows((current) =>
        current.map((candidateRow) =>
          candidateRow.key === rowKey
            ? { ...candidateRow, fieldErrors, saveState: "error" }
            : candidateRow,
        ),
      );
      toast.error(`第 ${rows.indexOf(row) + 1} 行存在错误，未保存`);
      return;
    }

    saveLocks.current.add(rowKey);
    setRows((current) =>
      current.map((candidateRow) =>
        candidateRow.key === rowKey
          ? { ...candidateRow, fieldErrors: {}, saveState: "saving" }
          : candidateRow,
      ),
    );

    try {
      const formData = toCandidateFormData(validation.data);
      const result =
        row.candidateId === null
          ? await createCandidateAction(projectId, formData)
          : await updateCandidateAction(projectId, row.candidateId, formData);

      if (result.status === "invalid") {
        setRows((current) =>
          current.map((candidateRow) =>
            candidateRow.key === rowKey
              ? {
                  ...candidateRow,
                  fieldErrors: result.fieldErrors,
                  saveState: "error",
                }
              : candidateRow,
          ),
        );
        toast.error(result.message);
        return;
      }
      if (result.status === "conflict") {
        setRows((current) =>
          current.map((candidateRow) =>
            candidateRow.key === rowKey
              ? {
                  ...candidateRow,
                  fieldErrors: { companyName: [result.message] },
                  saveState: "error",
                }
              : candidateRow,
          ),
        );
        toast.error(result.message);
        return;
      }
      if (result.status === "failure" || result.status === "not_found") {
        setRows((current) =>
          current.map((candidateRow) =>
            candidateRow.key === rowKey
              ? { ...candidateRow, saveState: "error" }
              : candidateRow,
          ),
        );
        toast.error(result.message);
        return;
      }

      setRows((current) =>
        current.map((candidateRow) => {
          if (candidateRow.key === rowKey) {
            return {
              ...candidateRow,
              candidateId: result.candidateId,
              values: cloneValues(validation.data),
              savedValues: cloneValues(validation.data),
              fieldErrors: {},
              saveState: "saved",
            };
          }
          if (!validation.data.isOurCompany) {
            return candidateRow;
          }
          const values = { ...candidateRow.values, isOurCompany: false };
          const savedValues = candidateRow.savedValues
            ? { ...candidateRow.savedValues, isOurCompany: false }
            : null;
          return {
            ...candidateRow,
            values,
            savedValues,
            saveState:
              savedValues && !candidateFormValuesAreEqual(values, savedValues)
                ? "dirty"
                : candidateRow.saveState === "error"
                  ? "error"
                  : "clean",
          };
        }),
      );
      toast.success(result.message);
      router.refresh();
    } catch {
      setRows((current) =>
        current.map((candidateRow) =>
          candidateRow.key === rowKey
            ? { ...candidateRow, saveState: "error" }
            : candidateRow,
        ),
      );
      toast.error("候选单位保存失败，编辑内容已保留，请重试");
    } finally {
      saveLocks.current.delete(rowKey);
    }
  }

  function handleRowBlur(
    event: FocusEvent<HTMLTableRowElement>,
    rowKey: string,
  ) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (skipBlurForRow.current === rowKey) {
      skipBlurForRow.current = null;
      return;
    }
    void saveRow(rowKey);
  }

  async function setAsOurCompany(row: EditableCandidateRow) {
    if (row.values.isOurCompany || ourCompanyPendingId !== null) {
      return;
    }
    updateOurCompanyLocally(row.key);
    if (row.candidateId === null) {
      return;
    }

    setOurCompanyPendingId(row.candidateId);
    try {
      const result = await setOurCandidateAction(projectId, row.candidateId);
      if (result.status === "success" || result.status === "unchanged") {
        setRows((current) =>
          current.map((candidateRow) => {
            const isOurCompany = candidateRow.key === row.key;
            const values = { ...candidateRow.values, isOurCompany };
            const savedValues = candidateRow.savedValues
              ? { ...candidateRow.savedValues, isOurCompany }
              : null;
            return {
              ...candidateRow,
              values,
              savedValues,
              saveState:
                savedValues && !candidateFormValuesAreEqual(values, savedValues)
                  ? "dirty"
                  : result.status === "success"
                    ? "saved"
                    : candidateRow.saveState,
            };
          }),
        );
        toast.success(result.message);
        router.refresh();
        return;
      }
      toast.error(result.message);
      restoreSavedOurCompanyState();
    } catch {
      toast.error("设置我方单位失败，请检查网络后重试");
      restoreSavedOurCompanyState();
    } finally {
      setOurCompanyPendingId(null);
    }
  }

  function requestDelete(row: EditableCandidateRow) {
    skipBlurForRow.current = row.key;
    setDeleteTargetKey(row.key);
  }

  async function confirmDelete() {
    if (!deleteTarget || deletePending) {
      return;
    }
    if (deleteTarget.candidateId === null) {
      setRows((current) => {
        const remainingRows = current.filter((row) => row.key !== deleteTarget.key);
        if (!deleteTarget.values.isOurCompany) {
          return remainingRows;
        }
        return remainingRows.map((row) => {
          if (!row.savedValues) {
            return row;
          }
          const values = {
            ...row.values,
            isOurCompany: row.savedValues.isOurCompany,
          };
          return {
            ...row,
            values,
            saveState: candidateFormValuesAreEqual(values, row.savedValues)
              ? "clean"
              : "dirty",
          };
        });
      });
      setDeleteTargetKey(null);
      toast.success("未保存的空白行已删除");
      return;
    }

    setDeletePending(true);
    try {
      const result = await deleteCandidateAction(
        projectId,
        deleteTarget.candidateId,
      );
      if (result.status === "success") {
        setRows((current) => current.filter((row) => row.key !== deleteTarget.key));
        setDeleteTargetKey(null);
        toast.success(result.message);
        router.refresh();
        return;
      }
      toast.error(result.message);
    } catch {
      toast.error("删除候选单位失败，原数据未发生变化");
    } finally {
      setDeletePending(false);
    }
  }

  async function importCandidates(values: readonly CandidateFormValues[]) {
    if (importPending) {
      return false;
    }
    setImportPending(true);
    try {
      const result = await bulkCreateCandidatesAction(projectId, values);
      if (result.status !== "success") {
        toast.error(result.message);
        return false;
      }
      if (result.candidateIds.length !== values.length) {
        toast.error("批量导入返回数量异常，请刷新页面确认结果");
        router.refresh();
        return false;
      }

      const importedRows: EditableCandidateRow[] = [];
      for (const [index, value] of values.entries()) {
        const candidateId = result.candidateIds[index];
        if (!candidateId) {
          toast.error("批量导入返回候选单位标识不完整，请刷新页面");
          router.refresh();
          return false;
        }
        importedRows.push(
          toPersistedRow({ id: candidateId, ...cloneValues(value) }),
        );
      }
      setRows((current) => [...current, ...importedRows]);
      toast.success(result.message);
      router.refresh();
      return true;
    } catch {
      toast.error("批量导入失败，未写入任何候选单位，请稍后重试");
      return false;
    } finally {
      setImportPending(false);
    }
  }

  function exportCsv() {
    const hasUnsavedRows = rows.some(
      (row) => rowIsDirty(row) || row.saveState === "saving" || row.candidateId === null,
    );
    if (hasUnsavedRows) {
      toast.error("请先完成或删除未保存的候选单位行，再导出 CSV");
      return;
    }

    const persistedValues = rows.flatMap((row) =>
      row.candidateId && row.savedValues ? [row.savedValues] : [],
    );
    const blob = new Blob([createCandidateCsv(persistedValues)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeCsvFilename(projectName);
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${persistedValues.length} 家候选单位`);
  }

  function renderFieldError(
    row: EditableCandidateRow,
    field: EditableCandidateField,
  ) {
    const message = row.fieldErrors[field]?.[0];
    return message ? (
      <p
        id={fieldErrorId(row.key, field)}
        className="mt-1 max-w-48 whitespace-normal text-[11px] leading-4 text-destructive"
        role="alert"
      >
        {message}
      </p>
    ) : null;
  }

  function inputProps(
    row: EditableCandidateRow,
    index: number,
    field: EditableCandidateField,
    label: string,
  ) {
    const hasError = Boolean(row.fieldErrors[field]?.length);
    return {
      value: row.values[field],
      "aria-label": `第 ${index + 1} 行${label}`,
      "aria-invalid": hasError,
      "aria-describedby": hasError ? fieldErrorId(row.key, field) : undefined,
      disabled: row.saveState === "saving",
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        updateField(row.key, field, event.target.value),
    };
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Project Candidates"
        title="候选单位设置"
        description={`维护“${projectName}”的投标单位与清标基础输入。`}
      />

      {persistedCount < 5 ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>当前候选单位不足5家，将无法进行 N=5 定标模拟。</p>
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-4 border-b bg-muted/20">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                4
              </span>
              <span>候选单位信息</span>
            </CardTitle>
            <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
              支持新增行、从 Excel 复制粘贴批量导入；单位名称、报价、下浮率、商务优/技术优、同类业绩、其他主客观分均在此录入，清标测算与定标测算自动取用。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={addDraftRow}>
              <Plus />
              新增行
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <Upload />
              批量导入 / 粘贴数据
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
              <Download />
              导出CSV
            </Button>
            <Badge variant="secondary" className="ml-auto">
              共 {persistedCount} 家单位
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          <Table className="text-xs xl:text-sm">
            <TableHeader className="bg-muted/30">
              <TableRow>
                {CANDIDATE_TABLE_COLUMNS.map((column) => (
                  <TableHead
                    key={column}
                    className={cn(
                      "h-9 px-1.5 text-center",
                      column === "序号" && "w-12",
                      column === "单位名称" && "min-w-64 text-left",
                      column === "投标总价（万元）" && "min-w-36",
                      column === "净下浮率" && "min-w-28",
                      (column === "商务优" || column === "技术优") && "w-24",
                      column === "同类业绩" && "min-w-24",
                      column === "其他主客观分" && "min-w-32",
                      column === "操作" && "w-20",
                    )}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={CANDIDATE_TABLE_COLUMNS.length}>
                    <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                      <Building2 className="size-7" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-foreground">暂无候选单位</p>
                        <p className="mt-1 text-xs">点击“新增行”后可直接在表格中录入。</p>
                      </div>
                      <Button type="button" size="sm" onClick={addDraftRow}>
                        <Plus />
                        新增行
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow
                    key={row.key}
                    data-draft={row.candidateId === null ? "true" : "false"}
                    data-save-state={row.saveState}
                    className={cn(
                      "align-top",
                      row.saveState === "error" && "bg-destructive/5",
                    )}
                    onBlurCapture={(event) => handleRowBlur(event, row.key)}
                  >
                    <TableCell className="px-1.5 py-2 text-center text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <Input
                        {...inputProps(row, index, "companyName", "单位名称")}
                        autoFocus={row.key === latestDraftKey}
                        placeholder="请输入完整单位名称"
                        className="min-w-60"
                      />
                      <div className="mt-1 flex min-h-4 items-center gap-1.5">
                        {row.values.isOurCompany ? (
                          <Badge className="h-4 px-1.5 text-[10px]">我方</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={ourCompanyPendingId !== null}
                            className="h-4 px-1 text-[10px] text-muted-foreground"
                            aria-label={`设为我方 ${row.values.companyName || `第 ${index + 1} 行`}`}
                            onClick={() => void setAsOurCompany(row)}
                          >
                            {ourCompanyPendingId === row.candidateId ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <ShieldCheck />
                            )}
                            设为我方
                          </Button>
                        )}
                        <span
                          className={cn(
                            "text-[10px]",
                            row.saveState === "error"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                          aria-live="polite"
                        >
                          {row.saveState === "dirty" && "待保存"}
                          {row.saveState === "saving" && "保存中…"}
                          {row.saveState === "saved" && "已保存"}
                          {row.saveState === "error" && "保存失败"}
                          {row.saveState === "clean" && row.candidateId === null && "本地草稿"}
                        </span>
                      </div>
                      {renderFieldError(row, "companyName")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <Input
                        {...inputProps(row, index, "bidPrice", "投标总价")}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        className="text-right tabular-nums"
                      />
                      {renderFieldError(row, "bidPrice")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <Input
                        {...inputProps(row, index, "netDiscountRate", "净下浮率")}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        max="100"
                        placeholder="17.8"
                        title="输入17.8表示17.8%"
                        className="text-right tabular-nums"
                      />
                      {renderFieldError(row, "netDiscountRate")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <select
                        value={row.values.trademarkScore}
                        aria-label={`第 ${index + 1} 行商务优`}
                        disabled={row.saveState === "saving"}
                        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        onChange={(event) =>
                          updateField(row.key, "trademarkScore", event.target.value)
                        }
                      >
                        <option value="0">无</option>
                        <option value="1">有</option>
                      </select>
                      {renderFieldError(row, "trademarkScore")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <select
                        value={row.values.technicalScore}
                        aria-label={`第 ${index + 1} 行技术优`}
                        disabled={row.saveState === "saving"}
                        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        onChange={(event) =>
                          updateField(row.key, "technicalScore", event.target.value)
                        }
                      >
                        <option value="0">无</option>
                        <option value="1">有</option>
                      </select>
                      {renderFieldError(row, "technicalScore")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <Input
                        {...inputProps(row, index, "similarExperienceScore", "同类业绩")}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="text-right tabular-nums"
                      />
                      {renderFieldError(row, "similarExperienceScore")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 align-top">
                      <Input
                        {...inputProps(row, index, "otherScore", "其他主客观分")}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="text-right tabular-nums"
                      />
                      {renderFieldError(row, "otherScore")}
                    </TableCell>
                    <TableCell className="px-1.5 py-1.5 text-center align-top">
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        disabled={deletePending || row.saveState === "saving"}
                        aria-label={`删除 ${row.values.companyName || `第 ${index + 1} 行`}`}
                        onClick={() => requestDelete(row)}
                      >
                        <Trash2 />
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CandidateImportDialog
        open={importOpen}
        pending={importPending}
        onOpenChange={setImportOpen}
        onConfirm={importCandidates}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除候选单位"
        description={
          deleteTarget?.candidateId
            ? `确定删除“${deleteTarget.values.companyName}”吗？相关测算结果将失效，该操作无法撤销。`
            : "确定删除这条尚未保存的候选单位草稿吗？"
        }
        confirmLabel="确认删除"
        pendingLabel="正在删除"
        destructive
        pending={deletePending}
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setDeleteTargetKey(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Settings2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/layout/error-state";
import { LoadingState } from "@/components/layout/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ExcelImportMapping } from "@/domain/imports";
import {
  confirmExcelImportResponseSchema,
  type ExcelImportPreviewView,
  importErrorResponseSchema,
  previewExcelImportResponseSchema,
} from "@/features/imports/excel-import-response-schema";
import { formatMoney, formatScore } from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import { PROJECT_TYPE_LABELS as projectTypeLabels } from "@/lib/project-type-labels";
import { cn } from "@/lib/utils";

const workflowSteps = [
  "上传文件",
  "解析",
  "字段映射",
  "数据预览",
  "错误检查",
  "确认写入",
] as const;

const sectionLabels = {
  project: "项目参数",
  candidate: "候选单位",
  performance: "履约数据",
} as const;

type ImportSuccess = {
  projectId: string;
  candidateCount: number;
  performanceRecordCount: number;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Workflow({
  hasFile,
  hasPreview,
  canImport,
  imported,
}: {
  hasFile: boolean;
  hasPreview: boolean;
  canImport: boolean;
  imported: boolean;
}) {
  const completedThrough = imported ? 5 : hasPreview ? 4 : hasFile ? 0 : -1;
  const activeIndex = imported ? -1 : hasPreview && canImport ? 5 : hasPreview ? 4 : hasFile ? 1 : 0;

  return (
    <Card size="sm">
      <CardContent className="overflow-x-auto">
        <ol className="flex min-w-180 items-center" aria-label="Excel导入流程">
          {workflowSteps.map((step, index) => {
            const completed = index <= completedThrough;
            const active = index === activeIndex;
            return (
              <li key={step} className="flex flex-1 items-center last:flex-none">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                      completed && "border-emerald-600 bg-emerald-600 text-white",
                      active && !completed && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {completed ? <CheckCircle2 className="size-4" /> : index + 1}
                  </span>
                  <span className={cn("text-xs", active && "font-semibold text-primary")}>{step}</span>
                </div>
                {index < workflowSteps.length - 1 ? (
                  <div className="mx-3 h-px min-w-6 flex-1 bg-border" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function MappingPanel({
  preview,
  mapping,
  disabled,
  dirty,
  onMappingChange,
  onApply,
}: {
  preview: ExcelImportPreviewView;
  mapping: ExcelImportMapping;
  disabled: boolean;
  dirty: boolean;
  onMappingChange: (field: keyof ExcelImportMapping, value: string) => void;
  onApply: () => void;
}) {
  const selectors = [
    ["projectSheetName", "项目参数工作表"],
    ["candidateSheetName", "候选单位工作表"],
    ["performanceSheetName", "履约数据工作表"],
  ] as const;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>字段映射</CardTitle>
        <CardDescription>
          可调整三个数据区域对应的工作表；应用后系统会重新识别字段并生成新预览。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {selectors.map(([field, label]) => (
            <div key={field} className="space-y-2">
              <Label>{label}</Label>
              <Select
                value={mapping[field]}
                disabled={disabled}
                onValueChange={(value) => onMappingChange(field, value)}
              >
                <SelectTrigger className="w-full" aria-label={label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {preview.workbookSheets.map((sheetName) => (
                    <SelectItem key={sheetName} value={sheetName}>
                      {sheetName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={!dirty || disabled} onClick={onApply}>
            {disabled ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            应用字段映射并重新解析
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-170">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">数据区域</TableHead>
                <TableHead>系统字段</TableHead>
                <TableHead>Excel来源</TableHead>
                <TableHead className="pr-4 text-center">识别状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.fieldMappings.map((item) => (
                <TableRow key={`${item.section}-${item.targetField}`}>
                  <TableCell className="pl-4">
                    {sectionLabels[item.section]}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.targetLabel}
                    {item.required ? <span className="ml-1 text-destructive">*</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.sourceSheet && item.sourceLocation
                      ? `${item.sourceSheet} · ${item.sourceLocation}${item.sourceLabel ? ` · ${item.sourceLabel}` : ""}`
                      : "未识别"}
                  </TableCell>
                  <TableCell className="pr-4 text-center">
                    {item.detected ? (
                      <Badge className="bg-emerald-600">已映射</Badge>
                    ) : (
                      <Badge variant="destructive">缺失</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectPreview({ preview }: { preview: ExcelImportPreviewView }) {
  const project = preview.project;
  if (!project) {
    return <p className="p-4 text-sm text-muted-foreground">项目参数未通过解析。</p>;
  }
  const rows = [
    ["项目名称", project.name],
    ["最高投标限价", formatMoney(project.maxBidPrice)],
    ["不可竞争费", formatMoney(project.nonCompetitiveFee)],
    ["项目类型", project.projectTypes.map((type) => projectTypeLabels[type]).join("、")],
    ["总投标报价分值", project.totalBidPriceScore],
    ["排名递减扣分值", project.rankDeduction],
    ["定标抽值1", formatPercentageFraction(project.finalDrawValue1)],
    ["定标抽值2", formatPercentageFraction(project.finalDrawValue2)],
    ["定标抽值3", formatPercentageFraction(project.finalDrawValue3)],
  ];
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

function CandidatePreview({ preview }: { preview: ExcelImportPreviewView }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-230">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Excel行</TableHead>
            <TableHead>单位名称</TableHead>
            <TableHead className="text-right">投标总价</TableHead>
            <TableHead className="text-right">净下浮率</TableHead>
            <TableHead className="text-right">商务优</TableHead>
            <TableHead className="text-right">技术优</TableHead>
            <TableHead className="text-right">同类业绩</TableHead>
            <TableHead className="pr-4 text-right">其他主客观分</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.candidates.map((candidate) => (
            <TableRow key={`${candidate.sourceRow}-${candidate.companyName}`}>
              <TableCell className="pl-4 tabular-nums">{candidate.sourceRow}</TableCell>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {candidate.companyName}
                  {candidate.isOurCompany ? <Badge>我方</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(candidate.bidPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercentageFraction(candidate.netDiscountRate)}
              </TableCell>
              <TableCell className="text-right">{formatScore(candidate.trademarkScore)}</TableCell>
              <TableCell className="text-right">{formatScore(candidate.technicalScore)}</TableCell>
              <TableCell className="text-right">{formatScore(candidate.similarExperienceScore)}</TableCell>
              <TableCell className="pr-4 text-right">{formatScore(candidate.otherScore)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.counts.candidates > preview.candidates.length ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          当前展示前 {preview.candidates.length} 条，共 {preview.counts.candidates} 条候选单位。
        </p>
      ) : null}
    </div>
  );
}

function PerformancePreview({ preview }: { preview: ExcelImportPreviewView }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-190">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Excel位置</TableHead>
            <TableHead>单位名称</TableHead>
            <TableHead>项目类型</TableHead>
            <TableHead>分类分级等级</TableHead>
            <TableHead>季度</TableHead>
            <TableHead className="pr-4 text-right">评分</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.performanceRecords.map((record) => (
            <TableRow key={`${record.sourceColumn}-${record.companyName}-${record.year}-${record.quarter}`}>
              <TableCell className="pl-4 tabular-nums">{record.sourceColumn}</TableCell>
              <TableCell className="font-medium">{record.companyName}</TableCell>
              <TableCell>{projectTypeLabels[record.projectType]}</TableCell>
              <TableCell>{record.classificationLevel}</TableCell>
              <TableCell className="tabular-nums">
                {record.year} Q{record.quarter}
              </TableCell>
              <TableCell className="pr-4 text-right tabular-nums">
                {formatScore(record.score)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.counts.performanceRecords > preview.performanceRecords.length ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          当前展示前 {preview.performanceRecords.length} 条，共 {preview.counts.performanceRecords} 条季度履约记录。
        </p>
      ) : null}
    </div>
  );
}

function DataPreview({ preview }: { preview: ExcelImportPreviewView }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>数据预览</CardTitle>
        <CardDescription>
          项目参数、候选单位和季度履约数据均为写入前预览；清标、定标旧结果不会出现在此处。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="project">
          <TabsList>
            <TabsTrigger value="project">
              <Settings2 />
              项目参数
            </TabsTrigger>
            <TabsTrigger value="candidate">
              <Users />
              候选单位 {preview.counts.candidates}
            </TabsTrigger>
            <TabsTrigger value="performance">
              <Database />
              履约数据 {preview.counts.performanceRecords}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="project" className="mt-3 rounded-xl border">
            <ProjectPreview preview={preview} />
          </TabsContent>
          <TabsContent value="candidate" className="mt-3 rounded-xl border">
            <CandidatePreview preview={preview} />
          </TabsContent>
          <TabsContent value="performance" className="mt-3 rounded-xl border">
            <PerformancePreview preview={preview} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function IssuePanel({ preview }: { preview: ExcelImportPreviewView }) {
  const errors = preview.issues.filter((item) => item.severity === "error");
  const warnings = preview.issues.filter((item) => item.severity === "warning");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>错误检查</CardTitle>
        <CardDescription>
          {errors.length > 0
            ? `发现 ${errors.length} 个错误，修正 Excel 后重新解析才能确认导入。`
            : "必要字段和数据格式已通过检查。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">可以确认导入</p>
              <p className="mt-1 text-sm">写入将在单个数据库事务中执行，失败时不会保留部分数据。</p>
            </div>
          </div>
        ) : null}
        {[...errors, ...warnings].map((item, index) => {
          const location = [
            item.sheetName ? `工作表：${item.sheetName}` : null,
            item.rowNumber ? `第${item.rowNumber}行` : null,
            item.columnName ? `单元格：${item.columnName}` : null,
          ]
            .filter((value) => value !== null)
            .join(" · ");
          return (
            <div
              key={`${item.severity}-${item.sheetName}-${item.rowNumber}-${item.columnName}-${index}`}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                item.severity === "error"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-amber-200 bg-amber-50 text-amber-950",
              )}
            >
              {item.severity === "error" ? (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              ) : (
                <FileSpreadsheet className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">{item.message}</p>
                {location ? <p className="mt-1 text-xs opacity-75">{location}</p> : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ExcelImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelImportPreviewView | null>(null);
  const [mapping, setMapping] = useState<ExcelImportMapping | null>(null);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [success, setSuccess] = useState<ImportSuccess | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestLock = useRef<"preview" | "import" | null>(null);

  async function readError(response: Response) {
    const payload: unknown = await response.json();
    const result = importErrorResponseSchema.safeParse(payload);
    return result.success ? result.data.message : "请求失败，请稍后重试。";
  }

  async function generatePreview(appliedMapping?: ExcelImportMapping) {
    if (!file || requestLock.current !== null || isParsing || isImporting) {
      return;
    }
    requestLock.current = "preview";
    setIsParsing(true);
    setSuccess(null);
    setRequestError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (appliedMapping) {
        formData.set("mapping", JSON.stringify(appliedMapping));
      }
      const response = await fetch("/api/imports/excel/preview", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await readError(response);
        setRequestError(message);
        toast.error(message);
        return;
      }
      const payload: unknown = await response.json();
      const parsed = previewExcelImportResponseSchema.safeParse(payload);
      if (!parsed.success) {
        const message = "预览响应格式无效，请重试。";
        setRequestError(message);
        toast.error(message);
        return;
      }
      if (parsed.data.status === "invalid_workbook") {
        setRequestError(parsed.data.message);
        toast.error(parsed.data.message);
        return;
      }
      setPreview(parsed.data.preview);
      setMapping(parsed.data.preview.mapping);
      setMappingDirty(false);
      setRequestError(null);
      toast.success("Excel 解析完成，请检查字段映射和数据预览。 ");
    } catch {
      const message = "Excel 解析请求失败，请检查网络后重试。";
      setRequestError(message);
      toast.error(message);
    } finally {
      requestLock.current = null;
      setIsParsing(false);
    }
  }

  async function confirmImport() {
    if (
      !file ||
      !preview ||
      !mapping ||
      !preview.canImport ||
      mappingDirty ||
      requestLock.current !== null ||
      isImporting
    ) {
      return;
    }
    requestLock.current = "import";
    setIsImporting(true);
    setRequestError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mapping", JSON.stringify(mapping));
      formData.set("previewDigest", preview.previewDigest);
      const response = await fetch("/api/imports/excel/confirm", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await readError(response);
        setRequestError(message);
        toast.error(message);
        return;
      }
      const payload: unknown = await response.json();
      const parsed = confirmExcelImportResponseSchema.safeParse(payload);
      if (!parsed.success) {
        const message = "导入响应格式无效，请重新预览后重试。";
        setRequestError(message);
        toast.error(message);
        return;
      }
      if (parsed.data.status === "imported") {
        setSuccess(parsed.data);
        setRequestError(null);
        toast.success("Excel 数据已通过事务成功导入。");
        return;
      }
      if (parsed.data.status === "validation_error") {
        setPreview(parsed.data.preview);
        setMapping(parsed.data.preview.mapping);
        setMappingDirty(false);
        setRequestError(null);
        toast.error("数据状态已变化，请根据最新错误重新检查。");
        return;
      }
      setRequestError(parsed.data.message);
      toast.error(parsed.data.message);
    } catch {
      const message = "确认导入请求失败，数据库未写入任何数据。";
      setRequestError(message);
      toast.error(message);
    } finally {
      requestLock.current = null;
      setIsImporting(false);
    }
  }

  function updateMapping(field: keyof ExcelImportMapping, value: string) {
    setMapping((current) => (current ? { ...current, [field]: value } : current));
    setMappingDirty(true);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setMappingDirty(false);
    setSuccess(null);
    setRequestError(null);
  }

  return (
    <div className="space-y-6">
      <Workflow
        hasFile={file !== null}
        hasPreview={preview !== null}
        canImport={preview?.canImport ?? false}
        imported={success !== null}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>上传工作簿</CardTitle>
          <CardDescription>
            文件不会在上传后直接写入数据库。单个文件最大10MB，仅支持 .xlsx。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="excel-import-file">选择 Excel 文件</Label>
              <Input
                id="excel-import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={isParsing || isImporting}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setPreview(null);
                  setMapping(null);
                  setMappingDirty(false);
                  setSuccess(null);
                  setRequestError(null);
                }}
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatFileSize(file.size)}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              disabled={!file || isParsing || isImporting}
              onClick={() => generatePreview()}
            >
              {isParsing ? <Loader2 className="animate-spin" /> : <Upload />}
              {isParsing ? "正在解析" : "解析并生成预览"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isParsing ? <LoadingState label="正在解析 Excel，请稍候…" /> : null}

      {requestError ? (
        <ErrorState
          title="Excel 导入失败"
          description={requestError}
          action={
            file ? (
              <Button
                type="button"
                variant="outline"
                disabled={isParsing || isImporting}
                onClick={() => generatePreview(mapping ?? undefined)}
              >
                重新解析
              </Button>
            ) : null
          }
        />
      ) : null}

      {preview && mapping ? (
        <>
          <MappingPanel
            preview={preview}
            mapping={mapping}
            disabled={isParsing || isImporting}
            dirty={mappingDirty}
            onMappingChange={updateMapping}
            onApply={() => generatePreview(mapping)}
          />
          <DataPreview preview={preview} />
          <IssuePanel preview={preview} />

          <Card>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">确认写入数据库</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  将创建1个新项目、{preview.counts.candidates}家候选单位和
                  {preview.counts.performanceRecords}条季度履约记录。
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                disabled={!preview.canImport || mappingDirty || isImporting || isParsing}
                onClick={confirmImport}
              >
                {isImporting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {isImporting ? "事务写入中" : "确认导入"}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="size-5" />
              导入完成
            </CardTitle>
            <CardDescription className="text-emerald-800">
              已导入 {success.candidateCount} 家候选单位和 {success.performanceRecordCount} 条季度履约记录。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/projects/${success.projectId}/settings`}>
                查看项目参数
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${success.projectId}/candidates`}>查看候选单位</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${success.projectId}/performance`}>
                查看履约信息
              </Link>
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              继续导入其他文件
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

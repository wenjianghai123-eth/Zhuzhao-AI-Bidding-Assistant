"use client";

import { type FormEvent, useRef, useState, useTransition } from "react";
import Decimal from "decimal.js";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createPerformanceAction,
  updatePerformanceAction,
} from "@/app/(dashboard)/performance/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectPerformanceCandidate } from "@/domain/performance/company-performance";
import { isProjectTypeValue } from "@/domain/projects/project-settings";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import { PERFORMANCE_QUARTER_OPTIONS } from "@/features/performance/performance-filter-schema";
import {
  createEmptyPerformanceFormValues,
  getPerformanceFormFieldErrors,
  performanceFormSchema,
  PERFORMANCE_PROJECT_TYPE_OPTIONS,
  readPerformanceFormData,
  type PerformanceFormField,
  type PerformanceFormFieldErrors,
  type PerformanceFormValues,
  type PerformanceListItem,
} from "@/features/performance/performance-form-schema";
import { cn } from "@/lib/utils";

type TextPerformanceFormField = Exclude<
  PerformanceFormField,
  "candidateId" | "projectType" | "quarter"
>;

type PerformanceDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectId: string;
  candidates: readonly ProjectPerformanceCandidate[];
  projectTypes: readonly ProjectTypeValue[];
} &
  (
    | { mode: "create" }
    | {
        mode: "edit";
        record: PerformanceListItem;
      }
  );

function isQuarterValue(value: string): value is "1" | "2" | "3" | "4" {
  return value === "1" || value === "2" || value === "3" || value === "4";
}

function decimalInputIsEqual(left: string, right: string) {
  try {
    return new Decimal(left).equals(new Decimal(right));
  } catch {
    return left === right;
  }
}

function valuesAreEqual(
  left: PerformanceFormValues,
  right: PerformanceFormValues,
) {
  return (
    left.candidateId === right.candidateId &&
    left.projectType === right.projectType &&
    left.classificationLevel.trim() === right.classificationLevel.trim() &&
    left.year === right.year &&
    left.quarter === right.quarter &&
    decimalInputIsEqual(left.score, right.score)
  );
}

function FieldError({
  field,
  errors,
}: {
  field: PerformanceFormField;
  errors: PerformanceFormFieldErrors;
}) {
  const messages = errors[field];
  if (!messages?.length) {
    return null;
  }

  return (
    <p
      id={`performance-${field}-error`}
      className="text-xs leading-5 text-destructive"
      role="alert"
    >
      {messages[0]}
    </p>
  );
}

export function PerformanceDialog(props: PerformanceDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const initialValues =
    props.mode === "create"
      ? createEmptyPerformanceFormValues(
          props.candidates[0]?.id ?? "",
          props.projectTypes[0] ?? "CURTAIN_WALL",
        )
      : { ...props.record };
  const [values, setValues] = useState<PerformanceFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<PerformanceFormFieldErrors>({});
  const isDirty =
    props.mode === "create" || !valuesAreEqual(values, initialValues);

  function clearFieldError(field: PerformanceFormField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateTextField(field: TextPerformanceFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || isPending || !isDirty) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const validation = performanceFormSchema.safeParse(
      readPerformanceFormData(formData),
    );

    if (!validation.success) {
      setFieldErrors(getPerformanceFormFieldErrors(validation.error));
      toast.error("请检查履约记录表单中的错误");
      return;
    }

    setFieldErrors({});
    submissionLock.current = true;
    startTransition(async () => {
      try {
        const result =
          props.mode === "create"
            ? await createPerformanceAction(props.projectId, formData)
            : await updatePerformanceAction(
                props.projectId,
                props.record.id,
                formData,
              );

        if (result.status === "invalid") {
          setFieldErrors(result.fieldErrors);
          toast.error(result.message);
          return;
        }
        if (result.status === "conflict") {
          toast.error(result.message);
          return;
        }
        if (result.status === "failure" || result.status === "not_found") {
          toast.error(result.message);
          return;
        }

        if (result.status === "unchanged") {
          toast.info(result.message);
        } else {
          toast.success(result.message);
        }
        props.onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("履约记录保存失败，请检查网络后重试");
      } finally {
        submissionLock.current = false;
      }
    });
  }

  function textInput(
    field: TextPerformanceFormField,
    label: string,
    options?: { placeholder?: string; inputMode?: "numeric" | "decimal" },
  ) {
    const hasError = Boolean(fieldErrors[field]?.length);
    return (
      <div className="space-y-2">
        <Label htmlFor={`performance-${field}`}>{label}</Label>
        <Input
          id={`performance-${field}`}
          name={field}
          value={values[field]}
          placeholder={options?.placeholder}
          inputMode={options?.inputMode}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `performance-${field}-error` : undefined
          }
          onChange={(event) => updateTextField(field, event.target.value)}
        />
        <FieldError field={field} errors={fieldErrors} />
      </div>
    );
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!isPending) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form className="grid gap-4" noValidate onSubmit={submitForm}>
          <DialogHeader>
            <DialogTitle>
              {props.mode === "create" ? "新增履约记录" : "编辑履约记录"}
            </DialogTitle>
            <DialogDescription>
              每条记录对应一个单位、项目类型及自然季度。
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={isPending}>
            <div className="sm:col-span-2">
              <div className="space-y-2">
                <Label htmlFor="performance-candidateId">履约单位</Label>
                <Select
                  name="candidateId"
                  value={values.candidateId}
                  onValueChange={(candidateId) => {
                    setValues((current) => ({ ...current, candidateId }));
                    clearFieldError("candidateId");
                  }}
                >
                  <SelectTrigger
                    id="performance-candidateId"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.candidateId)}
                    aria-describedby={
                      fieldErrors.candidateId
                        ? "performance-candidateId-error"
                        : undefined
                    }
                  >
                    <SelectValue placeholder="请选择当前项目候选单位" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.candidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError field="candidateId" errors={fieldErrors} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="performance-projectType">项目类型</Label>
              <Select
                name="projectType"
                value={values.projectType}
                onValueChange={(value) => {
                  if (isProjectTypeValue(value)) {
                    setValues((current) => ({
                      ...current,
                      projectType: value,
                    }));
                    clearFieldError("projectType");
                  }
                }}
              >
                <SelectTrigger
                  id="performance-projectType"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.projectType)}
                  aria-describedby={
                    fieldErrors.projectType
                      ? "performance-projectType-error"
                      : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_PROJECT_TYPE_OPTIONS.filter((option) =>
                    props.projectTypes.includes(option.value),
                  ).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError field="projectType" errors={fieldErrors} />
            </div>

            {textInput("classificationLevel", "分类分级等级", {
              placeholder: "例如：A",
            })}
            {textInput("year", "年份", {
              placeholder: "例如：2026",
              inputMode: "numeric",
            })}

            <div className="space-y-2">
              <Label htmlFor="performance-quarter">季度</Label>
              <Select
                name="quarter"
                value={values.quarter}
                onValueChange={(value) => {
                  if (isQuarterValue(value)) {
                    setValues((current) => ({ ...current, quarter: value }));
                    clearFieldError("quarter");
                  }
                }}
              >
                <SelectTrigger
                  id="performance-quarter"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.quarter)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_QUARTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value.toString()}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError field="quarter" errors={fieldErrors} />
            </div>

            <div className={cn("sm:col-span-2")}>
              {textInput("score", "季度评分", {
                placeholder: "0.00",
                inputMode: "decimal",
              })}
            </div>
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => props.onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!isDirty || isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {isPending ? "正在保存" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

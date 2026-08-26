"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2, Save } from "lucide-react";
import Decimal from "decimal.js";
import { toast } from "sonner";

import {
  createProjectAction,
  updateProjectTypesAction,
  updateProjectSettingsAction,
} from "@/app/(dashboard)/projects/actions";
import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ProjectTypeEditState,
  ProjectTypeLockReason,
} from "@/domain/projects/project-type-edit-policy";
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  getProjectFormFieldErrors,
  PROJECT_TYPE_OPTIONS,
  projectTypesFormSchema,
  projectSettingsFormSchema,
  readProjectSettingsFormData,
  updateProjectTypeSelection,
  type ProjectFormField,
  type ProjectFormFieldErrors,
  type ProjectSettingsFormValues,
} from "@/features/projects/project-settings-form-schema";
import { cn } from "@/lib/utils";

type TextProjectFormField = Exclude<ProjectFormField, "projectTypes">;

type ProjectSettingsFormProps = {
  initialValues: ProjectSettingsFormValues;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      projectId: string;
      projectTypeEditState: ProjectTypeEditState;
    }
);

const PROJECT_TYPE_LOCK_REASON_LABELS: Record<
  ProjectTypeLockReason,
  string
> = {
  PERFORMANCE_DATA: "履约信息",
  QINGBIAO_DATA: "清标结果",
  DINGBIAO_DATA: "定标结果",
  ANALYSIS_DATA: "决策分析结果",
};

function cloneValues(
  values: ProjectSettingsFormValues,
): ProjectSettingsFormValues {
  return { ...values, projectTypes: [...values.projectTypes] };
}

function valuesAreEqual(
  left: ProjectSettingsFormValues,
  right: ProjectSettingsFormValues,
) {
  function decimalInputIsEqual(leftValue: string, rightValue: string) {
    try {
      return new Decimal(leftValue).equals(new Decimal(rightValue));
    } catch {
      return leftValue === rightValue;
    }
  }

  return (
    left.name.trim() === right.name.trim() &&
    decimalInputIsEqual(left.maxBidPrice, right.maxBidPrice) &&
    decimalInputIsEqual(left.nonCompetitiveFee, right.nonCompetitiveFee) &&
    decimalInputIsEqual(
      left.qingbiaoDrawValue1,
      right.qingbiaoDrawValue1,
    ) &&
    decimalInputIsEqual(
      left.qingbiaoDrawValue2,
      right.qingbiaoDrawValue2,
    ) &&
    decimalInputIsEqual(
      left.qingbiaoDrawValue3,
      right.qingbiaoDrawValue3,
    ) &&
    decimalInputIsEqual(
      left.qingbiaoDrawValue4,
      right.qingbiaoDrawValue4,
    ) &&
    decimalInputIsEqual(left.totalBidPriceScore, right.totalBidPriceScore) &&
    decimalInputIsEqual(
      left.similarExperienceScore,
      right.similarExperienceScore,
    ) &&
    decimalInputIsEqual(left.otherScore, right.otherScore) &&
    decimalInputIsEqual(left.rankDeduction, right.rankDeduction) &&
    decimalInputIsEqual(left.finalDrawValue1, right.finalDrawValue1) &&
    decimalInputIsEqual(left.finalDrawValue2, right.finalDrawValue2) &&
    decimalInputIsEqual(left.finalDrawValue3, right.finalDrawValue3) &&
    left.projectTypes.length === right.projectTypes.length &&
    left.projectTypes.every((projectType) =>
      right.projectTypes.includes(projectType),
    )
  );
}

function projectTypeValuesAreEqual(
  left: readonly ProjectTypeValue[],
  right: readonly ProjectTypeValue[],
) {
  return (
    left.length === right.length &&
    left.every((projectType) => right.includes(projectType))
  );
}

function FieldError({
  field,
  errors,
}: {
  field: ProjectFormField;
  errors: ProjectFormFieldErrors;
}) {
  const messages = errors[field];

  if (!messages?.length) {
    return null;
  }

  return (
    <p
      id={`${field}-error`}
      className="text-xs leading-5 text-destructive"
      role="alert"
    >
      {messages[0]}
    </p>
  );
}

function InputSuffix({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
      {children}
    </span>
  );
}

export function ProjectSettingsForm(props: ProjectSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const initiallyLocked =
    props.mode === "edit" && props.projectTypeEditState.locked;
  const [values, setValues] = useState<ProjectSettingsFormValues>(() =>
    cloneValues(props.initialValues),
  );
  const [savedValues, setSavedValues] = useState<ProjectSettingsFormValues>(() =>
    cloneValues(props.initialValues),
  );
  const [fieldErrors, setFieldErrors] = useState<ProjectFormFieldErrors>({});
  const [projectTypeConfirmOpen, setProjectTypeConfirmOpen] = useState(false);
  const [projectTypeEditMode, setProjectTypeEditMode] = useState(
    () => !initiallyLocked,
  );
  const isDirty = !valuesAreEqual(values, savedValues);
  const projectTypesDirty = !projectTypeValuesAreEqual(
    values.projectTypes,
    savedValues.projectTypes,
  );
  const isExplicitProjectTypeEdit = initiallyLocked && projectTypeEditMode;
  const projectTypesLocked = initiallyLocked && !projectTypeEditMode;

  function clearFieldError(field: ProjectFormField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateTextField(field: TextProjectFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function updateProjectType(projectType: ProjectTypeValue, checked: boolean) {
    setValues((current) => ({
      ...current,
      projectTypes: updateProjectTypeSelection(
        current.projectTypes,
        projectType,
        checked,
      ),
    }));
    clearFieldError("projectTypes");
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      submissionLock.current ||
      isPending ||
      !isDirty ||
      isExplicitProjectTypeEdit
    ) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const clientValidation = projectSettingsFormSchema.safeParse(
      readProjectSettingsFormData(formData),
    );

    if (!clientValidation.success) {
      setFieldErrors(getProjectFormFieldErrors(clientValidation.error));
      toast.error("请检查表单中的错误");
      return;
    }

    setFieldErrors({});
    submissionLock.current = true;
    startTransition(async () => {
      try {
        const result =
          props.mode === "create"
            ? await createProjectAction(formData)
            : await updateProjectSettingsAction(props.projectId, formData);

        if (result.status === "invalid") {
          setFieldErrors(result.fieldErrors);
          toast.error(result.message);
          return;
        }

        if (
          result.status === "failure" ||
          result.status === "not_found" ||
          result.status === "confirmation_required"
        ) {
          toast.error(result.message);
          return;
        }

        const savedValues = cloneValues(clientValidation.data);
        setValues(savedValues);
        setSavedValues(savedValues);

        if (result.status === "unchanged") {
          toast.info(result.message);
          return;
        }

        toast.success(result.message);

        if (props.mode === "create") {
          router.push(`/projects/${result.projectId}/settings`);
          return;
        }

        router.refresh();
      } catch {
        toast.error("项目参数保存失败，请检查网络后重试");
      } finally {
        submissionLock.current = false;
      }
    });
  }

  function cancelProjectTypeEdit() {
    setValues((current) => ({
      ...current,
      projectTypes: [...savedValues.projectTypes],
    }));
    clearFieldError("projectTypes");
    setProjectTypeEditMode(false);
  }

  function saveProjectTypes() {
    if (
      props.mode !== "edit" ||
      submissionLock.current ||
      isPending ||
      !projectTypesDirty
    ) {
      return;
    }

    const validation = projectTypesFormSchema.safeParse({
      projectTypes: values.projectTypes,
    });
    if (!validation.success) {
      setFieldErrors(getProjectFormFieldErrors(validation.error));
      toast.error("请检查项目类型设置");
      return;
    }

    const formData = new FormData();
    for (const projectType of validation.data.projectTypes) {
      formData.append("projectTypes", projectType);
    }

    setFieldErrors({});
    submissionLock.current = true;
    startTransition(async () => {
      try {
        const result = await updateProjectTypesAction(props.projectId, formData);
        if (result.status === "invalid") {
          setFieldErrors(result.fieldErrors);
          toast.error(result.message);
          return;
        }
        if (
          result.status === "failure" ||
          result.status === "not_found" ||
          result.status === "confirmation_required"
        ) {
          toast.error(result.message);
          return;
        }

        const savedProjectTypes = [...validation.data.projectTypes];
        setValues((current) => ({
          ...current,
          projectTypes: savedProjectTypes,
        }));
        setSavedValues((current) => ({
          ...current,
          projectTypes: savedProjectTypes,
        }));
        setProjectTypeEditMode(false);
        if (result.status === "unchanged") {
          toast.info(result.message);
        } else {
          toast.success(result.message);
        }
        router.refresh();
      } catch {
        toast.error("项目类型保存失败，请检查网络后重试");
      } finally {
        submissionLock.current = false;
      }
    });
  }

  function textInput(
    field: TextProjectFormField,
    label: string,
    options?: {
      inputMode?: "decimal";
      placeholder?: string;
      suffix?: string;
      className?: string;
    },
  ) {
    const hasError = Boolean(fieldErrors[field]?.length);

    return (
      <div className={cn("space-y-2", options?.className)}>
        <Label htmlFor={field}>{label}</Label>
        <div className="relative">
          <Input
            id={field}
            name={field}
            value={values[field]}
            inputMode={options?.inputMode}
            placeholder={options?.placeholder}
            className={options?.suffix ? "pr-14" : undefined}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${field}-error` : undefined}
            onChange={(event) => updateTextField(field, event.target.value)}
          />
          {options?.suffix ? (
            <InputSuffix>{options.suffix}</InputSuffix>
          ) : null}
        </div>
        <FieldError field={field} errors={fieldErrors} />
      </div>
    );
  }

  return (
    <>
      <form className="space-y-6" noValidate onSubmit={submitForm}>
      <fieldset className="contents" disabled={isPending}>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>1 · 项目基本信息</CardTitle>
            <CardDescription>
              金额统一按万元录入，项目类型可以多选。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {textInput("name", "项目名称", {
              placeholder: "请输入项目完整名称",
              className: "sm:col-span-2",
            })}
            {textInput("maxBidPrice", "最高投标限价", {
              inputMode: "decimal",
              placeholder: "0.00",
              suffix: "万元",
            })}
            {textInput("nonCompetitiveFee", "不可竞争费", {
              inputMode: "decimal",
              placeholder: "0.00",
              suffix: "万元",
            })}
            <div className="space-y-3 sm:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label>项目类型</Label>
                  {initiallyLocked ? (
                    <p className="text-xs text-muted-foreground">
                      已存在
                      {props.mode === "edit"
                        ? props.projectTypeEditState.reasons
                            .map(
                              (reason) =>
                                PROJECT_TYPE_LOCK_REASON_LABELS[reason],
                            )
                            .join("、")
                        : "依赖业务数据"}
                      ，项目类型默认锁定。
                    </p>
                  ) : null}
                </div>
                {projectTypesLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProjectTypeConfirmOpen(true)}
                  >
                    修改项目类型
                  </Button>
                ) : null}
              </div>
              {values.projectTypes.map((projectType) => (
                <input
                  key={projectType}
                  type="hidden"
                  name="projectTypes"
                  value={projectType}
                />
              ))}
              <div
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                aria-describedby={
                  fieldErrors.projectTypes ? "projectTypes-error" : undefined
                }
              >
                {PROJECT_TYPE_OPTIONS.map((option) => {
                  const checkboxId = `projectType-${option.value}`;
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal transition-colors hover:bg-muted/50",
                        values.projectTypes.includes(option.value) &&
                          "border-primary/40 bg-primary/5",
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={values.projectTypes.includes(option.value)}
                        disabled={projectTypesLocked}
                        aria-invalid={Boolean(fieldErrors.projectTypes)}
                        onCheckedChange={(checked) =>
                          updateProjectType(option.value, checked === true)
                        }
                      />
                      <Label
                        htmlFor={checkboxId}
                        className={cn(
                          "flex min-h-7 flex-1 items-center font-normal",
                          projectTypesLocked
                            ? "cursor-not-allowed text-muted-foreground"
                            : "cursor-pointer",
                        )}
                      >
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
              <FieldError field="projectTypes" errors={fieldErrors} />
              {isExplicitProjectTypeEdit ? (
                <div className="flex flex-wrap justify-end gap-2 rounded-lg border bg-muted/30 p-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={cancelProjectTypeEdit}
                  >
                    取消修改
                  </Button>
                  <Button
                    type="button"
                    disabled={!projectTypesDirty || isPending}
                    onClick={saveProjectTypes}
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    {isPending ? "正在保存" : "保存修改"}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>2 · 清标参数设置</CardTitle>
            <CardDescription>
              清标抽值按百分数显示和录入；其余四项按普通分值录入。当前 16 场景仍使用已确认的 0% / 1% / 2% / 3% K2。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {textInput("qingbiaoDrawValue1", "清标抽值1", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("qingbiaoDrawValue2", "清标抽值2", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("qingbiaoDrawValue3", "清标抽值3", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("qingbiaoDrawValue4", "清标抽值4", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("totalBidPriceScore", "总投标报价分值", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "分",
            })}
            {textInput("similarExperienceScore", "同类业绩分值", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "分",
            })}
            {textInput("otherScore", "其他主客观分值", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "分",
            })}
            {textInput("rankDeduction", "排名递减扣分值", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "分",
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>3 · 定标参数设置</CardTitle>
            <CardDescription>
              三个抽值均按百分数显示和录入，例如 1% 请输入 1。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            {textInput("finalDrawValue1", "定标抽值1", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("finalDrawValue2", "定标抽值2", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
            {textInput("finalDrawValue3", "定标抽值3", {
              inputMode: "decimal",
              placeholder: "0",
              suffix: "%",
            })}
          </CardContent>
        </Card>
      </fieldset>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isDirty ? "存在尚未保存的修改" : "所有修改均已保存"}
        </p>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href="/projects">取消</Link>
          </Button>
          <Button
            type="submit"
            disabled={!isDirty || isPending || isExplicitProjectTypeEdit}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {isPending
              ? "正在保存"
              : props.mode === "create"
                ? "创建项目"
                : "保存参数"}
          </Button>
        </div>
      </div>
      </form>

      <ConfirmDialog
        open={projectTypeConfirmOpen}
        title="修改项目类型"
        description="项目类型会影响履约信息匹配以及后续清标、定标和决策分析。修改项目类型后，已有测算结果将被标记为已过期，需要重新测算。是否继续？"
        confirmLabel="继续修改"
        cancelLabel="取消"
        onOpenChange={setProjectTypeConfirmOpen}
        onConfirm={() => {
          setProjectTypeConfirmOpen(false);
          setProjectTypeEditMode(true);
        }}
      />
    </>
  );
}

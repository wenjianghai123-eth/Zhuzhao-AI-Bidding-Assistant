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
  updateProjectSettingsAction,
} from "@/app/(dashboard)/projects/actions";
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
import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import {
  getProjectFormFieldErrors,
  PROJECT_TYPE_OPTIONS,
  projectSettingsFormSchema,
  readProjectSettingsFormData,
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
    }
);

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
    decimalInputIsEqual(left.totalBidPriceScore, right.totalBidPriceScore) &&
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
  const [values, setValues] = useState<ProjectSettingsFormValues>(() =>
    cloneValues(props.initialValues),
  );
  const [savedValues, setSavedValues] = useState<ProjectSettingsFormValues>(() =>
    cloneValues(props.initialValues),
  );
  const [fieldErrors, setFieldErrors] = useState<ProjectFormFieldErrors>({});
  const isDirty = !valuesAreEqual(values, savedValues);

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
      projectTypes: checked
        ? [...current.projectTypes, projectType]
        : current.projectTypes.filter((value) => value !== projectType),
    }));
    clearFieldError("projectTypes");
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionLock.current || isPending || !isDirty) {
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

        if (result.status === "failure" || result.status === "not_found") {
          toast.error(result.message);
          return;
        }

        setSavedValues(cloneValues(values));

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
    <form className="space-y-6" noValidate onSubmit={submitForm}>
      <fieldset className="contents" disabled={isPending}>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>项目基本信息</CardTitle>
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
              <Label>项目类型</Label>
              <div
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                aria-describedby={
                  fieldErrors.projectTypes ? "projectTypes-error" : undefined
                }
              >
                {PROJECT_TYPE_OPTIONS.map((option) => {
                  const checkboxId = `projectType-${option.value}`;
                  return (
                    <Label
                      key={option.value}
                      htmlFor={checkboxId}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal transition-colors hover:bg-muted/50",
                        values.projectTypes.includes(option.value) &&
                          "border-primary/40 bg-primary/5",
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        name="projectTypes"
                        value={option.value}
                        checked={values.projectTypes.includes(option.value)}
                        aria-invalid={Boolean(fieldErrors.projectTypes)}
                        onCheckedChange={(checked) =>
                          updateProjectType(option.value, checked === true)
                        }
                      />
                      <span>{option.label}</span>
                    </Label>
                  );
                })}
              </div>
              <FieldError field="projectTypes" errors={fieldErrors} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>清标参数</CardTitle>
            <CardDescription>
              本阶段仅维护报价分值与排名递减扣分值，不执行清标测算。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {textInput("totalBidPriceScore", "总投标报价分值", {
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
            <CardTitle>定标参数</CardTitle>
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
          <Button type="submit" disabled={!isDirty || isPending}>
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
  );
}

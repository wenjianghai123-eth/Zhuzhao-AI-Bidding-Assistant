"use client";

import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
  useTransition,
} from "react";
import Decimal from "decimal.js";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createCandidateAction,
  updateCandidateAction,
} from "@/app/(dashboard)/projects/[id]/candidates/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  candidateFormSchema,
  createEmptyCandidateFormValues,
  getCandidateFormFieldErrors,
  readCandidateFormData,
  type CandidateFormField,
  type CandidateFormFieldErrors,
  type CandidateFormValues,
  type CandidateListItem,
} from "@/features/candidates/candidate-form-schema";
import { cn } from "@/lib/utils";

type TextCandidateFormField = Exclude<CandidateFormField, "isOurCompany">;

type CandidateDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
} &
  (
    | { mode: "create" }
    | {
        mode: "edit";
        candidate: CandidateListItem;
      }
  );

function cloneValues(values: CandidateFormValues): CandidateFormValues {
  return { ...values };
}

function decimalInputIsEqual(left: string, right: string) {
  try {
    return new Decimal(left).equals(new Decimal(right));
  } catch {
    return left === right;
  }
}

function valuesAreEqual(left: CandidateFormValues, right: CandidateFormValues) {
  return (
    left.companyName.trim() === right.companyName.trim() &&
    left.isOurCompany === right.isOurCompany &&
    decimalInputIsEqual(left.bidPrice, right.bidPrice) &&
    decimalInputIsEqual(left.netDiscountRate, right.netDiscountRate) &&
    decimalInputIsEqual(left.trademarkScore, right.trademarkScore) &&
    decimalInputIsEqual(left.technicalScore, right.technicalScore) &&
    decimalInputIsEqual(
      left.similarExperienceScore,
      right.similarExperienceScore,
    ) &&
    decimalInputIsEqual(left.otherScore, right.otherScore)
  );
}

function FieldError({
  field,
  errors,
}: {
  field: CandidateFormField;
  errors: CandidateFormFieldErrors;
}) {
  const messages = errors[field];
  if (!messages?.length) {
    return null;
  }

  return (
    <p
      id={`candidate-${field}-error`}
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

export function CandidateDialog(props: CandidateDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const initialValues =
    props.mode === "create"
      ? createEmptyCandidateFormValues()
      : cloneValues(props.candidate);
  const [values, setValues] = useState<CandidateFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<CandidateFormFieldErrors>({});
  const isDirty =
    props.mode === "create" || !valuesAreEqual(values, initialValues);

  function clearFieldError(field: CandidateFormField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateTextField(field: TextCandidateFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || isPending || !isDirty) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const validation = candidateFormSchema.safeParse(
      readCandidateFormData(formData),
    );

    if (!validation.success) {
      setFieldErrors(getCandidateFormFieldErrors(validation.error));
      toast.error("请检查候选单位表单中的错误");
      return;
    }

    setFieldErrors({});
    submissionLock.current = true;
    startTransition(async () => {
      try {
        const result =
          props.mode === "create"
            ? await createCandidateAction(props.projectId, formData)
            : await updateCandidateAction(
                props.projectId,
                props.candidate.id,
                formData,
              );

        if (result.status === "invalid") {
          setFieldErrors(result.fieldErrors);
          toast.error(result.message);
          return;
        }

        if (result.status === "conflict") {
          setFieldErrors({ companyName: [result.message] });
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
        toast.error("候选单位保存失败，请检查网络后重试");
      } finally {
        submissionLock.current = false;
      }
    });
  }

  function textInput(
    field: TextCandidateFormField,
    label: string,
    options?: {
      suffix?: string;
      placeholder?: string;
      className?: string;
    },
  ) {
    const hasError = Boolean(fieldErrors[field]?.length);

    return (
      <div className={cn("space-y-2", options?.className)}>
        <Label htmlFor={`candidate-${field}`}>{label}</Label>
        <div className="relative">
          <Input
            id={`candidate-${field}`}
            name={field}
            value={values[field]}
            inputMode={field === "companyName" ? undefined : "decimal"}
            placeholder={options?.placeholder}
            className={options?.suffix ? "pr-14" : undefined}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `candidate-${field}-error` : undefined
            }
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
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!isPending) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form className="grid gap-4" noValidate onSubmit={submitForm}>
          <DialogHeader>
            <DialogTitle>
              {props.mode === "create" ? "新增候选单位" : "编辑候选单位"}
            </DialogTitle>
            <DialogDescription>
              报价按万元录入，净下浮率按百分数录入；评分仅作为基础数据保存。
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={isPending}>
            {textInput("companyName", "单位名称", {
              placeholder: "请输入单位名称",
              className: "sm:col-span-2",
            })}
            {textInput("bidPrice", "投标总价", {
              suffix: "万元",
              placeholder: "0.00",
            })}
            {textInput("netDiscountRate", "净下浮率", {
              suffix: "%",
              placeholder: "0",
            })}
            {textInput("trademarkScore", "商标优", {
              suffix: "分",
              placeholder: "0",
            })}
            {textInput("technicalScore", "技术优", {
              suffix: "分",
              placeholder: "0",
            })}
            {textInput("similarExperienceScore", "同类业绩", {
              suffix: "分",
              placeholder: "0",
            })}
            {textInput("otherScore", "其他主客观分", {
              suffix: "分",
              placeholder: "0",
            })}

            <div className="space-y-2 sm:col-span-2">
              <input
                type="hidden"
                name="isOurCompany"
                value={values.isOurCompany ? "true" : "false"}
              />
              <Label
                htmlFor="candidate-isOurCompany"
                className="flex items-start gap-3 rounded-lg border p-3 font-normal"
              >
                <Checkbox
                  id="candidate-isOurCompany"
                  checked={values.isOurCompany}
                  onCheckedChange={(checked) => {
                    setValues((current) => ({
                      ...current,
                      isOurCompany: checked === true,
                    }));
                    clearFieldError("isOurCompany");
                  }}
                />
                <span>
                  <span className="block font-medium">设置为我方单位</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    保存后将自动取消当前项目中原有的我方单位标记。
                  </span>
                </span>
              </Label>
              <FieldError field="isOurCompany" errors={fieldErrors} />
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

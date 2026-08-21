"use client";

import { Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  pendingLabel = "正在处理",
  cancelLabel = "取消",
  destructive = false,
  pending = false,
  icon,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  icon?: ReactNode;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              icon ?? (destructive ? <Trash2 aria-hidden="true" /> : null)
            )}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

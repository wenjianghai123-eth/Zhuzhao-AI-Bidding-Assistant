"use client";

import { CircleHelp, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectFilters({
  search,
  status,
  projectType,
  onSearchChange,
  onStatusChange,
  onProjectTypeChange,
}: {
  search: string;
  status: string;
  projectType: string;
  onSearchChange(value: string): void;
  onStatusChange(value: string): void;
  onProjectTypeChange(value: string): void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            className="pl-8"
            placeholder="搜索项目名称"
            aria-label="搜索项目"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-36" aria-label="筛选项目状态">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="DRAFT">草稿</SelectItem>
            <SelectItem value="CALCULATED">已测算</SelectItem>
            <SelectItem value="COMPLETED">已完成</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectType} onValueChange={onProjectTypeChange}>
          <SelectTrigger className="w-full sm:w-32" aria-label="筛选项目类型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部类型</SelectItem>
            <SelectItem value="CURTAIN_WALL">幕墙</SelectItem>
            <SelectItem value="DECORATION">装修</SelectItem>
            <SelectItem value="GENERAL_CONTRACT">总包</SelectItem>
            <SelectItem value="LABORATORY">实验室</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost">
            <CircleHelp />
            使用说明
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>项目工作流</DialogTitle>
            <DialogDescription>
              依次完成参数、候选单位和履约数据准备，再进入清标与定标测算。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
            测算结果会保存输入版本。参数、候选单位或履约数据发生变化后，请重新执行测算，确保决策分析使用最新结果。
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}

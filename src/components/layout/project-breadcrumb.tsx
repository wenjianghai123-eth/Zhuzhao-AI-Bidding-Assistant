"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const projectPageNames: Readonly<Record<string, string>> = {
  settings: "参数设置",
  candidates: "候选单位",
  qingbiao: "清标测算",
  dingbiao: "定标预测",
  analysis: "决策分析",
  report: "分析报告",
};

type Crumb = {
  label: string;
  href?: "/projects" | `/projects/${string}`;
};

function getCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "performance") {
    return [{ label: "数据中心" }, { label: "履约信息" }];
  }
  if (segments[0] === "imports") {
    return [{ label: "数据中心" }, { label: "导入 Excel" }];
  }
  if (segments[0] !== "projects") {
    return [{ label: "工作台" }];
  }

  const crumbs: Crumb[] = [{ label: "项目管理", href: "/projects" }];
  const projectSegment = segments[1];
  if (!projectSegment) {
    return crumbs;
  }
  if (projectSegment === "new") {
    return [...crumbs, { label: "新建项目" }];
  }

  crumbs.push({
    label: "当前项目",
    href: `/projects/${projectSegment}`,
  });
  const pageSegment = segments[2];
  if (pageSegment) {
    crumbs.push({ label: projectPageNames[pageSegment] ?? "项目页面" });
  }
  return crumbs;
}

export function ProjectBreadcrumb() {
  const pathname = usePathname();
  const crumbs = getCrumbs(pathname);

  return (
    <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5">
      <Home
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span
            key={`${crumb.label}-${index}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {index > 0 ? (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              />
            ) : null}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate text-xs font-medium text-foreground">
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

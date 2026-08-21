"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Database,
  FileBarChart,
  FileSpreadsheet,
  FilePlus2,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href:
    | "/projects"
    | "/projects/new"
    | "/performance"
    | "/imports/excel"
    | `/projects/${string}`;
  icon: LucideIcon;
  exact?: boolean;
};

const projectManagement: readonly NavItem[] = [
  { label: "项目列表", href: "/projects", icon: FolderKanban, exact: true },
  { label: "新建项目", href: "/projects/new", icon: FilePlus2, exact: true },
];

function getCurrentProjectNav(projectId: string): readonly NavItem[] {
  return [
  {
    label: "项目概览",
    href: `/projects/${projectId}`,
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "参数设置",
    href: `/projects/${projectId}/settings`,
    icon: Settings2,
  },
  {
    label: "候选单位",
    href: `/projects/${projectId}/candidates`,
    icon: Building2,
  },
  {
    label: "清标测算",
    href: `/projects/${projectId}/qingbiao`,
    icon: ListChecks,
  },
  {
    label: "定标预测",
    href: `/projects/${projectId}/dingbiao`,
    icon: Target,
  },
  {
    label: "决策分析",
    href: `/projects/${projectId}/analysis`,
    icon: BarChart3,
  },
  {
    label: "分析报告",
    href: `/projects/${projectId}/report`,
    icon: FileBarChart,
  },
  ];
}

function getProjectIdFromPathname(pathname: string) {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  if (!match || match[1] === "new") {
    return null;
  }
  return match[1];
}

function ButtonLinkToProjects({
  onNavigate,
}: {
  onNavigate: (() => void) | undefined;
}) {
  return (
    <Link
      href="/projects"
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <FolderKanban className="size-4 text-sidebar-foreground/50" aria-hidden="true" />
      选择项目
    </Link>
  );
}

const dataCenter: readonly NavItem[] = [
  { label: "Excel导入", href: "/imports/excel", icon: FileSpreadsheet },
  { label: "履约数据库", href: "/performance", icon: Database },
];

type AppSidebarContentProps = {
  onNavigate?: () => void;
};

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: (() => void) | undefined;
}) {
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive &&
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]",
      )}
    >
      <Icon
        className={cn(
          "size-4 text-sidebar-foreground/50 transition-colors group-hover:text-sidebar-accent-foreground",
          isActive && "text-sidebar-primary",
        )}
        aria-hidden="true"
      />
      <span>{item.label}</span>
    </Link>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: readonly NavItem[];
  pathname: string;
  onNavigate: (() => void) | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-3 text-[11px] font-semibold tracking-[0.16em] text-sidebar-foreground/40 uppercase">
        {title}
      </p>
      <nav className="space-y-1" aria-label={title}>
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

export function AppSidebarContent({ onNavigate }: AppSidebarContentProps) {
  const pathname = usePathname();
  const projectId = getProjectIdFromPathname(pathname);
  const currentProjectNav = projectId ? getCurrentProjectNav(projectId) : [];

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-wide">烛照AI投标助手</p>
          <p className="truncate text-[10px] tracking-[0.08em] text-sidebar-foreground/45 uppercase">
            Zhuzhao Bidding
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <NavGroup
          title="项目管理"
          items={projectManagement}
          pathname={pathname}
          onNavigate={onNavigate}
        />

        <div>
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-sidebar-foreground/40 uppercase">
              当前项目
            </p>
            {projectId ? (
              <Badge className="border-0 bg-sidebar-primary/20 text-[10px] text-sidebar-primary">
                已选择
              </Badge>
            ) : null}
          </div>
          <div className="mb-2 rounded-lg border border-sidebar-border bg-black/5 px-3 py-2.5">
            <p className="line-clamp-2 text-xs leading-5 font-medium text-sidebar-foreground">
              {projectId ? "当前项目工作区" : "尚未选择项目"}
            </p>
            <p className="mt-1 text-[10px] text-sidebar-foreground/45">
              {projectId ? `项目 ID：${projectId}` : "请从项目列表进入项目"}
            </p>
          </div>
          {projectId ? (
            <nav className="space-y-1" aria-label="当前项目">
              {currentProjectNav.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </nav>
          ) : (
            <ButtonLinkToProjects onNavigate={onNavigate} />
          )}
        </div>

        <NavGroup
          title="数据中心"
          items={dataCenter}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </div>

      <div className="p-3">
        <Separator className="mb-3 bg-sidebar-border" />
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/55">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
          <span>规则与数据安全模式</span>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border lg:block">
      <AppSidebarContent />
    </aside>
  );
}

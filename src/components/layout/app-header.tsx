"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, UserRound } from "lucide-react";

import { AppSidebarContent } from "@/components/layout/app-sidebar";
import { ProjectBreadcrumb } from "@/components/layout/project-breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function getContextName(pathname: string) {
  if (/^\/projects\/(?!new(?:\/|$))[^/]+/.test(pathname)) {
    return "当前项目工作区";
  }
  if (pathname === "/performance") {
    return "企业履约数据中心";
  }
  if (pathname === "/imports/excel") {
    return "Excel 数据导入";
  }
  return "项目工作台";
}

export function AppHeader() {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="print-hidden sticky top-0 z-30 flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开导航菜单"
        >
          <Menu />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {getContextName(pathname)}
          </p>
          <ProjectBreadcrumb />
        </div>

        <div className="ml-4 flex items-center gap-1.5">
          <Button variant="ghost" size="icon" aria-label="通知">
            <Bell />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2 px-2">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    项
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm sm:inline">项目测算员</span>
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>用户区域占位</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserRound />
                个人设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 border-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>应用导航</SheetTitle>
            <SheetDescription>烛照AI投标助手页面导航</SheetDescription>
          </SheetHeader>
          <AppSidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

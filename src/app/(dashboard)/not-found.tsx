import Link from "next/link";
import { FolderSearch, List } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={FolderSearch}
      title="项目或页面不存在"
      description="该项目可能已被删除，或者当前链接已经失效。请返回项目列表重新选择。"
      action={
        <Button asChild>
          <Link href="/projects">
            <List aria-hidden="true" />
            返回项目列表
          </Link>
        </Button>
      }
    />
  );
}

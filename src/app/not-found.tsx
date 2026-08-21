import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl items-center px-4 py-10">
      <EmptyState
        className="w-full"
        icon={SearchX}
        title="页面不存在"
        description="请检查访问地址，或返回项目列表继续使用。"
        action={
          <Button asChild>
            <Link href="/projects">
              <ArrowLeft aria-hidden="true" />
              返回项目列表
            </Link>
          </Button>
        }
      />
    </main>
  );
}

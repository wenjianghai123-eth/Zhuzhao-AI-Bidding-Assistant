import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectSettingsForm } from "@/features/projects/components/project-settings-form";
import { createEmptyProjectSettingsFormValues } from "@/features/projects/project-settings-form-schema";

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New Project"
        title="新建项目"
        description="一次完成项目基本信息、清标参数和定标参数配置。"
        actions={
          <Button asChild variant="outline">
            <Link href="/projects">
              <ArrowLeft />
              返回项目列表
            </Link>
          </Button>
        }
      />
      <ProjectSettingsForm
        mode="create"
        initialValues={createEmptyProjectSettingsFormValues()}
      />
    </div>
  );
}

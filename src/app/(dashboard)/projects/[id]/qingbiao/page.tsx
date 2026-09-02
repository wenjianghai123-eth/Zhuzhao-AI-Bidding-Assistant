import { notFound } from "next/navigation";

import { QingbiaoManager } from "@/features/qingbiao/components/qingbiao-manager";
import { QingbiaoPreflightPage } from "@/features/qingbiao/components/qingbiao-preflight-page";
import { getProjectOverview } from "@/server/application/project-catalog-service";
import {
  getRuntimeQingbiaoPageData,
  getRuntimeQingbiaoReadiness,
} from "@/server/application/qingbiao-runtime-service";

export default async function QingbiaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectOverview(id);

  if (!project) {
    notFound();
  }

  const readiness = await getRuntimeQingbiaoReadiness(id);
  if (!readiness) {
    notFound();
  }

  if (!project.hasCompleteSettings) {
    return (
      <QingbiaoPreflightPage
        projectId={project.id}
        projectName={project.name}
        readiness={readiness}
      />
    );
  }

  const pageData = await getRuntimeQingbiaoPageData(id);

  if (!pageData) {
    throw new Error("Failed to load qingbiao page data for an existing project");
  }

  return <QingbiaoManager key={pageData.projectId} initialData={pageData} />;
}

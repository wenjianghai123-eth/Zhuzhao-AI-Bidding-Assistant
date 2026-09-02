"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { QingbiaoCalculationControl } from "@/features/qingbiao/components/qingbiao-calculation-control";
import type { QingbiaoReadiness } from "@/server/application/qingbiao-readiness-service";

export function QingbiaoPreflightPage({
  projectId,
  projectName,
  readiness,
}: {
  projectId: string;
  projectName: string;
  readiness: QingbiaoReadiness;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Qingbiao Calculation"
        title="清标测算"
        description={`“${projectName}”尚有清标前置条件需要完成。`}
      />
      <Card>
        <CardHeader>
          <CardTitle>清标测算前检查</CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <QingbiaoCalculationControl
            projectId={projectId}
            initialReadiness={readiness}
          />
        </CardFooter>
      </Card>
    </div>
  );
}

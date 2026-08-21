import { FileSpreadsheet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ExcelImportWizard } from "@/features/imports/components/excel-import-wizard";

export default function ExcelImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Excel Import"
        title="导入 Excel"
        description="上传原有投标工作簿，完成字段映射、数据预览和错误检查后再确认写入。"
        actions={
          <Badge variant="outline" className="gap-1.5">
            <FileSpreadsheet />
            仅支持 .xlsx
          </Badge>
        }
      />
      <ExcelImportWizard />
    </div>
  );
}

import { PerformanceManager } from "@/features/performance/components/performance-manager";
import { toPerformanceFormValues } from "@/features/performance/performance-form-schema";
import { listCompanyPerformanceRecords } from "@/server/application/company-performance-service";

export default async function PerformancePage() {
  const records = await listCompanyPerformanceRecords();

  return (
    <PerformanceManager
      records={records.map((record) => ({
        id: record.id,
        ...toPerformanceFormValues(record),
      }))}
    />
  );
}

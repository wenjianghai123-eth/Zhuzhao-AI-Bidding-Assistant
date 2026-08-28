DROP INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_key";

CREATE INDEX "CompanyPerformance_projectId_candidateId_projectType_year_quarter_idx"
ON "CompanyPerformance"("projectId", "candidateId", "projectType", "year", "quarter");

import "dotenv/config";

import {
  auditPercentageFraction,
  type PercentageAuditRecord,
} from "../src/lib/percentage-audit";
import { prisma } from "../src/server/db/prisma";

async function collectPercentageAuditRecords() {
  const [candidates, projectRules, qingbiaoScenarios, dingbiaoScenarios] =
    await Promise.all([
      prisma.projectCandidate.findMany({
        select: { id: true, netDiscountRate: true },
        orderBy: { id: "asc" },
      }),
      prisma.projectRule.findMany({
        select: {
          projectId: true,
          finalDrawValue1: true,
          finalDrawValue2: true,
          finalDrawValue3: true,
        },
        orderBy: { projectId: "asc" },
      }),
      prisma.qingbiaoScenario.findMany({
        select: { id: true, qingbiaoK1: true },
        orderBy: { id: "asc" },
      }),
      prisma.dingbiaoScenario.findMany({
        select: { id: true, dingbiaoK1: true, finalDrawValue: true },
        orderBy: { id: "asc" },
      }),
    ]);

  const records: PercentageAuditRecord[] = [];
  for (const candidate of candidates) {
    records.push(
      auditPercentageFraction({
        field: "ProjectCandidate.netDiscountRate",
        recordId: candidate.id,
        currentValue: candidate.netDiscountRate.toString(),
      }),
    );
  }
  for (const rule of projectRules) {
    const drawValues = [
      ["ProjectRule.finalDrawValue1", rule.finalDrawValue1],
      ["ProjectRule.finalDrawValue2", rule.finalDrawValue2],
      ["ProjectRule.finalDrawValue3", rule.finalDrawValue3],
    ] as const;
    for (const [field, value] of drawValues) {
      records.push(
        auditPercentageFraction({
          field,
          recordId: rule.projectId,
          currentValue: value.toString(),
        }),
      );
    }
  }
  for (const scenario of qingbiaoScenarios) {
    records.push(
      auditPercentageFraction({
        field: "QingbiaoScenario.qingbiaoK1",
        recordId: scenario.id,
        currentValue: scenario.qingbiaoK1.toString(),
      }),
    );
  }
  for (const scenario of dingbiaoScenarios) {
    records.push(
      auditPercentageFraction({
        field: "DingbiaoScenario.dingbiaoK1",
        recordId: scenario.id,
        currentValue: scenario.dingbiaoK1.toString(),
      }),
      auditPercentageFraction({
        field: "DingbiaoScenario.finalDrawValue",
        recordId: scenario.id,
        currentValue: scenario.finalDrawValue.toString(),
      }),
    );
  }

  return records;
}

async function main() {
  const records = await collectPercentageAuditRecords();
  const suspiciousCount = records.filter(
    (record) => record.suspiciousPercentagePoints,
  ).length;

  console.log(
    "Read-only magnitude audit: |value| <= 1 is reported as expected fraction; larger values are suspicious only and are never modified.",
  );
  console.table(records);
  console.log(
    JSON.stringify(
      {
        auditedFieldValues: records.length,
        expectedFractions: records.length - suspiciousCount,
        suspiciousPercentagePoints: suspiciousCount,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

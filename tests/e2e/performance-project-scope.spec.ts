import { expect, test } from "@playwright/test";

import { prisma } from "@/server/db/prisma";
import { prismaCompanyPerformanceRepository } from "@/server/repositories/company-performance-repository";

const projectAId = "e2e-performance-scope-project-a";
const projectBId = "e2e-performance-scope-project-b";
const projectIds = [projectAId, projectBId] as const;
const companyNames = [
  "A公司",
  "同名乙公司",
  "同名丙公司",
  "同名丁公司",
  "同名戊公司",
  "同名己公司",
] as const;

async function deleteScopeFixtures() {
  await prisma.project.deleteMany({ where: { id: { in: [...projectIds] } } });
}

async function createScopeProject(
  projectId: string,
  projectName: string,
  idPrefix: string,
  performanceScores: readonly string[],
) {
  if (performanceScores.length !== companyNames.length) {
    throw new Error("Performance scope E2E fixture is incomplete.");
  }
  const candidates = companyNames.map((companyName, index) => ({
    id: `${idPrefix}-candidate-${index + 1}`,
    companyName,
    bidPrice: (880 + index * 10).toString(),
    netDiscountRate: (0.08 + index * 0.01).toString(),
    trademarkScore: "0",
    technicalScore: "0",
    similarExperienceScore: "5",
    otherScore: "5",
    isOurCompany: index === 0,
  }));

  await prisma.project.create({
    data: {
      id: projectId,
      name: projectName,
      rule: {
        create: {
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
          totalBidPriceScore: "40",
          rankDeduction: "2",
          finalDrawValue1: "0",
          finalDrawValue2: "0.01",
          finalDrawValue3: "0.02",
          projectTypes: { create: { projectType: "CURTAIN_WALL" } },
        },
      },
      candidates: { create: candidates },
      qingbiaoExclusionRules: {
        create: [1, 2, 3, 4].map((ruleIndex) => ({ ruleIndex })),
      },
    },
  });
  await prisma.companyPerformance.createMany({
    data: candidates.map((candidate, index) => ({
      projectId,
      candidateId: candidate.id,
      companyName: candidate.companyName,
      projectType: "CURTAIN_WALL",
      classificationLevel: "A级",
      year: 2026,
      quarter: 1,
      score: performanceScores[index] ?? "0",
    })),
  });
}

test.beforeEach(async () => {
  await deleteScopeFixtures();
  await createScopeProject(
    projectAId,
    "履约隔离 Project A",
    "scope-a",
    ["80", "90", "85", "88", "82", "86"],
  );
  await createScopeProject(
    projectBId,
    "履约隔离 Project B",
    "scope-b",
    ["95", "90", "85", "88", "82", "86"],
  );
});

test.afterEach(async ({ page }) => {
  await page.goto("/projects");
  await deleteScopeFixtures();
});

test("同名公司的履约页面与清标结果按 Project 隔离", async ({ page }) => {
  const projectBPerformance =
    await prisma.companyPerformance.findFirstOrThrow({
      where: { projectId: projectBId, candidateId: "scope-b-candidate-1" },
      select: { id: true },
    });
  await expect(
    prismaCompanyPerformanceRepository.create(projectAId, {
      candidateId: "scope-b-candidate-1",
      projectType: "CURTAIN_WALL",
      classificationLevel: "A级",
      year: 2026,
      quarter: 2,
      score: "99",
    }),
  ).resolves.toBeNull();
  await expect(
    prismaCompanyPerformanceRepository.update(
      projectAId,
      projectBPerformance.id,
      {
        candidateId: "scope-a-candidate-1",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A级",
        year: 2026,
        quarter: 1,
        score: "99",
      },
    ),
  ).resolves.toBe(false);
  await expect(
    prismaCompanyPerformanceRepository.delete(
      projectAId,
      projectBPerformance.id,
    ),
  ).resolves.toBe(false);
  await expect(
    prisma.companyPerformance.findUnique({
      where: { id: projectBPerformance.id },
      select: { score: true },
    }),
  ).resolves.toMatchObject({ score: expect.anything() });

  await page.goto(`/projects/${projectAId}/performance`);
  await expect(page.getByText("履约隔离 Project A", { exact: true })).toBeVisible();
  const projectARow = page.getByRole("row").filter({ hasText: "A公司" });
  await expect(projectARow).toContainText("80.00");
  await expect(projectARow).not.toContainText("95.00");

  await page.getByRole("button", { name: "新增履约记录" }).first().click();
  const projectADialog = page.getByRole("dialog", { name: "新增履约记录" });
  await projectADialog
    .getByRole("combobox", { name: "履约单位", exact: true })
    .click();
  await expect(page.getByRole("option", { name: "A公司", exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "同名乙公司", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await projectADialog.getByRole("button", { name: "取消" }).click();

  await page.goto(`/projects/${projectBId}/performance`);
  await expect(page.getByText("履约隔离 Project B", { exact: true })).toBeVisible();
  const projectBRow = page.getByRole("row").filter({ hasText: "A公司" });
  await expect(projectBRow).toContainText("95.00");
  await expect(projectBRow).not.toContainText("80.00");

  for (const projectId of projectIds) {
    await page.goto(`/projects/${projectId}/qingbiao`);
    await expect(
      page.getByText("配置及履约数据完整，可以开始测算。"),
    ).toBeVisible();
    await page.getByRole("button", { name: "开始清标测算" }).click();
    await expect(page.getByRole("heading", { name: "16场景总览" })).toBeVisible();
  }

  const [projectAResult, projectBResult] = await Promise.all([
    prisma.qingbiaoResult.findFirst({
      where: {
        candidateId: "scope-a-candidate-1",
        scenario: { projectId: projectAId },
      },
      select: { performanceAverage: true, performanceScore: true },
    }),
    prisma.qingbiaoResult.findFirst({
      where: {
        candidateId: "scope-b-candidate-1",
        scenario: { projectId: projectBId },
      },
      select: { performanceAverage: true, performanceScore: true },
    }),
  ]);

  expect(projectAResult?.performanceAverage.toString()).toBe("80");
  expect(projectBResult?.performanceAverage.toString()).toBe("95");
  expect(projectAResult?.performanceScore.toString()).not.toBe(
    projectBResult?.performanceScore.toString(),
  );
});

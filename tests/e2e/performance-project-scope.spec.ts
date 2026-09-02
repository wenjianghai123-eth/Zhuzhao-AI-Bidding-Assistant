import { expect, test } from "@playwright/test";

import { prisma } from "@/server/db/prisma";
import {
  getPerformanceWeightedPageData,
  getSavedPerformanceAverage,
  savePerformanceWeightedScores,
} from "@/server/application/performance-weighted-score-service";

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

async function createScopeProject(input: {
  projectId: string;
  projectName: string;
  idPrefix: string;
  performanceScores: readonly string[];
  includeDecorationGap?: boolean;
}) {
  const candidates = companyNames.map((companyName, index) => ({
    id: `${input.idPrefix}-candidate-${index + 1}`,
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
      id: input.projectId,
      name: input.projectName,
      rule: {
        create: {
          maxBidPrice: "1000",
          nonCompetitiveFee: "100",
          totalBidPriceScore: "40",
          rankDeduction: "2",
          finalDrawValue1: "0",
          finalDrawValue2: "0.01",
          finalDrawValue3: "0.02",
          projectTypes: {
            create: input.includeDecorationGap
              ? [
                  { projectType: "CURTAIN_WALL" },
                  { projectType: "DECORATION" },
                ]
              : [{ projectType: "CURTAIN_WALL" }],
          },
        },
      },
      candidates: { create: candidates },
      qingbiaoExclusionRules: {
        create: [1, 2, 3, 4].map((ruleIndex) => ({ ruleIndex })),
      },
    },
  });
  await prisma.companyPerformance.createMany({
    data: [
      ...candidates.map((candidate, index) => ({
        projectId: input.projectId,
        candidateId: candidate.id,
        companyName: candidate.companyName,
        projectType: "CURTAIN_WALL" as const,
        classificationLevel: "A级",
        year: 2026,
        quarter: 1,
        score: input.performanceScores[index] ?? "0",
      })),
      ...(input.includeDecorationGap
        ? candidates.slice(1).map((candidate, index) => ({
            projectId: input.projectId,
            candidateId: candidate.id,
            companyName: candidate.companyName,
            projectType: "DECORATION" as const,
            classificationLevel: "A级",
            year: 2026,
            quarter: 1,
            score: (91 - index).toString(),
          }))
        : []),
    ],
  });
  const page = await getPerformanceWeightedPageData(input.projectId);
  if (!page) throw new Error("Weighted performance fixture is unavailable.");
  const saved = await savePerformanceWeightedScores(input.projectId, {
    expectedInputRevision: page.inputRevision,
    start: page.start,
    end: page.end,
    weightingMethod: page.weightingMethod,
    rows: page.suggestedRows,
  });
  if (saved.status !== "saved") {
    throw new Error("Weighted performance fixture could not be saved.");
  }
}

test.beforeEach(async () => {
  await deleteScopeFixtures();
  await createScopeProject({
    projectId: projectAId,
    projectName: "履约隔离 Project A",
    idPrefix: "scope-a",
    performanceScores: ["80", "90", "85", "88", "82", "86"],
    includeDecorationGap: true,
  });
  await createScopeProject({
    projectId: projectBId,
    projectName: "履约隔离 Project B",
    idPrefix: "scope-b",
    performanceScores: ["95", "90", "85", "88", "82", "86"],
  });
});

test.afterEach(async ({ page }) => {
  await page.goto("/projects");
  await deleteScopeFixtures();
});

test("季度唯一履约矩阵与正式加权分快照按 Project 隔离", async ({ page }) => {
  await page.goto(`/projects/${projectAId}/performance`);
  await expect(page.getByRole("heading", { name: "履约信息" })).toBeVisible();
  await expect(page.getByLabel("A公司 2026 Q1 履约分")).toHaveValue("80");
  await expect(page.getByText("履约数据明细", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新增履约记录" })).toHaveCount(0);

  await page.goto(`/projects/${projectBId}/performance`);
  await expect(page.getByLabel("A公司 2026 Q1 履约分")).toHaveValue("95");

  await expect(
    getSavedPerformanceAverage(
      projectAId,
      "scope-a-candidate-1",
      ["CURTAIN_WALL"],
    ),
  ).resolves.toMatchObject({ status: "complete", averageScore: "80" });
  await expect(
    getSavedPerformanceAverage(
      projectBId,
      "scope-b-candidate-1",
      ["CURTAIN_WALL"],
    ),
  ).resolves.toMatchObject({ status: "complete", averageScore: "95" });
});

test("履约矩阵编辑、批量预览、刷新、切换加权与清标共源", async ({ page }) => {
  await page.goto(`/projects/${projectAId}/performance`);
  const performanceModule = page.getByTestId("performance-weighted-score");

  await page.getByLabel("A公司 2026 Q1 履约分").fill("84");
  await performanceModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("单位履约加权分已保存，共保存 11 行。")).toBeVisible();
  await expect(performanceModule.getByText("已保存 · 11 行", { exact: true })).toBeVisible();

  await performanceModule.getByRole("combobox", { name: "项目类型筛选" }).click();
  await page.getByRole("option", { name: "装修", exact: true }).click();
  await expect(performanceModule.getByText("当前显示 5 行", { exact: false })).toBeVisible();
  await performanceModule.getByRole("button", { name: "新增一行" }).click();
  await expect(performanceModule.getByText("当前显示 6 行", { exact: false })).toBeVisible();

  await performanceModule.getByRole("button", { name: "增加年份" }).click();
  await expect(performanceModule.getByRole("columnheader", { name: "2027 Q1" })).toBeVisible();

  const quarters = [2024, 2025, 2026, 2027].flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => `${year} Q${quarter}`),
  );
  const headers = ["候选单位", "项目类型", "分类分级等级", ...quarters];
  const values = quarters.map((quarter) =>
    quarter === "2026 Q1" ? "错误分数" : quarter === "2027 Q1" ? "96" : "",
  );
  await performanceModule.getByRole("button", { name: "批量粘贴" }).click();
  const dialog = page.getByRole("dialog", { name: "批量粘贴履约加权分" });
  const textarea = dialog.getByLabel("批量粘贴内容");
  await textarea.fill(`${headers.join("\t")}\n${["A公司", "装修", "A级", ...values].join("\t")}`);
  await dialog.getByRole("button", { name: "生成预览" }).click();
  await expect(dialog.getByText("不是有效非负十进制数", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "确认导入" })).toBeDisabled();

  const fixedValues = quarters.map((quarter) =>
    quarter === "2026 Q1" ? "90" : quarter === "2027 Q1" ? "96" : "",
  );
  await textarea.fill(`${headers.join("\t")}\n${["A公司", "装修", "A级", ...fixedValues].join("\t")}`);
  await dialog.getByRole("button", { name: "生成预览" }).click();
  await expect(dialog.getByText("校验通过，可以确认导入。")).toBeVisible();
  await dialog.getByRole("button", { name: "确认导入" }).click();

  await expect(page.getByLabel("A公司 2026 Q1 履约分")).toHaveValue("90");
  await expect(page.getByLabel("A公司 2027 Q1 履约分")).toHaveValue("96");
  await performanceModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("单位履约加权分已保存，共保存 12 行。")).toBeVisible();

  await page.reload();
  await expect(performanceModule.getByText("已保存 · 12 行", { exact: true })).toBeVisible();
  await performanceModule.getByRole("combobox", { name: "项目类型筛选" }).click();
  await page.getByRole("option", { name: "装修", exact: true }).click();
  await expect(page.getByLabel("A公司 2026 Q1 履约分")).toHaveValue("90");
  await expect(page.getByLabel("A公司 2027 Q1 履约分")).toHaveValue("96");

  await performanceModule.getByRole("combobox", { name: "加权方式" }).click();
  await page
    .getByRole("option", { name: "时间线性加权（越近权重越高）", exact: true })
    .click();
  const decorationRow = performanceModule.getByRole("row").filter({ has: page.getByLabel("A公司 2026 Q1 履约分") });
  await expect(decorationRow.getByRole("cell").filter({ hasText: "94.00" })).toBeVisible();
  await performanceModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(performanceModule.getByText("已保存 · 12 行", { exact: true })).toBeVisible();

  await page.goto(`/projects/${projectAId}/qingbiao`);
  await expect(page.getByText("清标测算条件已满足")).toBeVisible();
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(page.getByRole("heading", { name: "清标测算表" })).toBeVisible();

  const result = await prisma.qingbiaoResult.findFirstOrThrow({
    where: {
      candidateId: "scope-a-candidate-1",
      scenario: { projectId: projectAId },
    },
    select: { performanceAverageCanonical: true },
  });
  expect(result.performanceAverageCanonical).toBe("89");
});

test("2025至2026季度直录刷新持久化并在修改后使清标 stale", async ({ page }) => {
  await page.goto(`/projects/${projectBId}/qingbiao`);
  await expect(page.getByText("清标测算条件已满足")).toBeVisible();
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(page.getByRole("heading", { name: "清标测算表" })).toBeVisible();

  await page.goto(`/projects/${projectBId}/performance`);
  const performanceModule = page.getByTestId("performance-weighted-score");
  await performanceModule.getByRole("combobox", { name: "开始年份" }).click();
  await page.getByRole("option", { name: "2025 年", exact: true }).click();
  await expect(performanceModule.getByRole("columnheader", { name: "2025 Q1" })).toBeVisible();
  await expect(performanceModule.getByRole("columnheader", { name: "2026 Q4" })).toBeVisible();

  await page.getByLabel("A公司 2025 Q3 履约分").fill("90");
  await page.getByLabel("A公司 2025 Q4 履约分").fill("92");
  await page.getByLabel("A公司 2026 Q1 履约分").fill("94");
  await page.getByLabel("A公司 2026 Q2 履约分").fill("96");
  await performanceModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(performanceModule.getByText("已保存 · 6 行", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("A公司 2025 Q3 履约分")).toHaveValue("90");
  await expect(page.getByLabel("A公司 2025 Q4 履约分")).toHaveValue("92");
  await expect(page.getByLabel("A公司 2026 Q1 履约分")).toHaveValue("94");
  await expect(page.getByLabel("A公司 2026 Q2 履约分")).toHaveValue("96");
  const companyRow = performanceModule.getByRole("row").filter({
    has: page.getByLabel("A公司 2026 Q2 履约分"),
  });
  await expect(companyRow.getByRole("cell").filter({ hasText: "93.00" })).toBeVisible();

  await page.goto(`/projects/${projectBId}/qingbiao`);
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(page.getByRole("heading", { name: "清标测算表" })).toBeVisible();
  await page.goto(`/projects/${projectBId}/performance`);
  await page.getByLabel("A公司 2026 Q2 履约分").fill("98");
  await performanceModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(companyRow.getByRole("cell").filter({ hasText: "93.50" })).toBeVisible();

  await page.goto(`/projects/${projectBId}/qingbiao`);
  await expect(
    page.getByText(
      "候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。",
    ),
  ).toBeVisible();
});

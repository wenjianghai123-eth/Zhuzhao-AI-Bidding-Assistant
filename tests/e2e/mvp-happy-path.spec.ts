import { expect, type Page, test } from "@playwright/test";

import {
  CURRENT_QINGBIAO_RULE_VERSION,
  QINGBIAO_20260820_RULE_VERSION,
} from "@/domain/qingbiao";
import { fullGolden20260820Fixture as golden } from "@/domain/regression/fixtures/20260820-full-golden.fixture";
import { saveSynchronizedPerformanceWeightedScores } from "@/server/application/performance-weighted-score-service";
import { prisma } from "@/server/db/prisma";

const acceptanceProjectName = "RC浏览器全流程验收项目";
interface CandidateInput {
  companyName: string;
  bidPrice: string;
  netDiscountRate: string;
  businessPreferred: boolean;
  technicalPreferred: boolean;
  similarExperienceScore: string;
  otherScore: string;
  performanceScore: string;
  isOurCompany: boolean;
}

const candidateInputs = [
  {
    companyName: "RC华辰建设",
    bidPrice: "884",
    netDiscountRate: "10.38",
    businessPreferred: true,
    technicalPreferred: false,
    similarExperienceScore: "8.1",
    otherScore: "1.1",
    performanceScore: "70",
    isOurCompany: false,
  },
  {
    companyName: "RC远景工程",
    bidPrice: "895",
    netDiscountRate: "9.3",
    businessPreferred: false,
    technicalPreferred: true,
    similarExperienceScore: "7.2",
    otherScore: "1.3",
    performanceScore: "74",
    isOurCompany: false,
  },
  {
    companyName: "RC烛照建设",
    bidPrice: "903",
    netDiscountRate: "9.4",
    businessPreferred: true,
    technicalPreferred: true,
    similarExperienceScore: "6.4",
    otherScore: "1.5",
    performanceScore: "78",
    isOurCompany: true,
  },
  {
    companyName: "RC锦程装饰",
    bidPrice: "912",
    netDiscountRate: "10.4",
    businessPreferred: false,
    technicalPreferred: false,
    similarExperienceScore: "5.6",
    otherScore: "1.7",
    performanceScore: "82",
    isOurCompany: false,
  },
  {
    companyName: "RC环宇工程",
    bidPrice: "920",
    netDiscountRate: "12.6",
    businessPreferred: true,
    technicalPreferred: false,
    similarExperienceScore: "4.8",
    otherScore: "1.9",
    performanceScore: "86",
    isOurCompany: false,
  },
  {
    companyName: "RC盛景建设",
    bidPrice: "932",
    netDiscountRate: "13.9",
    businessPreferred: false,
    technicalPreferred: true,
    similarExperienceScore: "3.9",
    otherScore: "2.2",
    performanceScore: "90",
    isOurCompany: false,
  },
] as const satisfies readonly CandidateInput[];

async function fillCandidateRow(
  row: ReturnType<Page["locator"]>,
  candidate: CandidateInput,
  otherScore = candidate.otherScore,
) {
  await row.getByLabel(/单位名称$/).fill(candidate.companyName);
  await row.getByLabel(/投标总价$/).fill(candidate.bidPrice);
  await row.getByLabel(/净下浮率$/).fill(candidate.netDiscountRate);
  await row
    .getByLabel(/商务优$/)
    .selectOption(candidate.businessPreferred ? "1" : "0");
  await row
    .getByLabel(/技术优$/)
    .selectOption(candidate.technicalPreferred ? "1" : "0");
  await row.getByLabel(/同类业绩$/).fill(candidate.similarExperienceScore);
  await row.getByLabel(/其他主客观分$/).fill(otherScore);
}

function candidateRow(page: Page, companyName: string) {
  return page.locator(
    `tbody tr:has(input[value=${JSON.stringify(companyName)}])`,
  );
}

async function waitForCandidateSave(page: Page, companyName: string) {
  await page.getByText("候选单位信息", { exact: true }).click();
  await expect(candidateRow(page, companyName)).toHaveAttribute(
    "data-save-state",
    "saved",
  );
}

async function addCandidate(
  page: Page,
  candidate: CandidateInput,
  expectedCount: number,
) {
  await page.getByRole("button", { name: "新增行" }).first().click();
  const draftRow = page.locator('tbody tr[data-draft="true"]').last();
  await fillCandidateRow(draftRow, candidate);
  await waitForCandidateSave(page, candidate.companyName);
  const savedRow = candidateRow(page, candidate.companyName);
  if (candidate.isOurCompany) {
    await savedRow
      .getByRole("button", { name: `设为我方 ${candidate.companyName}` })
      .click();
    await expect(savedRow.getByText("我方", { exact: true })).toBeVisible();
  }
  await expect(page.getByText(`共 ${expectedCount} 家单位`)).toBeVisible();
}

async function pasteCandidates(
  page: Page,
  candidates: readonly CandidateInput[],
  expectedCount: number,
) {
  await page.getByRole("button", { name: "批量导入 / 粘贴数据" }).click();
  const dialog = page.getByRole("dialog", { name: "批量导入 / 粘贴数据" });
  const pastedText = candidates
    .map((candidate) =>
      [
        candidate.companyName,
        candidate.bidPrice,
        candidate.netDiscountRate,
        candidate.businessPreferred ? "有" : "无",
        candidate.technicalPreferred ? "有" : "无",
        candidate.similarExperienceScore,
        candidate.otherScore,
      ].join("\t"),
    )
    .join("\n");
  await dialog.getByLabel("粘贴候选单位数据").fill(pastedText);
  await expect(dialog.getByText("可导入")).toHaveCount(candidates.length);
  await dialog
    .getByRole("button", { name: `确认导入 ${candidates.length} 行` })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`共 ${expectedCount} 家单位`)).toBeVisible();
}

async function addPerformance(
  page: Page,
  companyName: string,
  score: string,
) {
  const performanceModule = page.getByTestId("performance-weighted-score");
  const input = page.getByLabel(`${companyName} 2026 Q1 履约分`);
  if ((await input.count()) === 0) {
    await performanceModule.getByRole("combobox", { name: "项目类型筛选" }).click();
    await page.getByRole("option", { name: "幕墙", exact: true }).click();
    await performanceModule.getByRole("button", { name: "从候选单位同步" }).click();
  }
  await input.fill(score);
}

const preflightCandidates = [
  ["preflight-c1", "前检查甲公司", "900"],
  ["preflight-c2", "前检查乙公司", "910"],
  ["preflight-c3", "前检查丙公司", "920"],
] as const;

async function seedPreflightProject(
  projectId: string,
  options?: {
    omitSettings?: boolean;
    invalidFirstBidPrice?: boolean;
    omitFirstPerformance?: boolean;
  },
) {
  const seededCandidates = preflightCandidates;
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.project.create({
    data: {
      id: projectId,
      name: `清标前检查 ${projectId}`,
      ...(options?.omitSettings
        ? {}
        : {
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
          }),
      candidates: {
        create: seededCandidates.map(([id, companyName, bidPrice], index) => ({
          id: `${projectId}-${id}`,
          companyName,
          bidPrice:
            index === 0 && options?.invalidFirstBidPrice ? "0" : bidPrice,
          netDiscountRate: "0.1",
          trademarkScore: "0",
          technicalScore: "0",
          similarExperienceScore: "5",
          otherScore: "5",
          isOurCompany: index === 0,
        })),
      },
    },
  });
  if (options?.omitSettings) {
    return;
  }
  await prisma.companyPerformance.createMany({
    data: seededCandidates.flatMap(([id, companyName], index) =>
      index === 0 && options?.omitFirstPerformance
        ? []
        : [
            {
              projectId,
              candidateId: `${projectId}-${id}`,
              companyName,
              projectType: "CURTAIN_WALL" as const,
              classificationLevel: "A",
              year: 2026,
              quarter: 2,
              score: String(80 + index),
            },
          ],
    ),
  });
  if (options?.omitFirstPerformance) {
    return;
  }
  const weighted = await saveSynchronizedPerformanceWeightedScores(projectId);
  expect(weighted.status).toBe("saved");
}

async function delayQingbiaoServerActions(page: Page) {
  let requestCount = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      requestCount += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
    }
    await route.continue();
  });
  return () => requestCount;
}

test("清标前检查定位缺失参数并可导航到参数设置", async ({ page }) => {
  const projectId = "e2e-qingbiao-preflight-settings";
  await seedPreflightProject(projectId, { omitSettings: true });

  await page.goto(`/projects/${projectId}/qingbiao`);
  const button = page.getByTestId("qingbiao-calculate-button");
  await expect(button).toBeEnabled();
  await button.click();
  const dialog = page.getByRole("dialog", { name: "暂不能进行清标测算" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "缺少：项目类型、最高投标限价、不可竞争费、总投标报价分值、排名递减扣分值",
  );
  await dialog.getByRole("link", { name: "前往参数设置" }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/settings`);
});

test("清标前检查一次显示候选和履约问题，修复后可再次执行", async ({
  page,
}) => {
  const projectId = "e2e-qingbiao-preflight-retry";
  await seedPreflightProject(projectId, {
    invalidFirstBidPrice: true,
    omitFirstPerformance: true,
  });
  const getRequestCount = await delayQingbiaoServerActions(page);

  await page.goto(`/projects/${projectId}/qingbiao`);
  const button = page.getByTestId("qingbiao-calculate-button");
  await button.click();
  const dialog = page.getByRole("dialog", { name: "暂不能进行清标测算" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("前检查甲公司");
  await expect(dialog).toContainText("投标总价必须是大于0的有效数字");
  await expect(dialog).toContainText("缺少“幕墙”履约数据");
  await expect(button).toHaveText("清标测算");
  await dialog.getByRole("button", { name: "关闭" }).click();

  await prisma.projectCandidate.update({
    where: { id: `${projectId}-preflight-c1` },
    data: { bidPrice: "900" },
  });
  await prisma.companyPerformance.create({
    data: {
      projectId,
      candidateId: `${projectId}-preflight-c1`,
      companyName: "前检查甲公司",
      projectType: "CURTAIN_WALL",
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: "80",
    },
  });
  const weighted = await saveSynchronizedPerformanceWeightedScores(projectId);
  expect(weighted.status).toBe("saved");

  await button.click();
  await expect(button).toHaveText("清标测算中...");
  await expect(page.getByText("清标测算完成，共生成16套清标场景。"))
    .toBeVisible();
  await expect(button).toHaveText("清标测算");
  await expect(page.getByRole("heading", { name: "清标测算表" })).toBeVisible();
  await expect(
    page.getByTestId("qingbiao-result-wide-table").locator("tbody tr"),
  ).toHaveCount(3);
  expect(getRequestCount()).toBe(2);
  expect(await prisma.qingbiaoScenario.count({ where: { projectId } })).toBe(16);
});

test("LAN hydration smoke：清标点击链与8家自动剔除结果", async ({ page }) => {
  const projectId = "e2e-automatic-exclusion-eight";
  const browserDiagnosticEvents: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("QINGBIAO_CLICK")) {
      browserDiagnosticEvents.push(message.text());
    }
  });
  const automaticCandidates = [
    ["auto-eight-c1", "自动规则A公司", "800"],
    ["auto-eight-c2", "自动规则B公司", "810"],
    ["auto-eight-c3", "自动规则C公司", "820"],
    ["auto-eight-c4", "自动规则D公司", "830"],
    ["auto-eight-c5", "自动规则E公司", "840"],
    ["auto-eight-c6", "自动规则F公司", "850"],
    ["auto-eight-c7", "自动规则G公司", "860"],
    ["auto-eight-c8", "自动规则H公司", "870"],
  ] as const;

  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.project.create({
    data: {
      id: projectId,
      name: "8家候选自动推优规则验收项目",
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
      candidates: {
        create: automaticCandidates.map(([id, companyName, bidPrice], index) => ({
          id,
          companyName,
          bidPrice,
          netDiscountRate: `0.${String(10 + index).padStart(2, "0")}`,
          trademarkScore: "0",
          technicalScore: "0",
          similarExperienceScore: "5",
          otherScore: "5",
          isOurCompany: index === 3,
        })),
      },
    },
  });
  await prisma.companyPerformance.createMany({
    data: automaticCandidates.map(([id, companyName], index) => ({
      projectId,
      candidateId: id,
      companyName,
      projectType: "CURTAIN_WALL" as const,
      classificationLevel: "A",
      year: 2026,
      quarter: 2,
      score: String(80 + index),
    })),
  });
  const weighted = await saveSynchronizedPerformanceWeightedScores(projectId);
  expect(weighted.status).toBe("saved");

  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(page.getByText("当前尚未生成清标结论，请先进行清标测算。"))
    .toBeVisible();
  await expect(
    page.getByTestId("qingbiao-entry-guarantee-not_calculated"),
  ).toContainText("当前尚未完成清标测算");
  await expect(page.getByRole("button", { name: "保存剔除配置" }))
    .toHaveCount(0);
  const expectedBefore = [
    ["自动规则H公司"],
    ["自动规则H公司", "自动规则G公司"],
    ["自动规则H公司", "自动规则G公司", "自动规则F公司"],
    ["自动规则H公司", "自动规则G公司"],
  ] as const;
  for (const [offset, companyNames] of expectedBefore.entries()) {
    const card = page.getByTestId(`automatic-exclusion-rule-${offset + 1}`);
    await expect(card).toContainText(`自动剔除 ${companyNames.length} 家`);
    for (const companyName of companyNames) {
      await expect(card).toContainText(companyName);
    }
  }

  await page.goto(`/projects/${projectId}/candidates`);
  const candidateA = candidateRow(page, "自动规则A公司");
  await candidateA.getByLabel(/投标总价$/).fill("900");
  await waitForCandidateSave(page, "自动规则A公司");
  await page.goto(`/projects/${projectId}/qingbiao`);
  const refreshedRuleOne = page.getByTestId("automatic-exclusion-rule-1");
  await expect(refreshedRuleOne).toContainText("自动规则A公司");
  await expect(refreshedRuleOne).not.toContainText("自动规则H公司");

  const getRequestCount = await delayQingbiaoServerActions(page);
  const calculateButton = page.getByTestId("qingbiao-calculate-button");
  expect(await prisma.qingbiaoScenario.count({ where: { projectId } })).toBe(0);
  await calculateButton.click();
  await expect(calculateButton).toHaveText("清标测算中...");
  await expect.poll(getRequestCount).toBe(1);
  await expect.poll(() => browserDiagnosticEvents.length).toBe(1);
  await expect(page.getByText("清标测算完成，共生成16套清标场景。"))
    .toBeVisible();
  await expect(calculateButton).toHaveText("清标测算");
  await expect(page.getByRole("heading", { name: "清标测算表" }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "清标测算结论" }))
    .toBeVisible();
  const entryGuarantee = page.getByTestId("qingbiao-entry-guarantee");
  await expect(
    entryGuarantee.getByRole("heading", {
      name: "广田全场景入围保障测算",
    }),
  ).toBeVisible();
  await expect(
    entryGuarantee.getByTestId("qingbiao-entry-guarantee-table"),
  ).toBeVisible();
  await expect(
    entryGuarantee
      .getByTestId("qingbiao-entry-guarantee-table")
      .locator("tbody tr"),
  ).toHaveCount(16);
  for (const ruleIndex of [1, 2, 3, 4]) {
    const conclusion = page.getByTestId(
      `qingbiao-conclusion-rule-${ruleIndex}`,
    );
    await expect(conclusion).toBeVisible();
    await expect(conclusion.locator("li")).toHaveCount(4);
    for (const qingbiaoK2Value of [0, 1, 2, 3]) {
      await expect(
        conclusion.getByTestId(
          `qingbiao-conclusion-rule-${ruleIndex}-k2-${qingbiaoK2Value}`,
        ),
      ).toContainText(`K2=${qingbiaoK2Value}%`);
    }
  }
  await expect(page.getByTestId("qingbiao-all-scenario-entrants"))
    .toBeVisible();
  await expect(page.getByTestId("qingbiao-conclusion-our-company").first())
    .toHaveClass(/text-red-600/);
  await expect(page.getByRole("tab")).toHaveCount(7);
  await expect(
    page.getByRole("tab", {
      name: "推优单位随机剔除（1名最高报价投标人）",
      selected: true,
    }),
  ).toBeVisible();
  const wideTable = page.getByTestId("qingbiao-result-wide-table");
  await expect(wideTable.locator("tbody tr")).toHaveCount(8);
  await expect(
    wideTable.locator("thead tr").first().getByRole("columnheader").allTextContents(),
  ).resolves.toEqual([
    "序号",
    "单位名称",
    "投标总价（万元）",
    "净下浮率",
    "商务优",
    "技术优",
    "总投标报价分值",
    "履约加权平均分",
    "履约得分",
    "同类业绩",
    "其他主客观分",
    "平均值 K1",
    "清标 K2 对应总分",
    "假如抽中 0%",
    "假如抽中 1%",
    "假如抽中 2%",
    "假如抽中 3%",
  ]);
  await expect(wideTable.getByRole("columnheader", { name: "清标 K2 对应总分" }))
    .toBeVisible();
  for (const qingbiaoK2Value of [0, 1, 2, 3]) {
    await expect(
      wideTable.getByRole("columnheader", {
        name: `假如抽中 ${qingbiaoK2Value}%`,
      }),
    ).toBeVisible();
  }
  await expect(
    wideTable.locator("thead tr").nth(1).getByRole("columnheader").allTextContents(),
  ).resolves.toEqual([
    "0%",
    "1%",
    "2%",
    "3%",
    ...Array.from({ length: 4 }, () => ["B值", "差值", "排序", "分数"]).flat(),
  ]);
  const scrollContainer = wideTable.locator("..");
  await expect
    .poll(() =>
      scrollContainer.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    )
    .toBe(true);
  await scrollContainer.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => scrollContainer.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const ruleTabExpectations = [
    {
      name: "推优单位随机剔除（2名较高报价投标人）",
      excluded: "自动规则A公司、自动规则H公司",
    },
    {
      name: "推优单位随机剔除（1/3 较高报价投标人）",
      excluded: "自动规则A公司、自动规则H公司、自动规则G公司",
    },
    {
      name: "推优单位随机剔除（1/4 较高报价投标人）",
      excluded: "自动规则A公司、自动规则H公司",
    },
  ] as const;
  for (const expectation of ruleTabExpectations) {
    await page.getByRole("tab", { name: expectation.name }).click();
    const explanation = page.getByTestId("qingbiao-current-rule-explanation");
    await expect(explanation).toContainText(expectation.name);
    await expect(explanation).toContainText(expectation.excluded);
  }
  expect(await prisma.qingbiaoScenario.count({ where: { projectId } })).toBe(16);
  expect(
    await prisma.qingbiaoResult.count({ where: { scenario: { projectId } } }),
  ).toBe(128);

  await prisma.qingbiaoScenario.updateMany({
    where: { projectId },
    data: { version: 2, ruleVersion: QINGBIAO_20260820_RULE_VERSION },
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "清标测算表" })).toHaveCount(0);
  await expect(page.getByText("当前尚未生成清标结论，请先进行清标测算。"))
    .toBeVisible();
  await expect(page.getByTestId("qingbiao-conclusion-rule-1")).toHaveCount(0);

  const recalculateButton = page.getByTestId("qingbiao-calculate-button");
  await recalculateButton.click();
  await expect(recalculateButton).toHaveText("清标测算中...");
  await expect(page.getByText("清标测算完成，共生成16套清标场景。"))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "清标测算表" }))
    .toBeVisible();
  await expect(page.getByTestId("qingbiao-conclusion-rule-1")).toBeVisible();
  expect(getRequestCount()).toBe(2);
  expect(await prisma.qingbiaoScenario.count({ where: { projectId } })).toBe(16);
  expect(
    await prisma.qingbiaoResult.count({ where: { scenario: { projectId } } }),
  ).toBe(128);
  expect(
    await prisma.qingbiaoScenario.count({
      where: {
        projectId,
        version: 1,
        ruleVersion: CURRENT_QINGBIAO_RULE_VERSION,
      },
    }),
  ).toBe(16);
});

test.skip("旧履约明细五条件筛选（矩阵结构已正式替代）", async ({ page }) => {
  const companyName = golden.candidates[0].companyName;
  const totalRecordCount =
    golden.candidates.length * golden.performanceQuarters.length;
  const performanceRows = page.locator("tbody tr").filter({
    has: page.locator('button[aria-label^="操作 "]'),
  });

  await page.goto(`/projects/${golden.project.id}/performance`);
  const filterBar = page.getByTestId("performance-filters");
  await expect(filterBar.getByRole("combobox", { name: "年度" })).toBeVisible();
  await expect(filterBar.getByRole("combobox", { name: "季度" })).toBeVisible();
  const projectTypeFilter = filterBar.getByRole("combobox", {
    name: "项目类型",
  });
  await expect(projectTypeFilter).toBeVisible();
  await expect(
    filterBar.getByRole("combobox", { name: "履约单位" }),
  ).toBeVisible();
  await expect(filterBar.getByRole("textbox", { name: "关键词搜索" })).toBeVisible();
  await expect(
    page.getByText(`当前筛选共 ${totalRecordCount} 条记录`),
  ).toBeVisible();
  await expect(performanceRows).toHaveCount(totalRecordCount);

  await filterBar.getByRole("combobox", { name: "年度" }).click();
  await page.getByRole("option", { name: "2025", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("year")).toBe("2025");
  await expect(page.getByText("当前筛选共 24 条记录")).toBeVisible();
  await expect(performanceRows).toHaveCount(24);

  await filterBar.getByRole("combobox", { name: "季度" }).click();
  await page.getByRole("option", { name: "第二季度", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("quarter")).toBe("2");
  await expect(page.getByText("当前筛选共 6 条记录")).toBeVisible();
  await expect(performanceRows).toHaveCount(6);

  await projectTypeFilter.click();
  await expect(
    page.getByRole("option", { name: "幕墙", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "幕墙", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectType"))
    .toBe("CURTAIN_WALL");
  await expect(page.getByText("当前筛选共 6 条记录")).toBeVisible();
  await expect(performanceRows).toHaveCount(6);

  await filterBar.getByRole("combobox", { name: "履约单位" }).click();
  await page.getByRole("option", { name: companyName, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("company")).toBe(
    companyName,
  );
  await expect(page.getByText("当前筛选共 1 条记录")).toBeVisible();
  await expect(performanceRows).toHaveCount(1);
  await expect(performanceRows.first()).toContainText(companyName);
  await expect(performanceRows.first()).toContainText("第二季度");

  const keywordSearch = filterBar.getByRole("textbox", { name: "关键词搜索" });
  await keywordSearch.fill("  幕墙  ");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("幕墙");
  await expect(page.getByText("当前筛选共 1 条记录")).toBeVisible();
  await expect(performanceRows).toHaveCount(1);

  await keywordSearch.fill("实验室");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(
    "实验室",
  );
  await expect(page.getByText("当前筛选共 0 条记录")).toBeVisible();
  await expect(page.getByText("当前筛选条件下暂无履约记录。")).toBeVisible();
  await expect(page.getByRole("button", { name: "重置筛选" })).toBeVisible();

  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(projectTypeFilter).toContainText("全部项目类型");
  await expect(
    page.getByText(`当前筛选共 ${totalRecordCount} 条记录`),
  ).toBeVisible();
  await expect(performanceRows).toHaveCount(totalRecordCount);

  await page.goto(`/projects/${golden.project.id}/analysis`);
  await expect(page.getByText("69/144", { exact: true }).first()).toBeVisible();
});

test.skip("旧季度归档一览（矩阵结构已正式替代）", async ({ page }) => {
  const fixtureQuarters = [
    { year: 2025, quarter: 3, recordCount: 4, archived: true },
    { year: 2025, quarter: 4, recordCount: 7, archived: true },
    { year: 2026, quarter: 1, recordCount: 8, archived: true },
    { year: 2026, quarter: 2, recordCount: 7, archived: false },
  ] as const;
  const fixtureWhere = {
    projectId: golden.project.id,
    OR: fixtureQuarters.map(({ year, quarter }) => ({ year, quarter })),
  };
  const originalArchives = await prisma.performanceQuarterArchive.findMany({
    where: fixtureWhere,
  });

  try {
    await prisma.performanceQuarterArchive.deleteMany({ where: fixtureWhere });
    await prisma.performanceQuarterArchive.createMany({
      data: fixtureQuarters
        .filter(({ archived }) => archived)
        .map(({ year, quarter }) => ({
          projectId: golden.project.id,
          year,
          quarter,
        })),
    });

    const selectedCompany = golden.candidates[0].companyName;
    await page.goto(
      `/projects/${golden.project.id}/performance?projectType=CURTAIN_WALL&company=${encodeURIComponent(selectedCompany)}&q=${encodeURIComponent("幕墙")}`,
    );
    const overview = page.getByTestId("performance-quarter-overview");
    await expect(
      overview.getByText("已保存 3 个季度 · 共 18 条评分记录（永久保存）"),
    ).toBeVisible();
    await expect(
      overview.getByRole("button", {
        name: "2025年第三季度，已保存，6条",
      }),
    ).toBeVisible();
    const savedQuarter = overview.getByRole("button", {
      name: "2025年第四季度，已保存，6条",
    });
    await expect(savedQuarter).toBeVisible();
    await expect(
      overview.getByRole("button", {
        name: "2026年第一季度，已保存，6条",
      }),
    ).toBeVisible();
    const pendingQuarter = overview.getByRole("button", {
      name: "2026年第二季度，待保存，6条",
    });
    await expect(pendingQuarter).toBeVisible();
    await expect(
      overview.getByRole("button", { name: "2026年第三季度，暂无数据" }),
    ).toBeVisible();

    await savedQuarter.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("year")).toBe(
      "2025",
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("quarter"))
      .toBe("4");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("company"))
      .toBe(selectedCompany);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(
      "幕墙",
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("projectType"))
      .toBe("CURTAIN_WALL");
    await expect(savedQuarter).toHaveAttribute("aria-pressed", "true");
    const filterBar = page.getByTestId("performance-filters");
    await expect(filterBar.getByRole("combobox", { name: "年度" })).toContainText(
      "2025",
    );
    await expect(filterBar.getByRole("combobox", { name: "季度" })).toContainText(
      "第四季度",
    );
    const detailRows = page.locator("tbody tr").filter({
      has: page.locator('button[aria-label^="操作 "]'),
    });
    await expect(detailRows).toHaveCount(1);
    await expect(detailRows.first()).toContainText(selectedCompany);

    await pendingQuarter.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("quarter"))
      .toBe("2");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("company"))
      .toBe(selectedCompany);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(
      "幕墙",
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("projectType"))
      .toBe("CURTAIN_WALL");
    await overview.getByRole("button", { name: "保存本季度评分" }).click();
    await expect(
      overview.getByText("已保存 4 个季度 · 共 24 条评分记录（永久保存）"),
    ).toBeVisible();
    await expect(
      overview.getByRole("button", {
        name: "2026年第二季度，已保存，6条",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto(`/projects/${golden.project.id}/analysis`);
    await expect(page.getByText("69/144", { exact: true }).first()).toBeVisible();
  } finally {
    await prisma.performanceQuarterArchive.deleteMany({ where: fixtureWhere });
    if (originalArchives.length > 0) {
      await prisma.performanceQuarterArchive.createMany({
        data: originalArchives,
      });
    }
  }
});

test("真实用户可从新建项目完成清标、定标和全场景分析", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "新建项目" })).toBeVisible();

  await page.getByLabel("项目名称").fill(acceptanceProjectName);
  await page.getByLabel("最高投标限价").fill("1000");
  await page.getByLabel("不可竞争费").fill("100");
  await page.getByRole("checkbox", { name: "幕墙" }).check();
  await page.getByRole("checkbox", { name: "装修" }).check();
  await page.getByLabel("总投标报价分值").fill("40");
  await page.getByLabel("排名递减扣分值").fill("2");
  await page.getByLabel("定标抽值1").fill("0");
  await page.getByLabel("定标抽值2").fill("1");
  await page.getByLabel("定标抽值3").fill("2");
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.waitForURL(/\/projects\/[^/]+\/settings$/);
  const projectId = new URL(page.url()).pathname.split("/")[2];
  expect(projectId).toBeTruthy();

  await page.reload();
  await expect(page.getByLabel("项目名称")).toHaveValue(
    acceptanceProjectName,
  );
  await expect(page.getByLabel("定标抽值2")).toHaveValue("1");
  await expect(page.getByLabel("定标抽值3")).toHaveValue("2");
  const qingbiaoParameterCard = page
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByText("2 · 清标参数设置", { exact: true }),
    });
  await expect(qingbiaoParameterCard.locator("label").allTextContents()).resolves.toEqual([
    "清标抽值1",
    "清标抽值2",
    "清标抽值3",
    "清标抽值4",
    "总投标报价分值",
    "同类业绩分值",
    "其他主客观分值",
    "排名递减扣分值",
  ]);
  const qingbiaoDrawValue1 = page.getByLabel("清标抽值1");
  const qingbiaoDrawValue2 = page.getByLabel("清标抽值2");
  const qingbiaoDrawValue3 = page.getByLabel("清标抽值3");
  const qingbiaoDrawValue4 = page.getByLabel("清标抽值4");
  const similarExperienceParameter = page.getByLabel("同类业绩分值");
  const otherScoreParameter = page.getByLabel("其他主客观分值");
  await expect(qingbiaoDrawValue1).toHaveValue("0");
  await expect(qingbiaoDrawValue2).toHaveValue("1");
  await expect(qingbiaoDrawValue3).toHaveValue("2");
  await expect(qingbiaoDrawValue4).toHaveValue("3");
  await qingbiaoDrawValue1.fill("0.5");
  await qingbiaoDrawValue2.fill("1.5");
  await qingbiaoDrawValue3.fill("2.5");
  await qingbiaoDrawValue4.fill("3.5");
  await page.getByLabel("总投标报价分值").fill("42");
  await similarExperienceParameter.fill("11");
  await otherScoreParameter.fill("9");
  await page.getByLabel("排名递减扣分值").fill("1.5");
  await page.getByRole("button", { name: "保存参数" }).click();
  await page.reload();
  await expect(qingbiaoDrawValue1).toHaveValue("0.5");
  await expect(qingbiaoDrawValue2).toHaveValue("1.5");
  await expect(qingbiaoDrawValue3).toHaveValue("2.5");
  await expect(qingbiaoDrawValue4).toHaveValue("3.5");
  await expect(page.getByLabel("总投标报价分值")).toHaveValue("42");
  await expect(similarExperienceParameter).toHaveValue("11");
  await expect(otherScoreParameter).toHaveValue("9");
  await expect(page.getByLabel("排名递减扣分值")).toHaveValue("1.5");

  await qingbiaoDrawValue1.fill("0");
  await qingbiaoDrawValue2.fill("1");
  await qingbiaoDrawValue3.fill("2");
  await qingbiaoDrawValue4.fill("3");
  await page.getByLabel("总投标报价分值").fill("40");
  await similarExperienceParameter.fill("0");
  await otherScoreParameter.fill("0");
  await page.getByLabel("排名递减扣分值").fill("2");
  await page.getByRole("button", { name: "保存参数" }).click();
  await page.reload();
  const curtainWallType = page.getByRole("checkbox", { name: "幕墙" });
  const decorationType = page.getByRole("checkbox", { name: "装修" });
  const generalContractType = page.getByRole("checkbox", { name: "总包" });
  const laboratoryType = page.getByRole("checkbox", { name: "实验室" });
  await expect(curtainWallType).toBeChecked();
  await expect(decorationType).toBeChecked();
  await expect(generalContractType).not.toBeChecked();
  await expect(laboratoryType).not.toBeChecked();

  await curtainWallType.uncheck();
  await decorationType.uncheck();
  await page.getByRole("button", { name: "保存参数" }).click();
  await expect(page.getByText("请至少选择一种项目类型")).toBeVisible();
  await expect(laboratoryType).toBeEnabled();
  await curtainWallType.check();
  await decorationType.check();
  await laboratoryType.check();
  await curtainWallType.uncheck();
  await page.getByLabel("定标抽值2").fill("1.5");
  await expect(decorationType).toBeChecked();
  await expect(laboratoryType).toBeChecked();
  await expect(curtainWallType).not.toBeChecked();
  await page.getByRole("button", { name: "保存参数" }).click();
  await expect(page.getByText("所有修改均已保存")).toBeVisible();
  await page.reload();
  await expect(decorationType).toBeChecked();
  await expect(laboratoryType).toBeChecked();
  await expect(curtainWallType).not.toBeChecked();
  await expect(generalContractType).not.toBeChecked();
  await expect(page.getByLabel("定标抽值2")).toHaveValue("1.5");

  await generalContractType.check();
  await page.getByLabel("定标抽值2").fill("1.25");
  await page.getByRole("button", { name: "保存参数" }).click();
  await page.reload();
  await expect(decorationType).toBeChecked();
  await expect(generalContractType).toBeChecked();
  await expect(laboratoryType).toBeChecked();
  await expect(page.getByLabel("定标抽值2")).toHaveValue("1.25");

  await curtainWallType.check();
  await decorationType.uncheck();
  await generalContractType.uncheck();
  await laboratoryType.uncheck();
  await page.getByLabel("定标抽值2").fill("1");
  await page.getByRole("button", { name: "保存参数" }).click();
  await page.reload();
  await expect(curtainWallType).toBeChecked();
  await expect(decorationType).not.toBeChecked();
  await expect(generalContractType).not.toBeChecked();
  await expect(laboratoryType).not.toBeChecked();

  await page.goto("/projects");
  const projectRow = page
    .getByRole("row")
    .filter({ hasText: acceptanceProjectName });
  await expect(projectRow).toBeVisible();
  await projectRow.getByRole("link", { name: "进入项目" }).click();
  await page.waitForURL(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: "项目概览" })).toBeVisible();
  await expect(page.getByText(new RegExp(acceptanceProjectName)).first())
    .toBeVisible();

  await page.goto(`/projects/${projectId}/candidates`);
  await expect(page.getByRole("columnheader").allTextContents()).resolves.toEqual([
    "序号",
    "单位名称",
    "投标总价（万元）",
    "净下浮率",
    "商务优",
    "技术优",
    "同类业绩",
    "其他主客观分",
    "操作",
  ]);

  const inlineContractCandidate: CandidateInput = {
    companyName: "RC行内录入测试",
    bidPrice: "9860.5",
    netDiscountRate: "17.8",
    businessPreferred: true,
    technicalPreferred: false,
    similarExperienceScore: "8",
    otherScore: "12",
    performanceScore: "0",
    isOurCompany: false,
  };
  await addCandidate(page, inlineContractCandidate, 1);
  await page.reload();
  const inlineContractRow = candidateRow(
    page,
    inlineContractCandidate.companyName,
  );
  await expect(inlineContractRow.getByLabel(/净下浮率$/)).toHaveValue("17.8");
  await expect(inlineContractRow.getByLabel(/商务优$/)).toHaveValue("1");
  await expect(inlineContractRow.getByLabel(/技术优$/)).toHaveValue("0");
  await inlineContractRow
    .getByRole("button", { name: `删除 ${inlineContractCandidate.companyName}` })
    .click();
  let deleteDialog = page.getByRole("dialog", { name: "删除候选单位" });
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(page.getByText("共 0 家单位")).toBeVisible();

  await page.getByRole("button", { name: "批量导入 / 粘贴数据" }).click();
  const invalidImportDialog = page.getByRole("dialog", {
    name: "批量导入 / 粘贴数据",
  });
  await invalidImportDialog
    .getByLabel("粘贴候选单位数据")
    .fill("\t非法报价\t101\t未知\t有\t业绩\t-1");
  await expect(
    invalidImportDialog.getByRole("button", { name: "确认导入 1 行" }),
  ).toBeDisabled();
  await invalidImportDialog.getByRole("button", { name: "取消" }).click();
  await expect(invalidImportDialog).toBeHidden();
  await expect(page.getByText("共 0 家单位")).toBeVisible();

  for (const [index, candidate] of candidateInputs.slice(0, 4).entries()) {
    await addCandidate(page, candidate, index + 1);
  }
  await pasteCandidates(page, candidateInputs.slice(4), 6);

  const candidateTableRows = page.locator('tbody tr[data-draft="false"]');
  await expect(candidateTableRows).toHaveCount(6);
  for (const [index, sequence] of ["1", "2", "3", "4", "5", "6"].entries()) {
    await expect(candidateTableRows.nth(index).getByRole("cell").first()).toHaveText(
      sequence,
    );
  }

  await page.reload();
  const firstCandidateRow = candidateRow(page, candidateInputs[0].companyName);
  await expect(firstCandidateRow.getByLabel(/净下浮率$/)).toHaveValue("10.38");
  await expect(firstCandidateRow.getByLabel(/商务优$/)).toHaveValue("1");
  await expect(firstCandidateRow.getByLabel(/技术优$/)).toHaveValue("0");
  await expect(firstCandidateRow).toBeVisible();
  await expect(
    candidateRow(page, candidateInputs[2].companyName).getByText("我方", {
      exact: true,
    }),
  ).toBeVisible();

  let editableRow = candidateRow(page, candidateInputs[5].companyName);
  await editableRow.getByLabel(/其他主客观分$/).fill("2.3");
  await waitForCandidateSave(page, candidateInputs[5].companyName);
  await expect(editableRow.getByLabel(/其他主客观分$/)).toHaveValue("2.3");
  await editableRow.getByLabel(/其他主客观分$/).fill("2.4");
  await waitForCandidateSave(page, candidateInputs[5].companyName);
  await page.reload();
  editableRow = candidateRow(page, candidateInputs[5].companyName);
  await expect(editableRow.getByLabel(/其他主客观分$/)).toHaveValue("2.4");

  await editableRow
    .getByRole("button", { name: `删除 ${candidateInputs[5].companyName}` })
    .click();
  deleteDialog = page.getByRole("dialog", { name: "删除候选单位" });
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(
    page.locator(`input[value=${JSON.stringify(candidateInputs[5].companyName)}]`),
  ).toHaveCount(0);
  await expect(page.getByText("共 5 家单位")).toBeVisible();
  await addCandidate(page, candidateInputs[5], 6);

  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(page.getByText(/还有 \d+ 项信息需要完善/)).toBeVisible();
  const blockedCalculateButton = page.getByTestId("qingbiao-calculate-button");
  await expect(blockedCalculateButton).toBeEnabled();
  await blockedCalculateButton.click();
  const readinessDialog = page.getByRole("dialog", {
    name: "暂不能进行清标测算",
  });
  await expect(readinessDialog).toContainText("单位履约加权分尚未保存");
  await expect(readinessDialog).toContainText(candidateInputs[0].companyName);
  await readinessDialog.getByRole("button", { name: "关闭" }).click();

  await page.goto(`/projects/${projectId}/performance`);
  for (const candidate of candidateInputs) {
    await addPerformance(page, candidate.companyName, candidate.performanceScore);
  }
  const weightedModule = page.getByTestId("performance-weighted-score");
  await expect(weightedModule.getByText("已配置 6 行", { exact: false })).toBeVisible();
  await weightedModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(weightedModule.getByText("已保存 · 6 行", { exact: true })).toBeVisible();

  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(page.getByRole("button", { name: "保存剔除配置" }))
    .toHaveCount(0);
  const expectedAutomaticExclusions = [
    [candidateInputs[5].companyName],
    [candidateInputs[5].companyName, candidateInputs[4].companyName],
    [candidateInputs[5].companyName, candidateInputs[4].companyName],
    [candidateInputs[5].companyName, candidateInputs[4].companyName],
  ] as const;
  for (const [offset, companyNames] of expectedAutomaticExclusions.entries()) {
    const card = page.getByTestId(`automatic-exclusion-rule-${offset + 1}`);
    await expect(card).toContainText(`自动剔除 ${companyNames.length} 家`);
    for (const companyName of companyNames) {
      await expect(card).toContainText(companyName);
    }
  }
  await expect(page.getByText("清标测算条件已满足"))
    .toBeVisible();

  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(page.getByRole("heading", { name: "清标测算表" }))
    .toBeVisible();
  const resultTable = page.getByTestId("qingbiao-result-wide-table");
  const resultRows = resultTable.locator("tbody tr");
  await expect(resultRows).toHaveCount(6);
  await expect(resultRows.first()).toContainText("10.67%");
  await expect(resultRows.first()).toContainText("904.00 万元");
  await page.getByRole("tab", {
    name: "推优单位随机剔除（1/3 较高报价投标人）",
  }).click();
  await expect(page.getByTestId("qingbiao-current-rule-explanation"))
    .toContainText(candidateInputs[5].companyName);
  await expect(resultRows.first()).toContainText("9.50%");
  await expect(resultRows.first()).toContainText("896.50 万元");

  await page.goto(`/projects/${projectId}/candidates`);
  editableRow = candidateRow(page, candidateInputs[0].companyName);
  await editableRow.getByLabel(/投标总价$/).fill("940");
  await waitForCandidateSave(page, candidateInputs[0].companyName);
  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(
    page.getByText(
      "候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("当前清标结果已过期，请重新进行清标测算后查看结论。"),
  ).toBeVisible();
  await expect(page.getByTestId("qingbiao-conclusion-rule-1")).toHaveCount(0);
  const refreshedRuleOne = page.getByTestId("automatic-exclusion-rule-1");
  await expect(refreshedRuleOne).toContainText(candidateInputs[0].companyName);
  await expect(refreshedRuleOne).not.toContainText(
    candidateInputs[5].companyName,
  );
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(resultRows).toHaveCount(6);
  await expect(page.getByTestId("qingbiao-conclusion-rule-1")).toBeVisible();

  await page.goto(`/projects/${projectId}/settings`);
  await expect(decorationType).toBeDisabled();
  await page.getByRole("button", { name: "修改项目类型" }).click();
  let projectTypeDialog = page.getByRole("dialog", { name: "修改项目类型" });
  await expect(projectTypeDialog).toContainText("已有测算结果将被标记为已过期");
  await projectTypeDialog.getByRole("button", { name: "继续修改" }).click();
  await decorationType.check();
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(
    page.getByText(
      "候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("qingbiao-weighted-performance-warning"))
    .toContainText("单位履约加权分已过期");
  await expect(
    page
      .getByTestId("qingbiao-result-wide-table")
      .locator("tbody")
      .getByText("—", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/settings`);
  await page.getByRole("button", { name: "修改项目类型" }).click();
  projectTypeDialog = page.getByRole("dialog", { name: "修改项目类型" });
  await projectTypeDialog.getByRole("button", { name: "继续修改" }).click();
  await decorationType.uncheck();
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.goto(`/projects/${projectId}/performance`);
  await expect(weightedModule.getByText("已过期 · 请核对并保存", { exact: true })).toBeVisible();
  await weightedModule.getByRole("button", { name: "保存", exact: true }).click();
  await expect(weightedModule.getByText("已保存 · 6 行", { exact: true })).toBeVisible();
  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(
    page.getByText(
      "候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。",
    ),
  ).toBeVisible();
  await expect(page.getByTestId("qingbiao-weighted-performance-warning"))
    .toHaveCount(0);
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(resultRows).toHaveCount(6);

  await page.goto(`/projects/${projectId}/candidates`);
  editableRow = candidateRow(page, candidateInputs[5].companyName);
  await editableRow.getByLabel(/其他主客观分$/).fill("2.3");
  await waitForCandidateSave(page, candidateInputs[5].companyName);
  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(
    page.getByText(
      "候选报价、项目参数或候选单位已修改，以下结果已过期，请重新进行清标测算。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "清标测算", exact: true }).click();
  await expect(resultRows).toHaveCount(6);

  await page.goto(`/projects/${projectId}/dingbiao`);
  await page.getByLabel("选择清标来源场景").click();
  await page.getByRole("option", { name: "规则3 · K2=2.00%" }).click();
  await expect(page.getByText("已锁定规则3 / K2=2.00% 的有序结果。"))
    .toBeVisible();
  await page.getByRole("button", { name: "开始定标预测" }).click();
  await expect(page.getByText("定标预测结果矩阵", { exact: true }))
    .toBeVisible();
  for (const finalistCount of [5, 4, 3]) {
    await expect(
      page.getByRole("cell", { name: new RegExp(`^N=${finalistCount}`) }),
    ).toBeVisible();
  }
  await expect(page.getByRole("columnheader", { name: "抽值1" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "抽值2" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "抽值3" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("定标预测结果矩阵", { exact: true }))
    .toBeVisible();

  await page.goto(`/projects/${projectId}/analysis`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "运行全场景分析" }).click();
  await expect(page.getByText(/144\/144 个当前有效结果/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("16 套清标来源矩阵")).toBeVisible();
  await expect(page.getByText("定标胜出单位分布")).toBeVisible();
  await expect(page.getByText("主要竞争对手", { exact: true }).first())
    .toBeVisible();
  await expect(page.getByText("按推优规则")).toBeVisible();
  await expect(page.getByText("按清标 K2")).toBeVisible();
  await expect(page.getByText("按入围单位数 N")).toBeVisible();
  await expect(page.getByText("按定标抽值序号")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("真实中标概率");
  await expect(page.locator("body")).not.toContainText("AI中标概率");
});

import { expect, type Locator, type Page, test } from "@playwright/test";

const acceptanceProjectName = "RC浏览器全流程验收项目";
const candidateInputs = [
  {
    companyName: "RC华辰建设",
    bidPrice: "884",
    netDiscountRate: "10.38",
    trademarkScore: "100",
    technicalScore: "200",
    similarExperienceScore: "8.1",
    otherScore: "1.1",
    performanceScore: "70",
    isOurCompany: false,
  },
  {
    companyName: "RC远景工程",
    bidPrice: "895",
    netDiscountRate: "9.3",
    trademarkScore: "90",
    technicalScore: "190",
    similarExperienceScore: "7.2",
    otherScore: "1.3",
    performanceScore: "74",
    isOurCompany: false,
  },
  {
    companyName: "RC烛照建设",
    bidPrice: "903",
    netDiscountRate: "9.4",
    trademarkScore: "80",
    technicalScore: "180",
    similarExperienceScore: "6.4",
    otherScore: "1.5",
    performanceScore: "78",
    isOurCompany: true,
  },
  {
    companyName: "RC锦程装饰",
    bidPrice: "912",
    netDiscountRate: "10.4",
    trademarkScore: "70",
    technicalScore: "170",
    similarExperienceScore: "5.6",
    otherScore: "1.7",
    performanceScore: "82",
    isOurCompany: false,
  },
  {
    companyName: "RC环宇工程",
    bidPrice: "920",
    netDiscountRate: "12.6",
    trademarkScore: "60",
    technicalScore: "160",
    similarExperienceScore: "4.8",
    otherScore: "1.9",
    performanceScore: "86",
    isOurCompany: false,
  },
  {
    companyName: "RC盛景建设",
    bidPrice: "932",
    netDiscountRate: "13.9",
    trademarkScore: "50",
    technicalScore: "150",
    similarExperienceScore: "3.9",
    otherScore: "2.2",
    performanceScore: "90",
    isOurCompany: false,
  },
] as const;

type CandidateInput = (typeof candidateInputs)[number];

async function fillCandidateDialog(
  dialog: Locator,
  candidate: CandidateInput,
  otherScore = candidate.otherScore,
) {
  await dialog.getByLabel("单位名称").fill(candidate.companyName);
  await dialog.getByLabel("投标总价").fill(candidate.bidPrice);
  await dialog.getByLabel("净下浮率").fill(candidate.netDiscountRate);
  await dialog.getByLabel("商标优").fill(candidate.trademarkScore);
  await dialog.getByLabel("技术优").fill(candidate.technicalScore);
  await dialog
    .getByLabel("同类业绩")
    .fill(candidate.similarExperienceScore);
  await dialog.getByLabel("其他主客观分").fill(otherScore);
  const ourCompanyCheckbox = dialog.getByRole("checkbox", {
    name: /设置为我方单位/,
  });
  if (candidate.isOurCompany !== (await ourCompanyCheckbox.isChecked())) {
    await ourCompanyCheckbox.click();
  }
}

async function addCandidate(page: Page, candidate: CandidateInput) {
  await page
    .getByRole("button", { name: "新增候选单位" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "新增候选单位" });
  await fillCandidateDialog(dialog, candidate);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: candidate.companyName }),
  ).toBeVisible();
}

async function openCandidateEditor(page: Page, companyName: string) {
  await page.getByRole("button", { name: `操作 ${companyName}` }).click();
  await page.getByRole("menuitem", { name: "编辑" }).click();
  return page.getByRole("dialog", { name: "编辑候选单位" });
}

async function addPerformance(
  page: Page,
  companyName: string,
  score: string,
) {
  await page
    .getByRole("button", { name: "新增履约记录" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "新增履约记录" });
  await dialog.getByLabel("单位名称").fill(companyName);
  await dialog.getByLabel("分类分级等级").fill("A");
  await dialog.getByLabel("年份").fill("2026");
  await dialog.getByLabel("季度评分").fill(score);
  await expect(
    dialog.getByRole("combobox", { name: "项目类型", exact: true }),
  ).toContainText("幕墙");
  await expect(
    dialog.getByRole("combobox", { name: "季度", exact: true }),
  ).toContainText("第 1 季度");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: companyName })
      .filter({ hasText: "Q1" }),
  ).toBeVisible();
}

async function saveAllDirtyExclusionRules(page: Page) {
  for (let remaining = 4; remaining > 0; remaining -= 1) {
    const dirtyButtons = page.getByRole("button", {
      name: "保存剔除配置",
    });
    await expect(dirtyButtons).toHaveCount(remaining);
    await dirtyButtons.first().click();
    await expect(dirtyButtons).toHaveCount(remaining - 1);
  }
}

test("真实用户可从新建项目完成清标、定标和全场景分析", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "新建项目" })).toBeVisible();

  await page.getByLabel("项目名称").fill(acceptanceProjectName);
  await page.getByLabel("最高投标限价").fill("1000");
  await page.getByLabel("不可竞争费").fill("100");
  await page.getByRole("checkbox", { name: "幕墙" }).check();
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
  for (const candidate of candidateInputs) {
    await addCandidate(page, candidate);
  }

  await page.reload();
  const firstCandidateRow = page
    .getByRole("row")
    .filter({ hasText: candidateInputs[0].companyName });
  await expect(firstCandidateRow).toContainText("10.38%");
  await expect(firstCandidateRow).not.toContainText("0.10%");
  await expect(
    page.getByText(candidateInputs[2].companyName, { exact: true }).first(),
  ).toBeVisible();
  await expect(firstCandidateRow).toBeVisible();

  let editor = await openCandidateEditor(
    page,
    candidateInputs[5].companyName,
  );
  await editor.getByLabel("其他主客观分").fill("2.3");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: candidateInputs[5].companyName }),
  ).toContainText("2.30");

  await page
    .getByRole("button", { name: `操作 ${candidateInputs[5].companyName}` })
    .click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "删除候选单位" });
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: candidateInputs[5].companyName }),
  ).toHaveCount(0);
  await addCandidate(page, candidateInputs[5]);

  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(page.getByText("有 6 家候选单位履约数据不完整，请先补充。"))
    .toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始清标测算" }),
  ).toBeDisabled();

  await page.goto("/performance");
  for (const candidate of candidateInputs) {
    await addPerformance(page, candidate.companyName, candidate.performanceScore);
  }

  await page.goto(`/projects/${projectId}/qingbiao`);
  const exclusions = [
    [candidateInputs[5].companyName],
    [candidateInputs[4].companyName, candidateInputs[5].companyName],
    [candidateInputs[0].companyName],
    [candidateInputs[0].companyName, candidateInputs[4].companyName],
  ] as const;
  for (const [ruleOffset, companyNames] of exclusions.entries()) {
    const ruleIndex = ruleOffset + 1;
    for (const companyName of companyNames) {
      await page
        .getByRole("checkbox", {
          name: `${companyName}，规则${ruleIndex}剔除单位`,
        })
        .check();
    }
  }
  await saveAllDirtyExclusionRules(page);
  await expect(page.getByText("配置及履约数据完整，可以开始测算。"))
    .toBeVisible();

  await page.getByRole("button", { name: "开始清标测算" }).click();
  await expect(page.getByRole("heading", { name: "16场景总览" }))
    .toBeVisible();
  const overviewRows = page.locator(
    'section[aria-labelledby="qingbiao-overview-title"] tbody tr',
  );
  await expect(overviewRows).toHaveCount(16);

  const rule1K20Cells = overviewRows.nth(0).getByRole("cell");
  await expect(rule1K20Cells.nth(0)).toHaveText("规则1");
  await expect(rule1K20Cells.nth(1)).toHaveText("0.00%");
  await expect(rule1K20Cells.nth(2)).toHaveText("10.67%");
  await expect(rule1K20Cells.nth(3)).toHaveText("904.00 万元");
  for (const [offset, expectedName] of [
    candidateInputs[2].companyName,
    candidateInputs[3].companyName,
    candidateInputs[4].companyName,
    candidateInputs[1].companyName,
    candidateInputs[5].companyName,
  ].entries()) {
    await expect(rule1K20Cells.nth(4 + offset)).toHaveText(expectedName);
  }

  const rule3K22Cells = overviewRows.nth(10).getByRole("cell");
  await expect(rule3K22Cells.nth(0)).toHaveText("规则3");
  await expect(rule3K22Cells.nth(1)).toHaveText("2.00%");
  await expect(rule3K22Cells.nth(2)).toHaveText("11.50%");
  await expect(rule3K22Cells.nth(3)).toHaveText("878.50 万元");
  for (const [offset, expectedName] of candidateInputs
    .slice(0, 5)
    .map(({ companyName }) => companyName)
    .entries()) {
    await expect(rule3K22Cells.nth(4 + offset)).toHaveText(expectedName);
  }

  await page.goto(`/projects/${projectId}/candidates`);
  editor = await openCandidateEditor(page, candidateInputs[5].companyName);
  await editor.getByLabel("其他主客观分").fill("2.3");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.goto(`/projects/${projectId}/qingbiao`);
  await expect(page.getByText(/结果已过期，请重新进行清标测算/)).toBeVisible();
  await page.getByRole("button", { name: "开始清标测算" }).click();
  await expect(overviewRows).toHaveCount(16);

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

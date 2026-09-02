import { expect, test } from "@playwright/test";

import { fullGolden20260820Fixture as golden } from "@/domain/regression/fixtures/20260820-full-golden.fixture";
import { prisma } from "@/server/db/prisma";

test("广田全场景入围保障测算展示16场景并切换TOP5/TOP3", async ({
  page,
}) => {
  await page.goto(`/projects/${golden.project.id}/qingbiao`);

  const guaranteeModule = page.getByTestId("qingbiao-entry-guarantee");
  await expect(guaranteeModule.getByRole("heading", { name: "广田全场景入围保障测算" }))
    .toBeVisible();
  await expect(guaranteeModule.getByTestId("qingbiao-entry-guarantee-info"))
    .toContainText("0.05%");
  const moduleOrder = page.locator(
    '[data-testid="qingbiao-conclusion"], [data-testid="qingbiao-entry-guarantee"]',
  );
  await expect(moduleOrder).toHaveCount(2);
  await expect(moduleOrder.nth(0)).toHaveAttribute(
    "data-testid",
    "qingbiao-conclusion",
  );
  await expect(moduleOrder.nth(1)).toHaveAttribute(
    "data-testid",
    "qingbiao-entry-guarantee",
  );

  const top5Tab = guaranteeModule.getByRole("tab", {
    name: "全场景前五入围保障",
    selected: true,
  });
  const top3Tab = guaranteeModule.getByRole("tab", {
    name: "全场景前三入围保障",
  });
  await expect(top5Tab).toBeVisible();
  await expect(top3Tab).toBeVisible();

  const table = guaranteeModule.getByTestId("qingbiao-entry-guarantee-table");
  await expect(table.locator("tbody tr")).toHaveCount(16);
  await expect(table.getByRole("columnheader", {
    name: "前五入围净下浮率区间",
  })).toBeVisible();
  for (const ruleIndex of [1, 2, 3, 4]) {
    for (const qingbiaoK2Value of [0, 1, 2, 3]) {
      await expect(
        guaranteeModule.getByTestId(
          `qingbiao-entry-guarantee-row-${ruleIndex}-${qingbiaoK2Value}`,
        ),
      ).toContainText(`${qingbiaoK2Value}%`);
    }
  }
  const summary = guaranteeModule.getByTestId("qingbiao-entry-guarantee-summary");
  await expect(summary).toContainText("全场景通用净下浮率保障区间");
  await expect(summary).toContainText("对应投标总价保障区间");

  await top3Tab.click();
  await expect(top3Tab).toHaveAttribute("aria-selected", "true");
  await expect(table.getByRole("columnheader", {
    name: "前三入围净下浮率区间",
  })).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(16);
  await expect(summary).toContainText("排名前三");
});

test("清标结果stale时保障模块不冒充current", async ({ page }) => {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: golden.project.id },
    select: { qingbiaoInputRevision: true },
  });
  await prisma.project.update({
    where: { id: golden.project.id },
    data: { qingbiaoInputRevision: { increment: 1 } },
  });
  try {
    await page.goto(`/projects/${golden.project.id}/qingbiao`);
    const guaranteeModule = page.getByTestId("qingbiao-entry-guarantee");
    await expect(guaranteeModule.getByTestId("qingbiao-entry-guarantee-stale"))
      .toContainText("当前清标结果已过期");
    await expect(guaranteeModule.getByTestId("qingbiao-entry-guarantee-table"))
      .toHaveCount(0);
  } finally {
    await prisma.project.update({
      where: { id: golden.project.id },
      data: { qingbiaoInputRevision: project.qingbiaoInputRevision },
    });
  }
});

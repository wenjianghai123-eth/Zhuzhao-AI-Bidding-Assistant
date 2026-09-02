"use client";

import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QINGBIAO_EXCLUSION_RULE_INDEXES } from "@/domain/qingbiao";
import type {
  QingbiaoEntryGuaranteeInterval,
  QingbiaoEntryGuaranteeTarget,
} from "@/domain/qingbiao-reverse-simulation";
import { QINGBIAO_RULE_PRESENTATIONS } from "@/features/qingbiao/qingbiao-result-view-model";
import { formatMoney } from "@/lib/formatters";
import { formatPercentageFraction } from "@/lib/percentage";
import type { QingbiaoEntryGuaranteeViewModel } from "@/server/application/qingbiao-entry-guarantee-service";

function IntervalValues({
  intervals,
  kind,
}: {
  intervals: readonly QingbiaoEntryGuaranteeInterval[];
  kind: "rate" | "price";
}) {
  if (intervals.length === 0) {
    return <span className="text-muted-foreground">不存在</span>;
  }
  return (
    <span className="space-y-1 font-semibold text-red-600">
      {intervals.map((interval) => (
        <span
          key={`${interval.minimumRateFraction}-${interval.maximumRateFraction}`}
          className="block"
        >
          {kind === "rate"
            ? `${formatPercentageFraction(interval.minimumRateFraction)} ～ ${formatPercentageFraction(interval.maximumRateFraction)}`
            : `${formatMoney(interval.minimumBidPrice)} ～ ${formatMoney(interval.maximumBidPrice)}`}
        </span>
      ))}
    </span>
  );
}

function UnavailableContent({
  state,
  projectId,
}: {
  state: Extract<QingbiaoEntryGuaranteeViewModel, { status: "unavailable" }>;
  projectId: string;
}) {
  return (
    <CardContent className="space-y-4">
      {state.reason === "performance_unavailable" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          提示：我方单位的履约加权平均分尚未正常保存。请到
          <Button asChild variant="link" className="h-auto px-1 text-blue-950 underline">
            <a href={`/projects/${projectId}/performance`}>单位履约加权分</a>
          </Button>
          页面完成计算与保存。
        </div>
      ) : null}
      <p
        className="rounded-lg border border-dashed p-6 text-center text-muted-foreground"
        role="status"
        data-testid={`qingbiao-entry-guarantee-${state.reason}`}
      >
        {state.message}
      </p>
    </CardContent>
  );
}

export function QingbiaoEntryGuarantee({
  projectId,
  state,
}: {
  projectId: string;
  state: QingbiaoEntryGuaranteeViewModel;
}) {
  const [target, setTarget] =
    useState<QingbiaoEntryGuaranteeTarget>("TOP5");

  const targetResult =
    state.status === "calculated" ? state.calculation.targets[target] : null;
  const targetName = target === "TOP5" ? "前五" : "前三";

  return (
    <section aria-labelledby="qingbiao-entry-guarantee-title">
      <Card data-testid="qingbiao-entry-guarantee">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span
              className="size-2.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            <h2 id="qingbiao-entry-guarantee-title">
              广田全场景入围保障测算
            </h2>
          </CardTitle>
          <CardDescription>
            固定全部竞争对手输入，仅反向调整我方净下浮率及其对应投标总价。
          </CardDescription>
        </CardHeader>

        {state.status === "unavailable" ? (
          <UnavailableContent state={state} projectId={projectId} />
        ) : (
          <CardContent className="space-y-5">
            <div
              className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"
              data-testid="qingbiao-entry-guarantee-info"
            >
              提示：本次测算使用当前已保存的履约加权分，按
              {formatPercentageFraction(
                state.calculation.searchPolicy.rateStepFraction,
              )}
              的固定步长扫描0%至100%净下浮率；区间端点均为已实际执行正式清标计算的采样值。
            </div>

            <Tabs
              value={target}
              onValueChange={(value) =>
                setTarget(value === "TOP3" ? "TOP3" : "TOP5")
              }
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger
                  value="TOP5"
                  className="rounded-full border px-4 data-[state=active]:border-fuchsia-200 data-[state=active]:bg-fuchsia-100"
                >
                  全场景前五入围保障
                </TabsTrigger>
                <TabsTrigger
                  value="TOP3"
                  className="rounded-full border px-4 data-[state=active]:border-fuchsia-200 data-[state=active]:bg-fuchsia-100"
                >
                  全场景前三入围保障
                </TabsTrigger>
                <span className="inline-flex items-center rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
                  进入各场景清标排名{targetName}
                </span>
              </TabsList>
            </Tabs>

            <p className="rounded-lg bg-fuchsia-50/70 p-4 text-sm leading-7 text-fuchsia-950">
              反向测算：固定当前全部竞争对手的报价、履约得分、同类业绩及其他主客观分；
              【{state.ourCompanyName}】的其他评分保持不变，仅调整其净下浮率和对应投标总价，逐点重算4种推优剔除规则 × 4种K2抽取值共16种清标场景，反推其进入排名{targetName}的可行区间。
            </p>

            {targetResult ? (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <Table
                    className="min-w-[64rem]"
                    data-testid="qingbiao-entry-guarantee-table"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[34%]">
                          推优剔除规则
                        </TableHead>
                        <TableHead className="w-24 text-center">K2</TableHead>
                        <TableHead>{targetName}入围净下浮率区间</TableHead>
                        <TableHead>对应投标总价</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {QINGBIAO_EXCLUSION_RULE_INDEXES.map((ruleIndex) => {
                        const scenarios = targetResult.scenarios.filter(
                          (scenario) => scenario.ruleIndex === ruleIndex,
                        );
                        const presentation =
                          QINGBIAO_RULE_PRESENTATIONS[ruleIndex];
                        return scenarios.map((scenario, index) => (
                          <TableRow
                            key={`${scenario.ruleIndex}-${scenario.qingbiaoK2Value}`}
                            data-testid={`qingbiao-entry-guarantee-row-${scenario.ruleIndex}-${scenario.qingbiaoK2Value}`}
                          >
                            {index === 0 ? (
                              <TableCell
                                rowSpan={scenarios.length}
                                className="align-middle font-medium leading-6"
                              >
                                规则{scenario.ruleIndex}：
                                {presentation.label}
                              </TableCell>
                            ) : null}
                            <TableCell className="text-center font-medium tabular-nums">
                              {scenario.qingbiaoK2Value}%
                            </TableCell>
                            <TableCell>
                              <IntervalValues
                                intervals={scenario.intervals}
                                kind="rate"
                              />
                            </TableCell>
                            <TableCell>
                              <IntervalValues
                                intervals={scenario.intervals}
                                kind="price"
                              />
                            </TableCell>
                          </TableRow>
                        ));
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div
                  className="space-y-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-5 text-sm leading-7 text-fuchsia-950"
                  data-testid="qingbiao-entry-guarantee-summary"
                >
                  <Fragment>
                    <p>
                      <strong>全场景通用净下浮率保障区间：</strong>{" "}
                      <IntervalValues
                        intervals={targetResult.globalIntervals}
                        kind="rate"
                      />
                    </p>
                    <p>
                      <strong>对应投标总价保障区间：</strong>{" "}
                      <IntervalValues
                        intervals={targetResult.globalIntervals}
                        kind="price"
                      />
                    </p>
                  </Fragment>
                  {targetResult.globalIntervals.length === 0 ? (
                    <p className="font-medium text-red-600">
                      当前不存在可同时满足全部16个场景的通用保障区间。
                    </p>
                  ) : null}
                  <p className="border-t border-fuchsia-200 pt-3 text-xs text-muted-foreground">
                    备注：本测算以【{state.ourCompanyName}】在全部16种场景下进入排名{targetName}为前提，按净下浮率区间推导对应投标总价；若竞争对手报价、履约、业绩等参数发生变动，需重新点击【清标测算】后查看最新结果。
                  </p>
                </div>
              </>
            ) : null}
          </CardContent>
        )}
      </Card>
    </section>
  );
}

import { Fragment } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildQingbiaoConclusionViewModel,
  type QingbiaoConclusionCandidateViewModel,
} from "@/features/qingbiao/qingbiao-conclusion-view-model";
import { cn } from "@/lib/utils";
import type { QingbiaoPageData } from "@/server/application/qingbiao-service";
import type { SavedQingbiaoCalculationSnapshot } from "@/server/repositories/qingbiao-repository";

interface QingbiaoConclusionProps {
  pageData: QingbiaoPageData;
  calculation: SavedQingbiaoCalculationSnapshot | null;
  status: "not_calculated" | "current" | "stale";
}

function CandidateNames({
  candidates,
}: {
  candidates: readonly QingbiaoConclusionCandidateViewModel[];
}) {
  if (candidates.length === 0) {
    return <span>暂无符合条件的单位</span>;
  }

  return candidates.map((candidate, index) => (
    <Fragment key={candidate.candidateId}>
      {index > 0 ? "、" : null}
      <span
        className={cn(candidate.isOurCompany && "font-semibold text-red-600")}
        data-testid={
          candidate.isOurCompany
            ? "qingbiao-conclusion-our-company"
            : undefined
        }
      >
        {candidate.companyName}
      </span>
    </Fragment>
  ));
}

export function QingbiaoConclusion({
  pageData,
  calculation,
  status,
}: QingbiaoConclusionProps) {
  const viewModel =
    status === "current" && calculation
      ? buildQingbiaoConclusionViewModel(pageData, calculation)
      : null;

  return (
    <section aria-labelledby="qingbiao-conclusion-title">
      <Card data-testid="qingbiao-conclusion">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span
              className="size-2.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            <h2 id="qingbiao-conclusion-title">清标测算结论</h2>
          </CardTitle>
          <CardDescription>
            基于当前16套清标场景已保存的排名结果生成只读摘要。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "stale" ? (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"
              role="alert"
            >
              当前清标结果已过期，请重新进行清标测算后查看结论。
            </p>
          ) : viewModel === null ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              当前尚未生成清标结论，请先进行清标测算。
            </p>
          ) : (
            <div className="space-y-7">
              {viewModel.ruleConclusions.map((rule) => (
                <section
                  key={rule.ruleIndex}
                  className="space-y-3"
                  aria-labelledby={`qingbiao-conclusion-rule-title-${rule.ruleIndex}`}
                  data-testid={`qingbiao-conclusion-rule-${rule.ruleIndex}`}
                >
                  <h3
                    id={`qingbiao-conclusion-rule-title-${rule.ruleIndex}`}
                    className="font-semibold leading-6"
                  >
                    清标结论：{rule.ruleTitle}
                  </h3>
                  <ol className="space-y-2 text-sm leading-7">
                    {rule.scenarios.map((scenario, index) => (
                      <li
                        key={scenario.qingbiaoK2Value}
                        data-testid={`qingbiao-conclusion-rule-${rule.ruleIndex}-k2-${scenario.qingbiaoK2Value}`}
                      >
                        <span className="mr-1 tabular-nums">{index + 1}、</span>
                        当清标抽取值 K2={scenario.qingbiaoK2Value}%
                        时，排名前五家单位为
                        <CandidateNames candidates={scenario.topCandidates} />；
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              <div className="space-y-3 border-t pt-5">
                {viewModel.ourCompanyName ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    若排名前五家单位名称中包含【{viewModel.ourCompanyName}
                    】，该名称以红色加粗显示。
                  </p>
                ) : null}
                <p className="leading-7" data-testid="qingbiao-all-scenario-entrants">
                  <strong>全场景入围单位：</strong>
                  <CandidateNames candidates={viewModel.allScenarioEntrants} />。
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

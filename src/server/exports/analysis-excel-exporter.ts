import ExcelJS from "exceljs";

import type { AnalysisDeliveryData } from "@/server/application/analysis-delivery-service";
import { PROJECT_TYPE_LABELS } from "@/lib/project-type-labels";
import {
  formatDateTime,
} from "@/lib/formatters";
import {
  formatK2,
  formatPercentageFraction,
  percentagePointsToExcelFraction,
  PRESENTATION_PRECISION,
  toExcelFractionNumber,
  toPresentationNumber,
} from "@/lib/presentation";

export const ANALYSIS_EXPORT_SHEET_NAMES = [
  "项目概览",
  "候选单位",
  "履约信息",
  "清标场景摘要",
  "清标全场景",
  "定标场景摘要",
  "定标全场景",
  "全场景分析",
  "计算快照_审计",
] as const;

export const EXCEL_NUMBER_FORMATS = {
  money: `0.${"0".repeat(PRESENTATION_PRECISION.money)}`,
  percentage: `0.${"0".repeat(PRESENTATION_PRECISION.percentage)}%`,
  score: `0.${"0".repeat(PRESENTATION_PRECISION.score)}`,
  integer: "0",
  text: "@",
} as const;

type ExcelValue = string | number | boolean | Date | null;
type ExcelFormat = keyof typeof EXCEL_NUMBER_FORMATS | null;

function addHeader(worksheet: ExcelJS.Worksheet, headers: readonly string[]) {
  const row = worksheet.addRow([...headers]);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF365A7A" },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 24;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
}

function addDataRow(
  worksheet: ExcelJS.Worksheet,
  values: readonly ExcelValue[],
  formats: readonly ExcelFormat[] = [],
) {
  const row = worksheet.addRow([...values]);
  formats.forEach((format, index) => {
    if (format) {
      row.getCell(index + 1).numFmt = EXCEL_NUMBER_FORMATS[format];
    }
  });
  row.alignment = { vertical: "top", wrapText: true };
  return row;
}

function finishSheet(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maximumLength = 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      maximumLength = Math.max(maximumLength, cell.text.length + 2);
    });
    column.width = Math.min(maximumLength, 38);
  });
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E0E7" } },
        left: { style: "thin", color: { argb: "FFD9E0E7" } },
        bottom: { style: "thin", color: { argb: "FFD9E0E7" } },
        right: { style: "thin", color: { argb: "FFD9E0E7" } },
      };
    });
  });
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
}

function candidateMaps(data: AnalysisDeliveryData) {
  return {
    byId: new Map(data.project.candidates.map((candidate) => [candidate.id, candidate])),
    nameById: new Map(
      data.project.candidates.map((candidate) => [candidate.id, candidate.companyName]),
    ),
  };
}

function addProjectOverview(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("项目概览");
  addHeader(worksheet, ["字段", "值"]);
  const ourCompany = data.project.candidates.find(({ isOurCompany }) => isOurCompany);
  const overviewRows: readonly [string, ExcelValue, ExcelFormat][] = [
    ["项目名称", data.project.projectName, null],
    ["最高投标限价（万元）", toPresentationNumber(data.project.rules.maxBidPrice, "money"), "money"],
    ["不可竞争费（万元）", toPresentationNumber(data.project.rules.nonCompetitiveFee, "money"), "money"],
    ["项目类型", data.project.projectTypes.map((type) => PROJECT_TYPE_LABELS[type]).join("、"), null],
    ["报价总分", toPresentationNumber(data.project.rules.totalBidPriceScore, "score"), "score"],
    ["排名递减扣分", toPresentationNumber(data.project.rules.rankDeduction, "score"), "score"],
    ["定标抽值1", toExcelFractionNumber(data.dingbiaoProject.finalDrawValueFractions[0]), "percentage"],
    ["定标抽值2", toExcelFractionNumber(data.dingbiaoProject.finalDrawValueFractions[1]), "percentage"],
    ["定标抽值3", toExcelFractionNumber(data.dingbiaoProject.finalDrawValueFractions[2]), "percentage"],
    ["我方单位", ourCompany?.companyName ?? "未设置", null],
    ["计算时间", formatDateTime(data.dingbiaoSources[0]?.calculation.calculatedAt ?? data.qingbiao.calculatedAt), null],
    ["Qingbiao Rule Version", data.qingbiao.ruleVersion, null],
    ["Dingbiao Rule Version", data.dingbiaoSources[0]?.calculation.ruleVersion ?? "—", null],
    ["清标状态", data.qingbiaoState, null],
    ["定标状态", data.dingbiaoState, null],
    ["Analysis状态", "current", null],
    ["导出生成时间", formatDateTime(data.generatedAt), null],
  ];
  overviewRows.forEach(([label, value, format]) =>
    addDataRow(worksheet, [label, value], [null, format]),
  );
  finishSheet(worksheet);
}

function addCandidates(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("候选单位");
  addHeader(worksheet, [
    "序号",
    "单位名称",
    "是否我方",
    "投标总价（万元）",
    "净下浮率",
    "商标优",
    "技术优",
    "同类业绩",
    "其他主客观分",
  ]);
  data.project.candidates.forEach((candidate, index) =>
    addDataRow(
      worksheet,
      [
        index + 1,
        candidate.companyName,
        candidate.isOurCompany ? "是" : "否",
        toPresentationNumber(candidate.bidPrice, "money"),
        toExcelFractionNumber(candidate.netDiscountRateFraction),
        toPresentationNumber(candidate.trademarkScore, "score"),
        toPresentationNumber(candidate.technicalScore, "score"),
        toPresentationNumber(candidate.similarExperienceScore, "score"),
        toPresentationNumber(candidate.otherScore, "score"),
      ],
      ["integer", null, null, "money", "percentage", "score", "score", "score", "score"],
    ),
  );
  finishSheet(worksheet);
}

function addPerformance(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("履约信息");
  addHeader(worksheet, [
    "单位",
    "项目类型",
    "季度",
    "季度履约分",
    "最近12季度平均值（系统清标结果）",
  ]);
  data.performanceRecords.forEach((record) =>
    addDataRow(
      worksheet,
      [
        record.companyName,
        PROJECT_TYPE_LABELS[record.projectType],
        `${record.year}Q${record.quarter}`,
        toPresentationNumber(record.score, "score"),
        toPresentationNumber(record.recent12Average, "score"),
      ],
      [null, null, null, "score", "score"],
    ),
  );
  finishSheet(worksheet);
}

function qingbiaoContext(data: AnalysisDeliveryData) {
  const { byId, nameById } = candidateMaps(data);
  const ruleByIndex = new Map(
    data.project.exclusionRules.map((rule) => [rule.ruleIndex, rule]),
  );
  return { byId, nameById, ruleByIndex };
}

function addQingbiaoSummary(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("清标场景摘要");
  addHeader(worksheet, [
    "Scenario ID",
    "规则",
    "K2",
    "K1",
    "B（万元）",
    "Top1",
    "Top2",
    "Top3",
    "Top4",
    "Top5",
    "我方排名",
    "我方是否Top5",
  ]);
  const { nameById } = qingbiaoContext(data);
  data.qingbiao.scenarios.forEach((scenario) => {
    const top5Names = [1, 2, 3, 4, 5].map((rank) => {
      const candidate = scenario.orderedResults.find((item) => item.finalRank === rank);
      return candidate ? (nameById.get(candidate.candidateId) ?? candidate.companyName) : "—";
    });
    const ourResult = scenario.orderedResults.find(({ isOurCompany }) => isOurCompany);
    addDataRow(
      worksheet,
      [
        scenario.scenarioId,
        `规则${scenario.ruleIndex}`,
        percentagePointsToExcelFraction(scenario.qingbiaoK2Value),
        toExcelFractionNumber(scenario.qingbiaoK1Fraction),
        toPresentationNumber(scenario.referencePriceB, "money"),
        ...top5Names,
        ourResult?.finalRank ?? null,
        ourResult && ourResult.finalRank <= 5 ? "是" : "否",
      ],
      [null, null, "percentage", "percentage", "money", null, null, null, null, null, "integer", null],
    );
  });
  finishSheet(worksheet);
}

function addQingbiaoDetails(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("清标全场景");
  addHeader(worksheet, [
    "Scenario ID", "推优规则", "被剔除单位", "K2", "Qingbiao K1", "B（万元）",
    "最终排名", "单位", "是否我方", "投标总价（万元）", "净下浮率", "履约平均分",
    "履约得分", "B差额（万元）", "报价排名", "报价得分", "同类业绩", "其他主客观分",
    "综合得分", "是否Top5",
  ]);
  const { nameById, ruleByIndex } = qingbiaoContext(data);
  data.qingbiao.scenarios.forEach((scenario) => {
    const rule = ruleByIndex.get(scenario.ruleIndex);
    const excludedNames = rule?.excludedCandidateIds
      .map((candidateId) => nameById.get(candidateId) ?? candidateId)
      .join("、") ?? "";
    scenario.orderedResults.forEach((candidate) =>
      addDataRow(
        worksheet,
        [
          scenario.scenarioId,
          rule?.label ?? `规则${scenario.ruleIndex}`,
          excludedNames || "无",
          percentagePointsToExcelFraction(scenario.qingbiaoK2Value),
          toExcelFractionNumber(scenario.qingbiaoK1Fraction),
          toPresentationNumber(scenario.referencePriceB, "money"),
          candidate.finalRank,
          candidate.companyName,
          candidate.isOurCompany ? "是" : "否",
          toPresentationNumber(candidate.bidPrice, "money"),
          toExcelFractionNumber(candidate.netDiscountRateFraction),
          toPresentationNumber(candidate.performanceAverage, "score"),
          toPresentationNumber(candidate.performanceScore, "score"),
          toPresentationNumber(candidate.priceDifference, "money"),
          candidate.priceRank,
          toPresentationNumber(candidate.priceScore, "score"),
          toPresentationNumber(candidate.similarExperienceScore, "score"),
          toPresentationNumber(candidate.otherScore, "score"),
          toPresentationNumber(candidate.totalScore, "score"),
          candidate.finalRank <= 5 ? "是" : "否",
        ],
        [null, null, null, "percentage", "percentage", "money", "integer", null, null, "money", "percentage", "score", "score", "money", "integer", "score", "score", "score", "score", null],
      ),
    );
  });
  finishSheet(worksheet);
}

function dingbiaoScenarioId(data: AnalysisDeliveryData, input: {
  sourceQingbiaoScenarioId: string;
  finalistCount: number;
  finalDrawIndex: number;
}) {
  return data.analysis.scenarioRecords.find(
    (record) =>
      record.sourceQingbiaoScenarioId === input.sourceQingbiaoScenarioId &&
      record.finalistCount === input.finalistCount &&
      record.finalDrawIndex === input.finalDrawIndex,
  )?.dingbiaoScenarioId ??
    `${input.sourceQingbiaoScenarioId}:${input.finalistCount}:${input.finalDrawIndex}`;
}

function addDingbiaoSummary(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("定标场景摘要");
  addHeader(worksheet, [
    "Scenario ID", "Source Qingbiao Scenario", "规则", "清标K2", "N", "定标抽值序号",
    "定标抽值", "K1", "M（万元）", "Winner", "Winner投标价（万元）", "是否我方中标",
  ]);
  const { nameById } = candidateMaps(data);
  data.dingbiaoSources.forEach((source) =>
    source.calculation.scenarios.forEach((scenario) => {
      const winner = scenario.candidates.find(({ isWinner }) => isWinner);
      addDataRow(
        worksheet,
        [
          dingbiaoScenarioId(data, { sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId, finalistCount: scenario.finalistCount, finalDrawIndex: scenario.finalDrawIndex }),
          source.sourceQingbiaoScenarioId,
          `规则${source.ruleIndex}`,
          percentagePointsToExcelFraction(source.qingbiaoK2Value),
          scenario.finalistCount,
          scenario.finalDrawIndex,
          toExcelFractionNumber(scenario.finalDrawValueFraction),
          toExcelFractionNumber(scenario.dingbiaoK1Fraction),
          toPresentationNumber(scenario.benchmarkPriceM, "money"),
          nameById.get(scenario.winnerCandidateId) ?? scenario.winnerCandidateId,
          winner ? toPresentationNumber(winner.bidPrice, "money") : null,
          winner?.isOurCompany ? "是" : "否",
        ],
        [null, null, null, "percentage", "integer", "integer", "percentage", "percentage", "money", null, "money", null],
      );
    }),
  );
  finishSheet(worksheet);
}

function addDingbiaoDetails(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("定标全场景");
  addHeader(worksheet, [
    "Scenario ID", "Source Qingbiao Scenario", "规则", "清标K2", "N", "finalDrawIndex",
    "定标抽值", "Dingbiao K1", "M（万元）", "定标排名", "单位", "清标来源排名",
    "投标总价（万元）", "净下浮率", "M差额（万元）", "是否预测中标",
  ]);
  const { nameById } = candidateMaps(data);
  data.dingbiaoSources.forEach((source) =>
    source.calculation.scenarios.forEach((scenario) => {
      const scenarioId = dingbiaoScenarioId(data, {
        sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId,
        finalistCount: scenario.finalistCount,
        finalDrawIndex: scenario.finalDrawIndex,
      });
      scenario.candidates.forEach((candidate) =>
        addDataRow(
          worksheet,
          [
            scenarioId,
            source.sourceQingbiaoScenarioId,
            `规则${source.ruleIndex}`,
            percentagePointsToExcelFraction(source.qingbiaoK2Value),
            scenario.finalistCount,
            scenario.finalDrawIndex,
            toExcelFractionNumber(scenario.finalDrawValueFraction),
            toExcelFractionNumber(scenario.dingbiaoK1Fraction),
            toPresentationNumber(scenario.benchmarkPriceM, "money"),
            candidate.rank,
            nameById.get(candidate.candidateId) ?? candidate.candidateId,
            candidate.sourceQingbiaoRank,
            toPresentationNumber(candidate.bidPrice, "money"),
            toExcelFractionNumber(candidate.netDiscountRateFraction),
            toPresentationNumber(candidate.differenceToM, "money"),
            candidate.isWinner ? "是" : "否",
          ],
          [null, null, null, "percentage", "integer", "integer", "percentage", "percentage", "money", "integer", null, "integer", "money", "percentage", "money", null],
        ),
      );
    }),
  );
  finishSheet(worksheet);
}

function addAnalysisSectionHeader(worksheet: ExcelJS.Worksheet, title: string) {
  const row = worksheet.addRow([title]);
  row.font = { bold: true, color: { argb: "FF25445D" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F5" } };
}

function addAnalysis(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("全场景分析");
  addHeader(worksheet, ["分析区块", "维度", "数值", "分子", "分母", "展示"]);
  const analysis = data.analysis;
  const globalMetric = analysis.globalWinMetric;
  addDataRow(worksheet, ["核心指标", "清标有效场景", analysis.participatingQingbiaoSourceCount, null, analysis.theoreticalQingbiaoSourceCount, `${analysis.participatingQingbiaoSourceCount}/${analysis.theoreticalQingbiaoSourceCount}`], [null, null, "integer", null, "integer", null]);
  addDataRow(worksheet, ["核心指标", "定标理论场景", analysis.theoreticalScenarioCount, null, null, analysis.theoreticalScenarioCount.toString()], [null, null, "integer"]);
  addDataRow(worksheet, ["核心指标", "定标有效场景", analysis.validScenarioCount, null, analysis.theoreticalScenarioCount, `${analysis.validScenarioCount}/${analysis.theoreticalScenarioCount}`], [null, null, "integer", null, "integer"]);
  addDataRow(worksheet, ["核心指标", "我方胜出数", globalMetric.ourWinCount, globalMetric.ourWinCount, globalMetric.validScenarioCount, globalMetric.ourWinCount === null ? "未设置我方" : `${globalMetric.ourWinCount}/${globalMetric.validScenarioCount}`], [null, null, "integer", "integer", "integer"]);
  addDataRow(worksheet, ["核心指标", "全场景模拟中标率", globalMetric.simulationWinRate === null ? null : toExcelFractionNumber(globalMetric.simulationWinRate), globalMetric.ourWinCount, globalMetric.validScenarioCount, formatPercentageFraction(globalMetric.simulationWinRate)], [null, null, "percentage", "integer", "integer"]);

  addAnalysisSectionHeader(worksheet, "清标稳定性");
  analysis.qingbiaoStability.forEach((item) =>
    addDataRow(worksheet, ["清标稳定性", `Top${item.threshold}`, toExcelFractionNumber(item.share), item.sourceCount, item.participatingSourceCount, formatPercentageFraction(item.share)], [null, null, "percentage", "integer", "integer"]),
  );

  const dimensionGroups = [
    ["按规则", analysis.byExclusionRule],
    ["按K2", analysis.byQingbiaoK2],
    ["按N", analysis.byFinalistCount],
    ["按定标抽值", analysis.byFinalDrawIndex],
  ] as const;
  dimensionGroups.forEach(([groupLabel, items]) => {
    addAnalysisSectionHeader(worksheet, groupLabel);
    items.forEach((item) =>
      addDataRow(worksheet, [groupLabel, item.label, item.simulationWinRate === null ? null : toExcelFractionNumber(item.simulationWinRate), item.ourWinCount, item.validScenarioCount, item.simulationWinRate === null ? "—" : formatPercentageFraction(item.simulationWinRate)], [null, null, "percentage", "integer", "integer"]),
    );
  });

  addAnalysisSectionHeader(worksheet, "16套来源分析");
  analysis.sourceAnalysis.forEach((source) =>
    addDataRow(worksheet, ["来源分析", `规则${source.ruleIndex} / K2=${formatK2(source.qingbiaoK2Value)}`, source.simulationWinRate === null ? null : toExcelFractionNumber(source.simulationWinRate), source.ourWinCount, source.validScenarioCount, source.simulationWinRate === null ? "—" : formatPercentageFraction(source.simulationWinRate)], [null, null, "percentage", "integer", "integer"]),
  );

  addAnalysisSectionHeader(worksheet, "Winner Distribution");
  analysis.competitorStatistics.forEach((item) =>
    addDataRow(worksheet, ["Winner Distribution", item.companyName, toExcelFractionNumber(item.winShare), item.winnerCount, item.validScenarioCount, formatPercentageFraction(item.winShare)], [null, null, "percentage", "integer", "integer"]),
  );
  addAnalysisSectionHeader(worksheet, "主要竞争对手 Top3");
  analysis.primaryCompetitors.forEach((item) =>
    addDataRow(worksheet, ["主要竞争对手", item.companyName, toExcelFractionNumber(item.winShare), item.winnerCount, item.validScenarioCount, formatPercentageFraction(item.winShare)], [null, null, "percentage", "integer", "integer"]),
  );
  addDataRow(worksheet, ["重点来源", "最佳模拟来源", null, null, null, analysis.bestSource ? `规则${analysis.bestSource.ruleIndex} / K2=${formatK2(analysis.bestSource.qingbiaoK2Value)}` : "—"]);
  addDataRow(worksheet, ["重点来源", "最不利模拟来源", null, null, null, analysis.worstSource ? `规则${analysis.worstSource.ruleIndex} / K2=${formatK2(analysis.worstSource.qingbiaoK2Value)}` : "—"]);
  finishSheet(worksheet);
}

function addAuditRow(
  worksheet: ExcelJS.Worksheet,
  entity: string,
  scenarioId: string,
  candidateId: string | null,
  field: string,
  canonicalDecimal: string,
) {
  addDataRow(
    worksheet,
    [entity, scenarioId, candidateId, field, canonicalDecimal],
    [null, null, null, null, "text"],
  );
}

function addAudit(workbook: ExcelJS.Workbook, data: AnalysisDeliveryData) {
  const worksheet = workbook.addWorksheet("计算快照_审计");
  addHeader(worksheet, ["实体", "scenarioId", "candidateId", "字段", "canonicalDecimal"]);
  data.qingbiao.scenarios.forEach((scenario) => {
    addAuditRow(worksheet, "QingbiaoScenario", scenario.scenarioId, null, "qingbiaoK1", scenario.qingbiaoK1Fraction);
    addAuditRow(worksheet, "QingbiaoScenario", scenario.scenarioId, null, "referencePriceB", scenario.referencePriceB);
    scenario.orderedResults.forEach((candidate) => {
      addAuditRow(worksheet, "QingbiaoResult", scenario.scenarioId, candidate.candidateId, "performanceAverage", candidate.performanceAverage);
      addAuditRow(worksheet, "QingbiaoResult", scenario.scenarioId, candidate.candidateId, "performanceScore", candidate.performanceScore);
      addAuditRow(worksheet, "QingbiaoResult", scenario.scenarioId, candidate.candidateId, "priceDifference", candidate.priceDifference);
      addAuditRow(worksheet, "QingbiaoResult", scenario.scenarioId, candidate.candidateId, "priceScore", candidate.priceScore);
      addAuditRow(worksheet, "QingbiaoResult", scenario.scenarioId, candidate.candidateId, "totalScore", candidate.totalScore);
    });
  });
  data.dingbiaoSources.forEach((source) =>
    source.calculation.scenarios.forEach((scenario) => {
      const scenarioId = dingbiaoScenarioId(data, { sourceQingbiaoScenarioId: source.sourceQingbiaoScenarioId, finalistCount: scenario.finalistCount, finalDrawIndex: scenario.finalDrawIndex });
      addAuditRow(worksheet, "DingbiaoScenario", scenarioId, null, "finalDrawValue", scenario.finalDrawValueFraction);
      addAuditRow(worksheet, "DingbiaoScenario", scenarioId, null, "dingbiaoK1", scenario.dingbiaoK1Fraction);
      addAuditRow(worksheet, "DingbiaoScenario", scenarioId, null, "benchmarkPriceM", scenario.benchmarkPriceM);
      scenario.candidates.forEach((candidate) => {
        addAuditRow(worksheet, "DingbiaoResult", scenarioId, candidate.candidateId, "bidPrice", candidate.bidPrice);
        addAuditRow(worksheet, "DingbiaoResult", scenarioId, candidate.candidateId, "netDiscountRateSnapshot", candidate.netDiscountRateFraction);
        addAuditRow(worksheet, "DingbiaoResult", scenarioId, candidate.candidateId, "differenceToM", candidate.differenceToM);
      });
    }),
  );
  finishSheet(worksheet);
}

export function buildAnalysisExportWorkbook(data: AnalysisDeliveryData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "烛照AI投标助手";
  workbook.created = new Date(data.generatedAt);
  workbook.modified = new Date(data.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = false;
  addProjectOverview(workbook, data);
  addCandidates(workbook, data);
  addPerformance(workbook, data);
  addQingbiaoSummary(workbook, data);
  addQingbiaoDetails(workbook, data);
  addDingbiaoSummary(workbook, data);
  addDingbiaoDetails(workbook, data);
  addAnalysis(workbook, data);
  addAudit(workbook, data);
  return workbook;
}

export async function createAnalysisExportWorkbook(data: AnalysisDeliveryData) {
  const buffer = await buildAnalysisExportWorkbook(data).xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function sanitizeExportFileNamePart(value: string) {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .replace(/_+/g, "_")
    .trim();
  return (sanitized || "未命名项目").slice(0, 80);
}

export function createAnalysisExportFileName(projectName: string, date: Date) {
  const dateText = [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("");
  return `烛照AI投标分析_${sanitizeExportFileNamePart(projectName)}_${dateText}.xlsx`;
}

import Decimal from "decimal.js";

import type { ProjectTypeValue } from "@/domain/projects/project-settings";
import type {
  ExcelImportFieldMapping,
  ExcelImportIssue,
  ExcelImportMapping,
  ExcelWorkbookCell,
  ExcelWorkbookData,
  ExcelWorkbookRow,
  ExcelWorkbookSheet,
  ImportedCompanyPerformance,
  ImportedProjectCandidate,
  ParsedExcelImport,
} from "@/domain/imports/excel-import-types";

interface FieldDefinition {
  field: string;
  label: string;
  aliases: readonly string[];
  required: boolean;
}

interface HeaderDetection {
  rowNumber: number;
  columns: ReadonlyMap<string, ExcelWorkbookCell>;
}

interface ProjectSource {
  labelCell: ExcelWorkbookCell;
  valueCell: ExcelWorkbookCell | null;
}

const PROJECT_FIELDS = [
  { field: "name", label: "项目名称", aliases: ["项目名称"], required: true },
  {
    field: "maxBidPrice",
    label: "最高投标限价",
    aliases: ["最高投标限价"],
    required: true,
  },
  {
    field: "nonCompetitiveFee",
    label: "不可竞争费",
    aliases: ["不可竞争费"],
    required: true,
  },
  {
    field: "projectTypes",
    label: "项目类型",
    aliases: ["项目类型"],
    required: true,
  },
  {
    field: "totalBidPriceScore",
    label: "总投标报价分值",
    aliases: ["总投标报价分值"],
    required: true,
  },
  {
    field: "rankDeduction",
    label: "排名递减扣分值",
    aliases: ["排名递减扣分值"],
    required: true,
  },
] as const satisfies readonly FieldDefinition[];

const CANDIDATE_FIELDS = [
  {
    field: "companyName",
    label: "单位名称",
    aliases: ["单位名称", "企业名称", "公司名称"],
    required: true,
  },
  {
    field: "bidPrice",
    label: "投标总价",
    aliases: ["投标总价", "投标报价", "报价"],
    required: true,
  },
  {
    field: "netDiscountRate",
    label: "净下浮率",
    aliases: ["净下浮率", "下浮率"],
    required: true,
  },
  {
    field: "trademarkScore",
    label: "商标优",
    aliases: ["商标优", "商标分"],
    required: true,
  },
  {
    field: "technicalScore",
    label: "技术优",
    aliases: ["技术优", "技术分"],
    required: true,
  },
  {
    field: "similarExperienceScore",
    label: "同类业绩",
    aliases: ["同类业绩", "类似业绩"],
    required: true,
  },
  {
    field: "otherScore",
    label: "其他主客观分",
    aliases: ["其他主客观分", "其他主客观", "其他分"],
    required: true,
  },
  {
    field: "isOurCompany",
    label: "我方单位",
    aliases: ["我方单位", "是否我方", "我方"],
    required: false,
  },
] as const satisfies readonly FieldDefinition[];

const PERFORMANCE_FIELDS = [
  {
    field: "companyName",
    label: "单位名称",
    aliases: ["单位名称", "企业名称", "公司名称"],
    required: true,
  },
  {
    field: "projectType",
    label: "项目类型",
    aliases: ["项目类型", "类型", "专业类型"],
    required: true,
  },
  {
    field: "classificationLevel",
    label: "分类分级等级",
    aliases: ["分类分级等级", "分类等级", "分级等级"],
    required: true,
  },
] as const satisfies readonly FieldDefinition[];

const PROJECT_TYPE_LABELS: readonly [string, ProjectTypeValue][] = [
  ["幕墙", "CURTAIN_WALL"],
  ["装修", "DECORATION"],
  ["总包", "GENERAL_CONTRACT"],
  ["实验室", "LABORATORY"],
];

function normalizeLabel(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .toLowerCase();
}

function isPlaceholder(value: string) {
  const normalized = normalizeLabel(value);
  return (
    normalized === "录入" ||
    normalized.startsWith("录入") ||
    normalized.startsWith("选择") ||
    normalized.startsWith("自动生成") ||
    normalized.startsWith("自动计算") ||
    normalized.includes("文本类型") ||
    normalized.includes("数字类型") ||
    normalized.includes("数值类型")
  );
}

function findCell(
  sheet: ExcelWorkbookSheet,
  rowNumber: number,
  columnNumber: number,
) {
  return sheet.rows
    .find((row) => row.rowNumber === rowNumber)
    ?.cells.find((cell) => cell.columnNumber === columnNumber) ?? null;
}

function valueOf(row: ExcelWorkbookRow, columnNumber: number | undefined) {
  if (columnNumber === undefined) {
    return null;
  }
  return row.cells.find((cell) => cell.columnNumber === columnNumber) ?? null;
}

function matchesDefinition(cell: ExcelWorkbookCell, definition: FieldDefinition) {
  const label = normalizeLabel(cell.displayText || cell.rawValue);
  return definition.aliases.some((alias) => label.includes(normalizeLabel(alias)));
}

function detectHeader(
  sheet: ExcelWorkbookSheet,
  definitions: readonly FieldDefinition[],
) {
  let best: HeaderDetection | null = null;

  for (const row of sheet.rows) {
    const columns = new Map<string, ExcelWorkbookCell>();
    for (const definition of definitions) {
      const cell = row.cells.find((candidate) =>
        matchesDefinition(candidate, definition),
      );
      if (cell) {
        columns.set(definition.field, cell);
      }
    }
    if (!best || columns.size > best.columns.size) {
      best = { rowNumber: row.rowNumber, columns };
    }
  }

  return best;
}

function sheetScoreForProject(sheet: ExcelWorkbookSheet) {
  return PROJECT_FIELDS.filter((definition) =>
    sheet.rows.some((row) =>
      row.cells.some((cell) => matchesDefinition(cell, definition)),
    ),
  ).length;
}

function sheetScoreForTable(
  sheet: ExcelWorkbookSheet,
  definitions: readonly FieldDefinition[],
) {
  return detectHeader(sheet, definitions)?.columns.size ?? 0;
}

function selectSheetName(
  workbook: ExcelWorkbookData,
  preferredName: string,
  score: (sheet: ExcelWorkbookSheet) => number,
) {
  const preferred = workbook.sheets.find((sheet) => sheet.name === preferredName);
  if (preferred) {
    return preferred.name;
  }
  return (
    workbook.sheets
      .map((sheet) => ({ name: sheet.name, score: score(sheet) }))
      .toSorted((left, right) => right.score - left.score)[0]?.name ?? ""
  );
}

function detectMapping(
  workbook: ExcelWorkbookData,
  requestedMapping?: ExcelImportMapping,
): ExcelImportMapping {
  if (requestedMapping) {
    return requestedMapping;
  }

  return {
    projectSheetName: selectSheetName(
      workbook,
      "参数设置",
      sheetScoreForProject,
    ),
    candidateSheetName: selectSheetName(
      workbook,
      "参数设置",
      (sheet) => sheetScoreForTable(sheet, CANDIDATE_FIELDS),
    ),
    performanceSheetName: selectSheetName(
      workbook,
      "履约信息",
      (sheet) => sheetScoreForTable(sheet, PERFORMANCE_FIELDS),
    ),
  };
}

function issue(input: ExcelImportIssue) {
  return input;
}

function missingSheetIssue(section: "project" | "candidate" | "performance", name: string) {
  return issue({
    severity: "error",
    section,
    sheetName: name || null,
    rowNumber: null,
    columnName: null,
    field: null,
    message: name ? `找不到映射的工作表“${name}”。` : "尚未映射工作表。",
  });
}

function findProjectSource(
  sheet: ExcelWorkbookSheet,
  definition: FieldDefinition,
): ProjectSource | null {
  for (const row of sheet.rows) {
    const labelCell = row.cells.find((cell) =>
      matchesDefinition(cell, definition),
    );
    if (labelCell) {
      return {
        labelCell,
        valueCell: findCell(sheet, row.rowNumber, labelCell.columnNumber + 1),
      };
    }
  }
  return null;
}

function projectMapping(
  definition: FieldDefinition,
  sheet: ExcelWorkbookSheet | undefined,
  source: ProjectSource | null,
): ExcelImportFieldMapping {
  return {
    section: "project",
    targetField: definition.field,
    targetLabel: definition.label,
    required: definition.required,
    sourceSheet: sheet?.name ?? null,
    sourceLocation: source?.valueCell?.address ?? null,
    sourceLabel: source?.labelCell.displayText ?? null,
    detected: source?.valueCell !== null && source !== null,
  };
}

function tableMappings(
  section: "candidate" | "performance",
  definitions: readonly FieldDefinition[],
  sheet: ExcelWorkbookSheet | undefined,
  header: HeaderDetection | null,
) {
  return definitions.map(
    (definition): ExcelImportFieldMapping => {
      const cell = header?.columns.get(definition.field);
      return {
        section,
        targetField: definition.field,
        targetLabel: definition.label,
        required: definition.required,
        sourceSheet: sheet?.name ?? null,
        sourceLocation: cell?.address ?? null,
        sourceLabel: cell?.displayText ?? null,
        detected: cell !== undefined,
      };
    },
  );
}

function parseDecimal(
  cell: ExcelWorkbookCell | null,
  options: {
    section: "project" | "candidate" | "performance";
    sheetName: string;
    field: string;
    label: string;
    issues: ExcelImportIssue[];
    positive?: boolean;
    nonNegative?: boolean;
  },
) {
  if (!cell || !cell.rawValue.trim() || isPlaceholder(cell.displayText)) {
    options.issues.push(
      issue({
        severity: "error",
        section: options.section,
        sheetName: options.sheetName,
        rowNumber: cell?.rowNumber ?? null,
        columnName: cell?.address ?? null,
        field: options.field,
        message: `${options.label}缺少有效数字。`,
      }),
    );
    return null;
  }

  try {
    const decimal = new Decimal(cell.rawValue.replaceAll(",", "").trim());
    if (!decimal.isFinite()) {
      throw new Error("not finite");
    }
    if (options.positive && !decimal.greaterThan(0)) {
      options.issues.push(
        issue({
          severity: "error",
          section: options.section,
          sheetName: options.sheetName,
          rowNumber: cell.rowNumber,
          columnName: cell.address,
          field: options.field,
          message: `${options.label}必须大于0。`,
        }),
      );
      return null;
    }
    if (options.nonNegative && decimal.isNegative()) {
      options.issues.push(
        issue({
          severity: "error",
          section: options.section,
          sheetName: options.sheetName,
          rowNumber: cell.rowNumber,
          columnName: cell.address,
          field: options.field,
          message: `${options.label}不能小于0。`,
        }),
      );
      return null;
    }
    return decimal.toString();
  } catch {
    options.issues.push(
      issue({
        severity: "error",
        section: options.section,
        sheetName: options.sheetName,
        rowNumber: cell.rowNumber,
        columnName: cell.address,
        field: options.field,
        message: `${options.label}“${cell.displayText || cell.rawValue}”无法解析为数字。`,
      }),
    );
    return null;
  }
}

function parseDisplayedRate(
  cell: ExcelWorkbookCell | null,
  options: {
    section: "project" | "candidate";
    sheetName: string;
    field: string;
    label: string;
    issues: ExcelImportIssue[];
    bounded: boolean;
  },
) {
  const textContainsPercent =
    cell !== null && !cell.isPercentage && cell.displayText.includes("%");
  const numericCell =
    cell && textContainsPercent
      ? {
          ...cell,
          rawValue: cell.displayText.replace("%", "").trim(),
        }
      : cell;
  const parsed = parseDecimal(numericCell, {
    section: options.section,
    sheetName: options.sheetName,
    field: options.field,
    label: options.label,
    issues: options.issues,
  });
  if (parsed === null || !cell) {
    return null;
  }

  const value = new Decimal(parsed);
  const storedRate = cell.isPercentage ? value : value.dividedBy(100);
  if (
    options.bounded &&
    (storedRate.isNegative() || storedRate.greaterThan(1))
  ) {
    options.issues.push(
      issue({
        severity: "error",
        section: options.section,
        sheetName: options.sheetName,
        rowNumber: cell.rowNumber,
        columnName: cell.address,
        field: options.field,
        message: `${options.label}必须在0%到100%之间。`,
      }),
    );
    return null;
  }
  return storedRate.toString();
}

function parseProjectTypes(
  cell: ExcelWorkbookCell | null,
  sheetName: string,
  issues: ExcelImportIssue[],
) {
  const display = cell?.displayText.trim() ?? "";
  if (!cell || !display || isPlaceholder(display)) {
    issues.push(
      issue({
        severity: "error",
        section: "project",
        sheetName,
        rowNumber: cell?.rowNumber ?? null,
        columnName: cell?.address ?? null,
        field: "projectTypes",
        message: "项目类型缺失或仍为模板占位内容。",
      }),
    );
    return null;
  }
  const values = PROJECT_TYPE_LABELS.filter(([label]) => display.includes(label)).map(
    ([, value]) => value,
  );
  if (values.length === 0) {
    issues.push(
      issue({
        severity: "error",
        section: "project",
        sheetName,
        rowNumber: cell.rowNumber,
        columnName: cell.address,
        field: "projectTypes",
        message: `项目类型“${display}”无法识别，应为幕墙、装修、总包或实验室。`,
      }),
    );
    return null;
  }
  return [...new Set(values)];
}

function findFinalDrawSources(sheet: ExcelWorkbookSheet) {
  const directDefinitions = [1, 2, 3].map((slot) => ({
    field: `finalDrawValue${slot}`,
    label: `定标抽值${slot}`,
    aliases: [`定标抽值${slot}`, `抽值${slot}`],
    required: true,
  })) satisfies readonly FieldDefinition[];
  const direct = directDefinitions.map((definition) =>
    findProjectSource(sheet, definition),
  );
  if (direct.every((source) => source !== null)) {
    return direct;
  }

  const baseDefinition: FieldDefinition = {
    field: "finalDrawValues",
    label: "定标抽值",
    aliases: ["定标抽值"],
    required: true,
  };
  const base = findProjectSource(sheet, baseDefinition);
  if (!base) {
    return [null, null, null] as const;
  }
  return [1, 2, 3].map(
    (offset): ProjectSource => ({
      labelCell: base.labelCell,
      valueCell: findCell(
        sheet,
        base.labelCell.rowNumber,
        base.labelCell.columnNumber + offset,
      ),
    }),
  );
}

function parseProject(
  sheet: ExcelWorkbookSheet | undefined,
  issues: ExcelImportIssue[],
  fieldMappings: ExcelImportFieldMapping[],
) {
  if (!sheet) {
    return null;
  }

  const sources = new Map(
    PROJECT_FIELDS.map((definition) => [
      definition.field,
      findProjectSource(sheet, definition),
    ]),
  );
  for (const definition of PROJECT_FIELDS) {
    const source = sources.get(definition.field) ?? null;
    fieldMappings.push(projectMapping(definition, sheet, source));
    if (!source?.valueCell) {
      issues.push(
        issue({
          severity: "error",
          section: "project",
          sheetName: sheet.name,
          rowNumber: source?.labelCell.rowNumber ?? null,
          columnName: source?.labelCell.address ?? null,
          field: definition.field,
          message: `缺少必要字段“${definition.label}”的值。`,
        }),
      );
    }
  }

  const drawSources = findFinalDrawSources(sheet);
  drawSources.forEach((source, index) => {
    const slot = index + 1;
    fieldMappings.push({
      section: "project",
      targetField: `finalDrawValue${slot}`,
      targetLabel: `定标抽值${slot}`,
      required: true,
      sourceSheet: sheet.name,
      sourceLocation: source?.valueCell?.address ?? null,
      sourceLabel: source?.labelCell.displayText ?? null,
      detected: source?.valueCell !== null && source !== null,
    });
    if (!source?.valueCell) {
      issues.push(
        issue({
          severity: "error",
          section: "project",
          sheetName: sheet.name,
          rowNumber: source?.labelCell.rowNumber ?? null,
          columnName: source?.labelCell.address ?? null,
          field: `finalDrawValue${slot}`,
          message: `缺少必要字段“定标抽值${slot}”的值。`,
        }),
      );
    }
  });

  const nameCell = sources.get("name")?.valueCell ?? null;
  const name = nameCell?.displayText.trim() ?? "";
  if (nameCell && (!name || isPlaceholder(name))) {
    issues.push(
      issue({
        severity: "error",
        section: "project",
        sheetName: sheet.name,
        rowNumber: nameCell.rowNumber,
        columnName: nameCell.address,
        field: "name",
        message: "项目名称不能为空或使用模板占位内容。",
      }),
    );
  }

  const maxBidPrice = parseDecimal(sources.get("maxBidPrice")?.valueCell ?? null, {
    section: "project",
    sheetName: sheet.name,
    field: "maxBidPrice",
    label: "最高投标限价",
    issues,
    positive: true,
  });
  const nonCompetitiveFee = parseDecimal(
    sources.get("nonCompetitiveFee")?.valueCell ?? null,
    {
      section: "project",
      sheetName: sheet.name,
      field: "nonCompetitiveFee",
      label: "不可竞争费",
      issues,
      nonNegative: true,
    },
  );
  const projectTypes = parseProjectTypes(
    sources.get("projectTypes")?.valueCell ?? null,
    sheet.name,
    issues,
  );
  const totalBidPriceScore = parseDecimal(
    sources.get("totalBidPriceScore")?.valueCell ?? null,
    {
      section: "project",
      sheetName: sheet.name,
      field: "totalBidPriceScore",
      label: "总投标报价分值",
      issues,
      nonNegative: true,
    },
  );
  const rankDeduction = parseDecimal(
    sources.get("rankDeduction")?.valueCell ?? null,
    {
      section: "project",
      sheetName: sheet.name,
      field: "rankDeduction",
      label: "排名递减扣分值",
      issues,
      nonNegative: true,
    },
  );
  const finalDrawValue1 = parseDisplayedRate(drawSources[0]?.valueCell ?? null, {
    section: "project",
    sheetName: sheet.name,
    field: "finalDrawValue1",
    label: "定标抽值1",
    issues,
    bounded: false,
  });
  const finalDrawValue2 = parseDisplayedRate(drawSources[1]?.valueCell ?? null, {
    section: "project",
    sheetName: sheet.name,
    field: "finalDrawValue2",
    label: "定标抽值2",
    issues,
    bounded: false,
  });
  const finalDrawValue3 = parseDisplayedRate(drawSources[2]?.valueCell ?? null, {
    section: "project",
    sheetName: sheet.name,
    field: "finalDrawValue3",
    label: "定标抽值3",
    issues,
    bounded: false,
  });

  if (
    maxBidPrice &&
    nonCompetitiveFee &&
    !new Decimal(maxBidPrice).greaterThan(nonCompetitiveFee)
  ) {
    const cell = sources.get("maxBidPrice")?.valueCell ?? null;
    issues.push(
      issue({
        severity: "error",
        section: "project",
        sheetName: sheet.name,
        rowNumber: cell?.rowNumber ?? null,
        columnName: cell?.address ?? null,
        field: "maxBidPrice",
        message: "最高投标限价必须大于不可竞争费。",
      }),
    );
  }

  if (
    !name ||
    isPlaceholder(name) ||
    !maxBidPrice ||
    !nonCompetitiveFee ||
    !projectTypes ||
    !totalBidPriceScore ||
    !rankDeduction ||
    finalDrawValue1 === null ||
    finalDrawValue2 === null ||
    finalDrawValue3 === null
  ) {
    return null;
  }

  return {
    name,
    maxBidPrice,
    nonCompetitiveFee,
    projectTypes,
    totalBidPriceScore,
    rankDeduction,
    finalDrawValue1,
    finalDrawValue2,
    finalDrawValue3,
  };
}

function columnNumber(
  header: HeaderDetection | null,
  field: string,
) {
  return header?.columns.get(field)?.columnNumber;
}

function parseBoolean(cell: ExcelWorkbookCell | null) {
  if (!cell || !cell.displayText.trim()) {
    return false;
  }
  return /^(是|true|yes|1|我方)$/i.test(cell.displayText.trim());
}

function isRepeatedHeaderRow(
  row: ExcelWorkbookRow,
  header: HeaderDetection,
  definitions: readonly FieldDefinition[],
) {
  const matched = definitions.filter((definition) => {
    const column = columnNumber(header, definition.field);
    const cell = valueOf(row, column);
    return cell ? matchesDefinition(cell, definition) : false;
  }).length;
  return matched >= Math.min(3, definitions.length);
}

function parseCandidates(
  sheet: ExcelWorkbookSheet | undefined,
  issues: ExcelImportIssue[],
  fieldMappings: ExcelImportFieldMapping[],
) {
  if (!sheet) {
    return [];
  }
  const header = detectHeader(sheet, CANDIDATE_FIELDS);
  fieldMappings.push(...tableMappings("candidate", CANDIDATE_FIELDS, sheet, header));
  if (!header) {
    issues.push(
      issue({
        severity: "error",
        section: "candidate",
        sheetName: sheet.name,
        rowNumber: null,
        columnName: null,
        field: null,
        message: "未识别候选单位表头。",
      }),
    );
    return [];
  }
  for (const definition of CANDIDATE_FIELDS.filter((item) => item.required)) {
    if (!header.columns.has(definition.field)) {
      issues.push(
        issue({
          severity: "error",
          section: "candidate",
          sheetName: sheet.name,
          rowNumber: header.rowNumber,
          columnName: null,
          field: definition.field,
          message: `候选单位表缺少必要字段“${definition.label}”。`,
        }),
      );
    }
  }
  if (
    CANDIDATE_FIELDS.some(
      (definition) => definition.required && !header.columns.has(definition.field),
    )
  ) {
    return [];
  }

  const candidates: ImportedProjectCandidate[] = [];
  const firstRowsByCompany = new Map<string, number>();
  let ourCompanyRow: number | null = null;
  for (const row of sheet.rows.filter((item) => item.rowNumber > header.rowNumber)) {
    if (isRepeatedHeaderRow(row, header, CANDIDATE_FIELDS)) {
      continue;
    }
    const mappedCells = CANDIDATE_FIELDS.map((definition) =>
      valueOf(row, columnNumber(header, definition.field)),
    );
    if (mappedCells.every((cell) => !cell?.displayText.trim())) {
      continue;
    }

    const issueCount = issues.length;
    const companyCell = valueOf(row, columnNumber(header, "companyName"));
    const companyName = companyCell?.displayText.trim() ?? "";
    if (!companyName || isPlaceholder(companyName)) {
      issues.push(
        issue({
          severity: "error",
          section: "candidate",
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: companyCell?.address ?? null,
          field: "companyName",
          message: `第${row.rowNumber}行单位名称为空或仍为模板占位内容。`,
        }),
      );
    } else {
      const duplicateKey = companyName.toLocaleLowerCase();
      const firstRow = firstRowsByCompany.get(duplicateKey);
      if (firstRow !== undefined) {
        issues.push(
          issue({
            severity: "error",
            section: "candidate",
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: companyCell?.address ?? null,
            field: "companyName",
            message: `第${row.rowNumber}行候选单位“${companyName}”与第${firstRow}行重复。`,
          }),
        );
      } else {
        firstRowsByCompany.set(duplicateKey, row.rowNumber);
      }
    }

    const bidPrice = parseDecimal(valueOf(row, columnNumber(header, "bidPrice")), {
      section: "candidate",
      sheetName: sheet.name,
      field: "bidPrice",
      label: `第${row.rowNumber}行投标总价`,
      issues,
      positive: true,
    });
    const netDiscountRate = parseDisplayedRate(
      valueOf(row, columnNumber(header, "netDiscountRate")),
      {
        section: "candidate",
        sheetName: sheet.name,
        field: "netDiscountRate",
        label: `第${row.rowNumber}行净下浮率`,
        issues,
        bounded: true,
      },
    );
    const scoreFields = [
      ["trademarkScore", "商标优"],
      ["technicalScore", "技术优"],
      ["similarExperienceScore", "同类业绩"],
      ["otherScore", "其他主客观分"],
    ] as const;
    const scores = new Map<string, string | null>();
    for (const [field, label] of scoreFields) {
      scores.set(
        field,
        parseDecimal(valueOf(row, columnNumber(header, field)), {
          section: "candidate",
          sheetName: sheet.name,
          field,
          label: `第${row.rowNumber}行${label}`,
          issues,
          nonNegative: true,
        }),
      );
    }
    const isOurCompany = parseBoolean(
      valueOf(row, columnNumber(header, "isOurCompany")),
    );
    if (isOurCompany) {
      if (ourCompanyRow !== null) {
        issues.push(
          issue({
            severity: "error",
            section: "candidate",
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: null,
            field: "isOurCompany",
            message: `第${row.rowNumber}行与第${ourCompanyRow}行同时标记为我方单位。`,
          }),
        );
      } else {
        ourCompanyRow = row.rowNumber;
      }
    }

    const trademarkScore = scores.get("trademarkScore") ?? null;
    const technicalScore = scores.get("technicalScore") ?? null;
    const similarExperienceScore = scores.get("similarExperienceScore") ?? null;
    const otherScore = scores.get("otherScore") ?? null;
    if (
      issues.length === issueCount &&
      companyName &&
      bidPrice &&
      netDiscountRate !== null &&
      trademarkScore &&
      technicalScore &&
      similarExperienceScore &&
      otherScore
    ) {
      candidates.push({
        sourceRow: row.rowNumber,
        companyName,
        bidPrice,
        netDiscountRate,
        trademarkScore,
        technicalScore,
        similarExperienceScore,
        otherScore,
        isOurCompany,
      });
    }
  }

  if (candidates.length === 0) {
    issues.push(
      issue({
        severity: "error",
        section: "candidate",
        sheetName: sheet.name,
        rowNumber: null,
        columnName: null,
        field: null,
        message: "未找到可导入的候选单位数据。",
      }),
    );
  }
  return candidates;
}

function parseSingleProjectType(
  cell: ExcelWorkbookCell | null,
  sheetName: string,
  rowNumber: number,
  issues: ExcelImportIssue[],
) {
  const display = cell?.displayText.trim() ?? "";
  if (!cell || !display || isPlaceholder(display)) {
    issues.push(
      issue({
        severity: "error",
        section: "performance",
        sheetName,
        rowNumber,
        columnName: cell?.address ?? null,
        field: "projectType",
        message: `第${rowNumber}行项目类型缺失或仍为模板占位内容。`,
      }),
    );
    return null;
  }
  const values = PROJECT_TYPE_LABELS.filter(([label]) => display.includes(label));
  if (values.length !== 1) {
    issues.push(
      issue({
        severity: "error",
        section: "performance",
        sheetName,
        rowNumber,
        columnName: cell.address,
        field: "projectType",
        message: `第${rowNumber}行项目类型“${display}”无法唯一识别。`,
      }),
    );
    return null;
  }
  return values[0]?.[1] ?? null;
}

function parseQuarterHeader(cell: ExcelWorkbookCell) {
  const value = normalizeLabel(cell.displayText || cell.rawValue);
  const chineseMatch = value.match(/^(\d{2}|20\d{2})年?第?([1-4])季度/);
  const qMatch = value.match(/^(\d{2}|20\d{2})q([1-4])/i);
  const match = chineseMatch ?? qMatch;
  if (!match) {
    return null;
  }
  const yearText = match[1];
  const quarterText = match[2];
  if (!yearText || !quarterText) {
    return null;
  }
  const yearNumber = Number(yearText);
  const year = yearText.length === 2 ? 2000 + yearNumber : yearNumber;
  const quarter = Number(quarterText);
  if (year < 2000 || quarter < 1 || quarter > 4) {
    return null;
  }
  return { year, quarter };
}

function parsePerformance(
  sheet: ExcelWorkbookSheet | undefined,
  issues: ExcelImportIssue[],
  fieldMappings: ExcelImportFieldMapping[],
) {
  if (!sheet) {
    return [];
  }
  const header = detectHeader(sheet, PERFORMANCE_FIELDS);
  fieldMappings.push(
    ...tableMappings("performance", PERFORMANCE_FIELDS, sheet, header),
  );
  if (!header) {
    issues.push(
      issue({
        severity: "error",
        section: "performance",
        sheetName: sheet.name,
        rowNumber: null,
        columnName: null,
        field: null,
        message: "未识别履约数据表头。",
      }),
    );
    return [];
  }
  for (const definition of PERFORMANCE_FIELDS) {
    if (!header.columns.has(definition.field)) {
      issues.push(
        issue({
          severity: "error",
          section: "performance",
          sheetName: sheet.name,
          rowNumber: header.rowNumber,
          columnName: null,
          field: definition.field,
          message: `履约表缺少必要字段“${definition.label}”。`,
        }),
      );
    }
  }
  const headerRow = sheet.rows.find((row) => row.rowNumber === header.rowNumber);
  const quarterColumns =
    headerRow?.cells.flatMap((cell) => {
      const quarter = parseQuarterHeader(cell);
      return quarter ? [{ cell, ...quarter }] : [];
    }) ?? [];
  for (const quarter of quarterColumns) {
    fieldMappings.push({
      section: "performance",
      targetField: `score:${quarter.year}Q${quarter.quarter}`,
      targetLabel: `${quarter.year}年第${quarter.quarter}季度评分`,
      required: false,
      sourceSheet: sheet.name,
      sourceLocation: quarter.cell.address,
      sourceLabel: quarter.cell.displayText,
      detected: true,
    });
  }
  if (quarterColumns.length === 0) {
    issues.push(
      issue({
        severity: "error",
        section: "performance",
        sheetName: sheet.name,
        rowNumber: header.rowNumber,
        columnName: null,
        field: "score",
        message: "履约表至少需要一个可识别的季度评分列，例如“2025年1季度平均分”或“2025Q1”。",
      }),
    );
  }
  if (
    PERFORMANCE_FIELDS.some(
      (definition) => !header.columns.has(definition.field),
    ) || quarterColumns.length === 0
  ) {
    return [];
  }

  const records: ImportedCompanyPerformance[] = [];
  const identities = new Map<string, { row: number; column: string }>();
  for (const row of sheet.rows.filter((item) => item.rowNumber > header.rowNumber)) {
    if (isRepeatedHeaderRow(row, header, PERFORMANCE_FIELDS)) {
      continue;
    }
    const companyCell = valueOf(row, columnNumber(header, "companyName"));
    const typeCell = valueOf(row, columnNumber(header, "projectType"));
    const levelCell = valueOf(row, columnNumber(header, "classificationLevel"));
    const scoreCells = quarterColumns.map((quarter) =>
      valueOf(row, quarter.cell.columnNumber),
    );
    if (
      !companyCell?.displayText.trim() &&
      !typeCell?.displayText.trim() &&
      !levelCell?.displayText.trim() &&
      scoreCells.every((cell) => !cell?.displayText.trim())
    ) {
      continue;
    }

    const rowIssueCount = issues.length;
    const companyName = companyCell?.displayText.trim() ?? "";
    if (!companyName || isPlaceholder(companyName)) {
      issues.push(
        issue({
          severity: "error",
          section: "performance",
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: companyCell?.address ?? null,
          field: "companyName",
          message: `第${row.rowNumber}行单位名称为空或仍为模板占位内容。`,
        }),
      );
    }
    const projectType = parseSingleProjectType(
      typeCell,
      sheet.name,
      row.rowNumber,
      issues,
    );
    const classificationLevel = levelCell?.displayText.trim() ?? "";
    if (!classificationLevel || isPlaceholder(classificationLevel)) {
      issues.push(
        issue({
          severity: "error",
          section: "performance",
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: levelCell?.address ?? null,
          field: "classificationLevel",
          message: `第${row.rowNumber}行分类分级等级不能为空或使用模板占位内容。`,
        }),
      );
    }

    let quarterValueCount = 0;
    const rowRecords: ImportedCompanyPerformance[] = [];
    for (const quarter of quarterColumns) {
      const scoreCell = valueOf(row, quarter.cell.columnNumber);
      if (!scoreCell?.displayText.trim()) {
        continue;
      }
      quarterValueCount += 1;
      const score = parseDecimal(scoreCell, {
        section: "performance",
        sheetName: sheet.name,
        field: "score",
        label: `第${row.rowNumber}行${quarter.year}Q${quarter.quarter}评分`,
        issues,
        nonNegative: true,
      });
      if (!score || !companyName || !projectType || !classificationLevel) {
        continue;
      }
      const identity = `${companyName}\u0000${projectType}\u0000${quarter.year}\u0000${quarter.quarter}`;
      const first = identities.get(identity);
      if (first) {
        issues.push(
          issue({
            severity: "error",
            section: "performance",
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: scoreCell.address,
            field: "score",
            message: `第${row.rowNumber}行${quarter.year}Q${quarter.quarter}履约记录与第${first.row}行重复。`,
          }),
        );
        continue;
      }
      identities.set(identity, { row: row.rowNumber, column: scoreCell.address });
      rowRecords.push({
        sourceRow: row.rowNumber,
        sourceColumn: scoreCell.address,
        companyName,
        projectType,
        classificationLevel,
        year: quarter.year,
        quarter: quarter.quarter,
        score,
      });
    }
    if (quarterValueCount === 0) {
      issues.push(
        issue({
          severity: "error",
          section: "performance",
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: null,
          field: "score",
          message: `第${row.rowNumber}行至少需要填写一个季度评分。`,
        }),
      );
    }
    if (issues.length === rowIssueCount) {
      records.push(...rowRecords);
    }
  }

  if (records.length === 0) {
    issues.push(
      issue({
        severity: "error",
        section: "performance",
        sheetName: sheet.name,
        rowNumber: null,
        columnName: null,
        field: null,
        message: "未找到可导入的季度履约数据。",
      }),
    );
  }
  return records;
}

export function parseExcelImportWorkbook(
  workbook: ExcelWorkbookData,
  requestedMapping?: ExcelImportMapping,
): ParsedExcelImport {
  const mapping = detectMapping(workbook, requestedMapping);
  const issues: ExcelImportIssue[] = [];
  const fieldMappings: ExcelImportFieldMapping[] = [];
  const projectSheet = workbook.sheets.find(
    (sheet) => sheet.name === mapping.projectSheetName,
  );
  const candidateSheet = workbook.sheets.find(
    (sheet) => sheet.name === mapping.candidateSheetName,
  );
  const performanceSheet = workbook.sheets.find(
    (sheet) => sheet.name === mapping.performanceSheetName,
  );

  if (!projectSheet) {
    issues.push(missingSheetIssue("project", mapping.projectSheetName));
  }
  if (!candidateSheet) {
    issues.push(missingSheetIssue("candidate", mapping.candidateSheetName));
  }
  if (!performanceSheet) {
    issues.push(missingSheetIssue("performance", mapping.performanceSheetName));
  }

  const project = parseProject(projectSheet, issues, fieldMappings);
  const candidates = parseCandidates(candidateSheet, issues, fieldMappings);
  const performanceRecords = parsePerformance(
    performanceSheet,
    issues,
    fieldMappings,
  );

  for (const ignoredSheetName of ["清标测算", "定标测算"]) {
    if (workbook.sheets.some((sheet) => sheet.name === ignoredSheetName)) {
      issues.push(
        issue({
          severity: "warning",
          section: "workbook",
          sheetName: ignoredSheetName,
          rowNumber: null,
          columnName: null,
          field: null,
          message: `已识别“${ignoredSheetName}”，其中旧计算结果不会导入，仅可用于后续对照测试。`,
        }),
      );
    }
  }

  return {
    workbookSheets: workbook.sheets.map((sheet) => sheet.name),
    mapping,
    fieldMappings,
    issues,
    data: project ? { project, candidates, performanceRecords } : null,
  };
}

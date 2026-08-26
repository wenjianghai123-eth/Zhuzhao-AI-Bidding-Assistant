import { describe, expect, it } from "vitest";

import type { CandidateFormValues } from "@/features/candidates/candidate-form-schema";
import {
  CANDIDATE_CSV_COLUMNS,
  CANDIDATE_TABLE_COLUMNS,
  createCandidateCsv,
  parseCandidatePaste,
} from "@/features/candidates/candidate-table-contract";

const firstCandidate: CandidateFormValues = {
  companyName: "星辉幕墙工程有限公司",
  bidPrice: "9860.5",
  netDiscountRate: "17.8",
  trademarkScore: "1",
  technicalScore: "0",
  similarExperienceScore: "8",
  otherScore: "12",
  isOurCompany: false,
};

describe("candidate table contract", () => {
  it("keeps the exact business column order without an own-company column", () => {
    expect(CANDIDATE_TABLE_COLUMNS).toEqual([
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
  });

  it("parses Excel tab rows, statuses and percentage points without multiplying", () => {
    const preview = parseCandidatePaste(
      [
        "星辉幕墙工程有限公司\t9860.5\t17.8\t有\t\t8\t12",
        "和越装饰工程有限公司\t9720\t19\t无\t有\t7\t11",
      ].join("\n"),
    );

    expect(preview.hasErrors).toBe(false);
    expect(preview.rows.map(({ values }) => values)).toEqual([
      firstCandidate,
      {
        companyName: "和越装饰工程有限公司",
        bidPrice: "9720",
        netDiscountRate: "19",
        trademarkScore: "0",
        technicalScore: "1",
        similarExperienceScore: "7",
        otherScore: "11",
        isOurCompany: false,
      },
    ]);
  });

  it("accepts a pasted header and highlights every invalid business field", () => {
    const preview = parseCandidatePaste(
      [
        "单位名称\t投标总价\t净下浮率\t商务优\t技术优\t同类业绩\t其他主客观分",
        "\t非法\t101\t未知\t有\t业绩\t-1",
      ].join("\n"),
    );

    expect(preview.rows).toHaveLength(1);
    expect(preview.hasErrors).toBe(true);
    expect(preview.rows[0]?.fieldErrors).toMatchObject({
      companyName: ["请输入单位名称"],
      bidPrice: ["投标总价必须是有效数字"],
      netDiscountRate: ["净下浮率必须在 0% 至 100% 之间"],
      trademarkScore: ["商务优必须选择“有”或“无”"],
      similarExperienceScore: ["同类业绩必须是有效数字"],
      otherScore: ["其他主客观分不能小于 0"],
    });
  });

  it("rejects duplicate company names before any database write", () => {
    const row = "星辉幕墙工程有限公司\t9860.5\t17.8\t有\t无\t8\t12";
    const preview = parseCandidatePaste(`${row}\n${row}`);

    expect(preview.hasErrors).toBe(true);
    expect(preview.rows[1]?.fieldErrors.companyName).toContain(
      "与第 1 行单位名称重复",
    );
  });
});

describe("candidate CSV contract", () => {
  it("exports business columns, percentage points and preferred statuses", () => {
    const csv = createCandidateCsv([
      firstCandidate,
      {
        ...firstCandidate,
        companyName: "和越,装饰工程有限公司",
        netDiscountRate: "18.75",
        trademarkScore: "0",
        technicalScore: "1",
      },
    ]);

    expect(CANDIDATE_CSV_COLUMNS).toEqual([
      "序号",
      "单位名称",
      "投标总价（万元）",
      "净下浮率",
      "商务优",
      "技术优",
      "同类业绩",
      "其他主客观分",
    ]);
    expect(csv).toContain(
      "\uFEFF序号,单位名称,投标总价（万元）,净下浮率,商务优,技术优,同类业绩,其他主客观分\r\n",
    );
    expect(csv).toContain(
      "1,星辉幕墙工程有限公司,9860.5,17.8,有,无,8,12\r\n",
    );
    expect(csv).toContain(
      '2,"和越,装饰工程有限公司",9860.5,18.75,无,有,8,12\r\n',
    );
    expect(csv).not.toContain("0.178");
  });
});

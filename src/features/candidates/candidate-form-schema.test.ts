import { describe, expect, it } from "vitest";

import {
  candidateFormSchema,
  getCandidateFormFieldErrors,
  toCandidateFormValues,
  toProjectCandidateInput,
  type CandidateFormValues,
} from "@/features/candidates/candidate-form-schema";

const validValues: CandidateFormValues = {
  companyName: "华南建设股份有限公司",
  bidPrice: "7850.25",
  netDiscountRate: "10.38",
  trademarkScore: "1",
  technicalScore: "0",
  similarExperienceScore: "8",
  otherScore: "6.25",
  isOurCompany: true,
};

describe("candidateFormSchema", () => {
  it("maps UI percentage input to an exact stored decimal fraction", () => {
    const result = candidateFormSchema.safeParse(validValues);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(toProjectCandidateInput(result.data)).toEqual({
      companyName: "华南建设股份有限公司",
      bidPrice: "7850.25",
      netDiscountRate: "0.1038",
      trademarkScore: "1",
      technicalScore: "0",
      similarExperienceScore: "8",
      otherScore: "6.25",
      isOurCompany: true,
    });
  });

  it("requires a positive bid price", () => {
    const result = candidateFormSchema.safeParse({
      ...validValues,
      bidPrice: "0",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getCandidateFormFieldErrors(result.error).bidPrice).toContain(
      "投标总价必须大于 0",
    );
  });

  it("restricts the displayed discount rate to a legal percentage", () => {
    const result = candidateFormSchema.safeParse({
      ...validValues,
      netDiscountRate: "100.01",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getCandidateFormFieldErrors(result.error).netDiscountRate).toContain(
      "净下浮率必须在 0% 至 100% 之间",
    );
  });

  it("rejects malformed and negative score inputs without throwing", () => {
    const malformed = candidateFormSchema.safeParse({
      ...validValues,
      technicalScore: "未知",
    });
    const negative = candidateFormSchema.safeParse({
      ...validValues,
      otherScore: "-1",
    });

    expect(malformed.success).toBe(false);
    expect(negative.success).toBe(false);

    if (!malformed.success) {
      expect(
        getCandidateFormFieldErrors(malformed.error).technicalScore,
      ).toContain("技术优必须选择“有”或“无”");
    }
    if (!negative.success) {
      expect(getCandidateFormFieldErrors(negative.error).otherScore).toContain(
        "其他主客观分不能小于 0",
      );
    }
  });
});

describe("candidate persistence mapping", () => {
  it("round-trips stored rate fractions to UI percentages", () => {
    const stored = {
      id: "candidate-001",
      projectId: "project-001",
      ...toProjectCandidateInput(validValues),
    };

    expect(toCandidateFormValues(stored)).toEqual(validValues);
  });

  it("stores 17.8 percentage points as the 0.178 fraction", () => {
    expect(
      toProjectCandidateInput({
        ...validValues,
        netDiscountRate: "17.8",
      }).netDiscountRate,
    ).toBe("0.178");
  });

  it("displays the stored 0.1875 fraction as 18.75 percentage points", () => {
    expect(
      toCandidateFormValues({
        id: "candidate-002",
        projectId: "project-001",
        ...toProjectCandidateInput(validValues),
        netDiscountRate: "0.1875",
        trademarkScore: "100",
        technicalScore: "0",
      }),
    ).toMatchObject({
      netDiscountRate: "18.75",
      trademarkScore: "1",
      technicalScore: "0",
    });
  });
});

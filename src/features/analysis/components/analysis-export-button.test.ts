import { describe, expect, it } from "vitest";

import { getDownloadFileName } from "@/features/analysis/components/analysis-export-button";

describe("analysis download filename", () => {
  it("prefers and decodes the UTF-8 filename", () => {
    expect(
      getDownloadFileName(
        "attachment; filename=\"zhuzhao-analysis.xlsx\"; filename*=UTF-8''%E7%83%9B%E7%85%A7AI%E6%8A%95%E6%A0%87%E5%88%86%E6%9E%90.xlsx",
        "fallback.xlsx",
      ),
    ).toBe("烛照AI投标分析.xlsx");
  });

  it("uses a safe fallback for malformed or absent metadata", () => {
    expect(
      getDownloadFileName("attachment; filename*=UTF-8''%E0%A4%A", "fallback.xlsx"),
    ).toBe("fallback.xlsx");
    expect(getDownloadFileName(null, "fallback.xlsx")).toBe("fallback.xlsx");
  });
});

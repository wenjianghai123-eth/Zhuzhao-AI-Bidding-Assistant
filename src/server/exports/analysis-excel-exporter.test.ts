import { describe, expect, it } from "vitest";

import {
  createAnalysisExportFileName,
  sanitizeExportFileNamePart,
} from "@/server/exports/analysis-excel-exporter";

describe("analysis Excel export filename", () => {
  it("sanitizes Windows-illegal project name characters", () => {
    expect(sanitizeExportFileNamePart("深圳/机场:幕墙项目. ")).toBe(
      "深圳_机场_幕墙项目",
    );
    expect(
      createAnalysisExportFileName(
        "深圳/机场幕墙项目",
        new Date(2026, 7, 24),
      ),
    ).toBe("烛照AI投标分析_深圳_机场幕墙项目_20260824.xlsx");
  });

  it("provides a safe fallback for an empty sanitized project name", () => {
    expect(sanitizeExportFileNamePart("... ")).toBe("未命名项目");
  });
});

import { describe, expect, it } from "vitest";

import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_OPTIONS,
} from "@/lib/project-type-labels";

describe("shared project type presentation", () => {
  it("keeps the supported values and Chinese labels in one option source", () => {
    expect(PROJECT_TYPE_OPTIONS).toEqual([
      { value: "CURTAIN_WALL", label: "幕墙" },
      { value: "DECORATION", label: "装修" },
      { value: "GENERAL_CONTRACT", label: "总包" },
      { value: "LABORATORY", label: "实验室" },
    ]);
    expect(
      PROJECT_TYPE_OPTIONS.every(
        ({ value, label }) => PROJECT_TYPE_LABELS[value] === label,
      ),
    ).toBe(true);
  });
});

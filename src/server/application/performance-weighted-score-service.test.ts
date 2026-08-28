import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/performance-weighted-score-repository", () => ({
  prismaPerformanceWeightedScoreRepository: {},
}));

import {
  getPerformanceWeightedPageData,
  getSavedPerformanceAverage,
  savePerformanceWeightedScores,
} from "@/server/application/performance-weighted-score-service";
import type {
  PerformanceWeightedScoreRepository,
  PerformanceWeightedSource,
  SavePerformanceWeightedSnapshotInput,
} from "@/server/repositories/performance-weighted-score-repository";

function createSource(projectId = "project-a"): PerformanceWeightedSource {
  return {
    project: {
      id: projectId,
      name: `项目 ${projectId}`,
      inputRevision: 3,
      projectTypes: ["CURTAIN_WALL", "DECORATION"],
      candidates: [
        { id: `${projectId}-c1`, companyName: "甲公司" },
        { id: `${projectId}-c2`, companyName: "乙公司" },
      ],
    },
    records: [
      {
        candidateId: `${projectId}-c1`,
        companyName: "甲公司",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        year: 2025,
        quarter: 4,
        score: "80",
      },
      {
        candidateId: `${projectId}-c1`,
        companyName: "甲公司",
        projectType: "DECORATION",
        classificationLevel: "B",
        year: 2026,
        quarter: 1,
        score: "90",
      },
      {
        candidateId: `${projectId}-c2`,
        companyName: "乙公司",
        projectType: "CURTAIN_WALL",
        classificationLevel: "A",
        year: 2026,
        quarter: 1,
        score: "86",
      },
    ],
    unlinkedRecordCount: 0,
    savedSnapshot: null,
  };
}

function createRepository(initial = createSource()) {
  let source = initial;
  const savedInputs: SavePerformanceWeightedSnapshotInput[] = [];
  const repository: PerformanceWeightedScoreRepository = {
    findSource: async (projectId) => (source.project.id === projectId ? source : null),
    saveSnapshot: async (_projectId, input) => {
      savedInputs.push(input);
      const savedAt = new Date("2026-08-26T08:00:00.000Z");
      source = {
        ...source,
        savedSnapshot: {
          inputRevision: input.expectedInputRevision,
          startYear: input.startYear,
          startQuarter: input.startQuarter,
          endYear: input.endYear,
          endQuarter: input.endQuarter,
          weightingMethod: input.weightingMethod,
          savedAt,
          rows: input.rows,
        },
      };
      return { status: "saved", savedAt };
    },
  };
  return {
    repository,
    savedInputs,
    setSource(nextSource: PerformanceWeightedSource) {
      source = nextSource;
    },
    makeStale() {
      source = {
        ...source,
        project: { ...source.project, inputRevision: source.project.inputRevision + 1 },
      };
    },
  };
}

describe("project-scoped weighted performance application service", () => {
  it("builds dynamic continuous quarter columns and distinct detail suggestions", async () => {
    const { repository } = createRepository();
    const page = await getPerformanceWeightedPageData(
      "project-a",
      { start: { year: 2025, quarter: 3 }, end: { year: 2026, quarter: 1 } },
      repository,
    );

    expect(page?.quarters).toEqual([
      { year: 2025, quarter: 3 },
      { year: 2025, quarter: 4 },
      { year: 2026, quarter: 1 },
    ]);
    expect(page?.suggestedRows).toHaveLength(3);
    expect(page?.initialRows).toEqual(page?.suggestedRows);
    expect(
      page?.suggestedRows.filter(({ candidateId }) => candidateId === "project-a-c1"),
    ).toHaveLength(2);
  });

  it("reports classification conflicts and unlinked legacy details deterministically", async () => {
    const source = createSource();
    const firstRecord = source.records[0];
    if (!firstRecord) throw new Error("Expected source record.");
    const { repository } = createRepository({
      ...source,
      records: [
        ...source.records,
        {
          ...firstRecord,
          classificationLevel: "C",
          score: "90",
        },
      ],
      unlinkedRecordCount: 2,
    });
    const page = await getPerformanceWeightedPageData("project-a", {}, repository);
    const conflict = page?.catalogRows.find(
      (row) =>
        row.candidateId === "project-a-c1" &&
        row.projectType === "CURTAIN_WALL",
    );

    expect(page).toMatchObject({
      unlinkedRecordCount: 2,
      classificationConflictCount: 1,
    });
    expect(conflict).toMatchObject({
      classificationLevel: "",
      classificationLevels: ["A", "C"],
      classificationConflict: true,
    });
  });

  it("calculates and persists rows on the server instead of trusting UI scores", async () => {
    const { repository, savedInputs } = createRepository();
    const result = await savePerformanceWeightedScores(
      "project-a",
      {
        expectedInputRevision: 3,
        start: { year: 2025, quarter: 4 },
        end: { year: 2026, quarter: 1 },
        weightingMethod: "EQUAL_RECENT_12",
        rows: [
          {
            candidateId: "project-a-c1",
            projectType: "CURTAIN_WALL",
            classificationLevel: "A",
          },
        ],
      },
      repository,
    );

    expect(result.status).toBe("saved");
    expect(savedInputs[0]?.rows[0]).toMatchObject({
      weightedAverage: "80",
      quarterCount: 1,
    });
  });

  it("switches methods, becomes stale, persists linear recency and restores it", async () => {
    const base = createSource();
    const source: PerformanceWeightedSource = {
      ...base,
      project: {
        ...base.project,
        projectTypes: ["CURTAIN_WALL"],
        candidates: [base.project.candidates[0]!],
      },
      records: [
        {
          ...base.records[0]!,
          year: 2026,
          quarter: 1,
          score: "80",
        },
        {
          ...base.records[0]!,
          year: 2026,
          quarter: 2,
          score: "90",
        },
        {
          ...base.records[0]!,
          year: 2026,
          quarter: 3,
          score: "100",
        },
      ],
    };
    const state = createRepository(source);
    const range = {
      start: { year: 2026, quarter: 1 as const },
      end: { year: 2026, quarter: 3 as const },
    };
    const equalPage = await getPerformanceWeightedPageData(
      "project-a",
      { ...range, weightingMethod: "EQUAL_RECENT_12" },
      state.repository,
    );
    expect(equalPage?.catalogRows[0]?.weightedAverage).toBe("90");
    if (!equalPage) throw new Error("Expected equal-weight page.");
    await savePerformanceWeightedScores(
      "project-a",
      {
        expectedInputRevision: equalPage.inputRevision,
        start: equalPage.start,
        end: equalPage.end,
        weightingMethod: equalPage.weightingMethod,
        rows: equalPage.initialRows,
      },
      state.repository,
    );

    const linearPage = await getPerformanceWeightedPageData(
      "project-a",
      { ...range, weightingMethod: "LINEAR_RECENCY_RECENT_12" },
      state.repository,
    );
    expect(linearPage).toMatchObject({
      snapshotStatus: "stale",
      weightingMethod: "LINEAR_RECENCY_RECENT_12",
    });
    expect(linearPage?.catalogRows[0]?.weightedAverage).toBe(
      "93.333333333333333333",
    );
    if (!linearPage) throw new Error("Expected linear-weight page.");
    await savePerformanceWeightedScores(
      "project-a",
      {
        expectedInputRevision: linearPage.inputRevision,
        start: linearPage.start,
        end: linearPage.end,
        weightingMethod: linearPage.weightingMethod,
        rows: linearPage.initialRows,
      },
      state.repository,
    );

    await expect(
      getPerformanceWeightedPageData("project-a", {}, state.repository),
    ).resolves.toMatchObject({
      snapshotStatus: "current",
      weightingMethod: "LINEAR_RECENCY_RECENT_12",
    });
    await expect(
      getSavedPerformanceAverage(
        "project-a",
        "project-a-c1",
        ["CURTAIN_WALL"],
        state.repository,
      ),
    ).resolves.toMatchObject({
      status: "complete",
      averageScore: "93.333333333333333333",
    });
  });

  it("keeps a missing candidate/type cell and weighted average as null", async () => {
    const { repository } = createRepository();
    const page = await getPerformanceWeightedPageData("project-a", {}, repository);
    const missing = page?.catalogRows.find(
      (row) => row.candidateId === "project-a-c2" && row.projectType === "DECORATION",
    );
    expect(missing).toMatchObject({ weightedAverage: null, quarterCount: 0, hasDetails: false });
    expect(missing?.quarterValues.every(({ averageScore }) => averageScore === null)).toBe(true);
  });

  it("re-derives quarter averages after detail update, deletion and insertion", async () => {
    const base = createSource();
    const curtain = base.records[0];
    if (!curtain) throw new Error("Expected curtain-wall source record.");
    const q1Second = { ...curtain, score: "90" };
    const q2 = { ...curtain, year: 2026, quarter: 1, score: "88" };
    const state = createRepository({
      ...base,
      records: [curtain, q1Second, q2],
    });
    const range = {
      start: { year: 2025, quarter: 4 as const },
      end: { year: 2026, quarter: 2 as const },
    };
    const readQuarter = async (year: number, quarter: number) => {
      const page = await getPerformanceWeightedPageData(
        "project-a",
        range,
        state.repository,
      );
      return page?.catalogRows
        .find(
          (row) =>
            row.candidateId === "project-a-c1" &&
            row.projectType === "CURTAIN_WALL",
        )
        ?.quarterValues.find(
          (value) => value.year === year && value.quarter === quarter,
        )?.averageScore;
    };

    await expect(readQuarter(2025, 4)).resolves.toBe("85");
    state.setSource({
      ...base,
      records: [curtain, { ...q1Second, score: "100" }, q2],
    });
    await expect(readQuarter(2025, 4)).resolves.toBe("90");
    state.setSource({ ...base, records: [curtain, q2] });
    await expect(readQuarter(2025, 4)).resolves.toBe("80");
    state.setSource({ ...base, records: [q2] });
    await expect(readQuarter(2025, 4)).resolves.toBeNull();
    state.setSource({
      ...base,
      records: [q2, { ...curtain, year: 2026, quarter: 2, score: "93" }],
    });
    await expect(readQuarter(2026, 2)).resolves.toBe("93");
  });

  it("reads Qingbiao performance from the current saved snapshot", async () => {
    const { repository } = createRepository();
    await savePerformanceWeightedScores(
      "project-a",
      {
        expectedInputRevision: 3,
        start: { year: 2025, quarter: 4 },
        end: { year: 2026, quarter: 1 },
        weightingMethod: "EQUAL_RECENT_12",
        rows: [
          { candidateId: "project-a-c1", projectType: "CURTAIN_WALL", classificationLevel: "A" },
          { candidateId: "project-a-c1", projectType: "DECORATION", classificationLevel: "B" },
        ],
      },
      repository,
    );
    await expect(
      getSavedPerformanceAverage(
        "project-a",
        "project-a-c1",
        ["CURTAIN_WALL", "DECORATION"],
        repository,
      ),
    ).resolves.toMatchObject({ status: "complete", averageScore: "85" });
  });

  it("marks saved data stale and blocks Qingbiao after the input revision changes", async () => {
    const state = createRepository();
    const page = await getPerformanceWeightedPageData("project-a", {}, state.repository);
    if (!page) throw new Error("Expected performance page.");
    await savePerformanceWeightedScores(
      "project-a",
      {
        expectedInputRevision: page.inputRevision,
        start: page.start,
        end: page.end,
        weightingMethod: page.weightingMethod,
        rows: page.suggestedRows,
      },
      state.repository,
    );
    state.makeStale();

    await expect(
      getPerformanceWeightedPageData("project-a", {}, state.repository),
    ).resolves.toMatchObject({ snapshotStatus: "stale" });
    await expect(
      getSavedPerformanceAverage(
        "project-a",
        "project-a-c1",
        ["CURTAIN_WALL"],
        state.repository,
      ),
    ).resolves.toMatchObject({ status: "missing_data", averageScore: null });
  });

  it("rejects candidates from another project and leaves its source untouched", async () => {
    const { repository, savedInputs } = createRepository();
    await expect(
      savePerformanceWeightedScores(
        "project-a",
        {
          expectedInputRevision: 3,
          start: { year: 2025, quarter: 4 },
          end: { year: 2026, quarter: 1 },
          weightingMethod: "EQUAL_RECENT_12",
          rows: [
            { candidateId: "project-b-c1", projectType: "CURTAIN_WALL", classificationLevel: "A" },
          ],
        },
        repository,
      ),
    ).resolves.toEqual({ status: "invalid_scope" });
    expect(savedInputs).toHaveLength(0);
  });
});

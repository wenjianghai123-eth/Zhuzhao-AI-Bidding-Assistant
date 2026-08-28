import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/project-settings-repository", () => ({
  prismaProjectSettingsRepository: {},
}));

import type { ProjectSettingsSnapshot } from "@/domain/projects/project-settings";
import {
  getProjectTypeEditState,
  updateProjectTypes,
} from "@/server/application/project-settings-service";
import type { ProjectSettingsRepository } from "@/server/repositories/project-settings-repository";

const settings: ProjectSettingsSnapshot = {
  id: "project-a",
  name: "项目A",
  maxBidPrice: "1000",
  nonCompetitiveFee: "100",
  projectTypes: ["CURTAIN_WALL", "DECORATION"],
  qingbiaoDrawValue1: "0",
  qingbiaoDrawValue2: "0.01",
  qingbiaoDrawValue3: "0.02",
  qingbiaoDrawValue4: "0.03",
  totalBidPriceScore: "40",
  similarExperienceScore: "10",
  otherScore: "20",
  rankDeduction: "2",
  finalDrawValue1: "0",
  finalDrawValue2: "0.01",
  finalDrawValue3: "0.02",
};

function createRepository(
  dependencyOverrides: Partial<{
    hasPerformanceData: boolean;
    hasQingbiaoData: boolean;
    hasDingbiaoData: boolean;
    hasAnalysisData: boolean;
  }> = {},
) {
  const updateProjectTypes = vi.fn(async () => undefined);
  const repository: ProjectSettingsRepository = {
    findById: async (projectId) =>
      projectId === settings.id ? settings : null,
    findProjectTypeDependencies: async (projectId) =>
      projectId === settings.id
        ? {
            hasPerformanceData: false,
            hasQingbiaoData: false,
            hasDingbiaoData: false,
            hasAnalysisData: false,
            ...dependencyOverrides,
          }
        : null,
    create: async () => settings.id,
    update: async () => undefined,
    updateProjectTypes,
  };
  return { repository, updateProjectTypes };
}

describe("project type edit lifecycle", () => {
  it("remains editable after saving when no dependent data exists", async () => {
    const { repository, updateProjectTypes: persist } = createRepository();

    await expect(getProjectTypeEditState(settings.id, repository)).resolves.toEqual({
      locked: false,
      reasons: [],
    });
    await expect(
      updateProjectTypes(
        settings.id,
        ["CURTAIN_WALL", "LABORATORY"],
        false,
        repository,
      ),
    ).resolves.toEqual({ status: "updated" });
    expect(persist).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation when performance data exists", async () => {
    const { repository, updateProjectTypes: persist } = createRepository({
      hasPerformanceData: true,
    });

    await expect(
      updateProjectTypes(
        settings.id,
        ["CURTAIN_WALL", "LABORATORY"],
        false,
        repository,
      ),
    ).resolves.toEqual({
      status: "project_type_confirmation_required",
      editState: { locked: true, reasons: ["PERFORMANCE_DATA"] },
    });
    expect(persist).not.toHaveBeenCalled();

    await expect(
      updateProjectTypes(
        settings.id,
        ["CURTAIN_WALL", "LABORATORY"],
        true,
        repository,
      ),
    ).resolves.toEqual({ status: "updated" });
    expect(persist).toHaveBeenCalledOnce();
  });

  it("does not write when the confirmed selection is unchanged", async () => {
    const { repository, updateProjectTypes: persist } = createRepository({
      hasQingbiaoData: true,
    });

    await expect(
      updateProjectTypes(
        settings.id,
        ["DECORATION", "CURTAIN_WALL"],
        true,
        repository,
      ),
    ).resolves.toEqual({ status: "unchanged" });
    expect(persist).not.toHaveBeenCalled();
  });
});

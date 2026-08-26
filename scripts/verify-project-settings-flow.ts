import "dotenv/config";

import type { ProjectSettingsInput } from "../src/domain/projects/project-settings";
import {
  createProjectWithSettings,
  getProjectSettings,
  updateProjectSettings,
} from "../src/server/application/project-settings-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertSafeDestructiveDatabaseTarget(process.env.DATABASE_URL, "project settings verification");

const initialSettings: ProjectSettingsInput = {
  name: "参数持久化验收项目",
  maxBidPrice: "12500.5",
  nonCompetitiveFee: "500.25",
  projectTypes: ["CURTAIN_WALL", "DECORATION"],
  qingbiaoDrawValue1: "0",
  qingbiaoDrawValue2: "0.01",
  qingbiaoDrawValue3: "0.02",
  qingbiaoDrawValue4: "0.03",
  totalBidPriceScore: "45",
  similarExperienceScore: "10",
  otherScore: "20",
  rankDeduction: "1.5",
  finalDrawValue1: "0",
  finalDrawValue2: "0.01",
  finalDrawValue3: "0.02",
};

const projectTypeOnlySettings: ProjectSettingsInput = {
  ...initialSettings,
  projectTypes: ["DECORATION", "LABORATORY"],
};

const updatedSettings: ProjectSettingsInput = {
  ...projectTypeOnlySettings,
  name: "参数持久化验收项目（已修改）",
  maxBidPrice: "13000.75",
  qingbiaoDrawValue1: "0.005",
  qingbiaoDrawValue2: "0.015",
  qingbiaoDrawValue3: "0.025",
  qingbiaoDrawValue4: "0.035",
  totalBidPriceScore: "48",
  similarExperienceScore: "12.5",
  otherScore: "22.5",
  rankDeduction: "1.25",
  finalDrawValue3: "0.025",
};

const editedAgainSettings: ProjectSettingsInput = {
  ...updatedSettings,
  projectTypes: ["DECORATION", "GENERAL_CONTRACT", "LABORATORY"],
  qingbiaoDrawValue4: "0.04",
  similarExperienceScore: "13",
  finalDrawValue2: "0.015",
};

const projectId = await createProjectWithSettings(initialSettings);

try {
  const created = await getProjectSettings(projectId);
  if (!created || created.name !== initialSettings.name) {
    throw new Error("Created project settings could not be read back.");
  }

  const projectTypeOnlyUpdateResult = await updateProjectSettings(
    projectId,
    projectTypeOnlySettings,
  );
  if (projectTypeOnlyUpdateResult.status !== "updated") {
    throw new Error("A project-types-only update was not persisted.");
  }

  const projectTypeOnlyUpdate = await getProjectSettings(projectId);
  const projectTypeOnlyRevision = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      qingbiaoInputRevision: true,
      dingbiaoInputRevision: true,
    },
  });
  if (
    !projectTypeOnlyUpdate ||
    projectTypeOnlyUpdate.projectTypes.length !== 2 ||
    !projectTypeOnlyUpdate.projectTypes.includes("DECORATION") ||
    !projectTypeOnlyUpdate.projectTypes.includes("LABORATORY") ||
    projectTypeOnlyRevision?.qingbiaoInputRevision !== 2 ||
    projectTypeOnlyRevision.dingbiaoInputRevision !== 2
  ) {
    throw new Error(
      "A project-types-only update did not advance both input revisions.",
    );
  }

  const updateResult = await updateProjectSettings(projectId, updatedSettings);
  if (updateResult.status !== "updated") {
    throw new Error("Project settings were not updated.");
  }

  const updated = await getProjectSettings(projectId);
  if (
    !updated ||
    updated.name !== updatedSettings.name ||
    updated.maxBidPrice !== updatedSettings.maxBidPrice ||
    updated.qingbiaoDrawValue1 !== updatedSettings.qingbiaoDrawValue1 ||
    updated.qingbiaoDrawValue2 !== updatedSettings.qingbiaoDrawValue2 ||
    updated.qingbiaoDrawValue3 !== updatedSettings.qingbiaoDrawValue3 ||
    updated.qingbiaoDrawValue4 !== updatedSettings.qingbiaoDrawValue4 ||
    updated.totalBidPriceScore !== updatedSettings.totalBidPriceScore ||
    updated.similarExperienceScore !== updatedSettings.similarExperienceScore ||
    updated.otherScore !== updatedSettings.otherScore ||
    updated.rankDeduction !== updatedSettings.rankDeduction ||
    updated.finalDrawValue3 !== updatedSettings.finalDrawValue3 ||
    updated.projectTypes.length !== 2
  ) {
    throw new Error("Updated project settings could not be read back.");
  }

  const secondUpdateResult = await updateProjectSettings(
    projectId,
    editedAgainSettings,
  );
  if (secondUpdateResult.status !== "updated") {
    throw new Error("Saved project settings could not be edited again.");
  }

  const editedAgain = await getProjectSettings(projectId);
  if (
    !editedAgain ||
    editedAgain.qingbiaoDrawValue4 !== editedAgainSettings.qingbiaoDrawValue4 ||
    editedAgain.similarExperienceScore !==
      editedAgainSettings.similarExperienceScore ||
    editedAgain.finalDrawValue2 !== editedAgainSettings.finalDrawValue2 ||
    editedAgain.projectTypes.length !== 3
  ) {
    throw new Error("Second project settings update could not be read back.");
  }

  const unchangedResult = await updateProjectSettings(projectId, {
    ...editedAgainSettings,
    maxBidPrice: "13000.7500",
    projectTypes: ["LABORATORY", "DECORATION", "GENERAL_CONTRACT"],
  });
  if (unchangedResult.status !== "unchanged") {
    throw new Error("Equivalent settings triggered an unnecessary update.");
  }

  const revision = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      qingbiaoInputRevision: true,
      dingbiaoInputRevision: true,
    },
  });
  if (
    revision?.qingbiaoInputRevision !== 4 ||
    revision.dingbiaoInputRevision !== 4
  ) {
    throw new Error("An unchanged save modified the input revision.");
  }

  console.log(
    JSON.stringify(
      {
        created: true,
        projectTypesOnlyUpdated: true,
        updated: true,
        editedAgain: true,
        persistedProjectTypes: editedAgain.projectTypes,
        persistedQingbiaoDrawValues: [
          editedAgain.qingbiaoDrawValue1,
          editedAgain.qingbiaoDrawValue2,
          editedAgain.qingbiaoDrawValue3,
          editedAgain.qingbiaoDrawValue4,
        ],
        persistedScoreParameters: {
          totalBidPriceScore: editedAgain.totalBidPriceScore,
          similarExperienceScore: editedAgain.similarExperienceScore,
          otherScore: editedAgain.otherScore,
          rankDeduction: editedAgain.rankDeduction,
        },
        unchangedWriteSkipped: true,
        inputRevision: revision.qingbiaoInputRevision,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.$disconnect();
}

import "dotenv/config";

import type { ProjectSettingsInput } from "../src/domain/projects/project-settings";
import {
  createProjectWithSettings,
  getProjectSettings,
  updateProjectSettings,
} from "../src/server/application/project-settings-service";
import { prisma } from "../src/server/db/prisma";

const initialSettings: ProjectSettingsInput = {
  name: "参数持久化验收项目",
  maxBidPrice: "12500.5",
  nonCompetitiveFee: "500.25",
  projectTypes: ["GENERAL_CONTRACT"],
  totalBidPriceScore: "45",
  rankDeduction: "1.5",
  finalDrawValue1: "0",
  finalDrawValue2: "0.01",
  finalDrawValue3: "0.02",
};

const updatedSettings: ProjectSettingsInput = {
  ...initialSettings,
  name: "参数持久化验收项目（已修改）",
  maxBidPrice: "13000.75",
  projectTypes: ["GENERAL_CONTRACT", "LABORATORY"],
  finalDrawValue3: "0.025",
};

const projectId = await createProjectWithSettings(initialSettings);

try {
  const created = await getProjectSettings(projectId);
  if (!created || created.name !== initialSettings.name) {
    throw new Error("Created project settings could not be read back.");
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
    updated.finalDrawValue3 !== updatedSettings.finalDrawValue3 ||
    updated.projectTypes.length !== 2
  ) {
    throw new Error("Updated project settings could not be read back.");
  }

  const unchangedResult = await updateProjectSettings(projectId, {
    ...updatedSettings,
    maxBidPrice: "13000.7500",
    projectTypes: ["LABORATORY", "GENERAL_CONTRACT"],
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
    revision?.qingbiaoInputRevision !== 2 ||
    revision.dingbiaoInputRevision !== 2
  ) {
    throw new Error("An unchanged save modified the input revision.");
  }

  console.log(
    JSON.stringify(
      {
        created: true,
        updated: true,
        persistedProjectTypes: updated.projectTypes,
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

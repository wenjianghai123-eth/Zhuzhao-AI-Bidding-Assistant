import "dotenv/config";

import type { ProjectCandidateInput } from "../src/domain/candidates/project-candidate";
import type { ProjectSettingsInput } from "../src/domain/projects/project-settings";
import {
  createProjectCandidate,
  deleteProjectCandidate,
  getProjectCandidates,
  setProjectCandidateAsOurCompany,
  updateProjectCandidate,
} from "../src/server/application/project-candidate-service";
import { createProjectWithSettings } from "../src/server/application/project-settings-service";
import { assertSafeDestructiveDatabaseTarget } from "../src/server/db/database-target-safety";
import { prisma } from "../src/server/db/prisma";

assertSafeDestructiveDatabaseTarget(process.env.DATABASE_URL, "candidate verification");

const projectSettings: ProjectSettingsInput = {
  name: "候选单位持久化验收项目",
  maxBidPrice: "10000",
  nonCompetitiveFee: "300",
  projectTypes: ["CURTAIN_WALL"],
  qingbiaoDrawValue1: "0",
  qingbiaoDrawValue2: "0.01",
  qingbiaoDrawValue3: "0.02",
  qingbiaoDrawValue4: "0.03",
  totalBidPriceScore: "40",
  similarExperienceScore: "0",
  otherScore: "0",
  rankDeduction: "2",
  finalDrawValue1: "0",
  finalDrawValue2: "0.01",
  finalDrawValue3: "0.02",
};

const firstCandidate: ProjectCandidateInput = {
  companyName: "候选单位验收甲",
  bidPrice: "8000.25",
  netDiscountRate: "0.05",
  trademarkScore: "2",
  technicalScore: "3",
  similarExperienceScore: "8",
  otherScore: "6",
  isOurCompany: true,
};

const secondCandidate: ProjectCandidateInput = {
  companyName: "候选单位验收乙",
  bidPrice: "8100.5",
  netDiscountRate: "0.04",
  trademarkScore: "1.5",
  technicalScore: "2.5",
  similarExperienceScore: "7",
  otherScore: "5",
  isOurCompany: true,
};

const projectId = await createProjectWithSettings(projectSettings);

try {
  const first = await createProjectCandidate(projectId, firstCandidate);
  const second = await createProjectCandidate(projectId, secondCandidate);
  if (first.status !== "created" || second.status !== "created") {
    throw new Error("Candidate creation failed.");
  }

  const afterCreate = await getProjectCandidates(projectId);
  const ourCompaniesAfterCreate =
    afterCreate?.candidates.filter((candidate) => candidate.isOurCompany) ?? [];
  if (
    afterCreate?.candidates.length !== 2 ||
    ourCompaniesAfterCreate.length !== 1 ||
    ourCompaniesAfterCreate[0]?.id !== second.candidateId
  ) {
    throw new Error("Creating a new own-company candidate did not replace the old one.");
  }

  const duplicate = await createProjectCandidate(projectId, {
    ...firstCandidate,
    isOurCompany: false,
  });
  if (duplicate.status !== "company_name_conflict") {
    throw new Error("Duplicate company names were not rejected.");
  }

  const update = await updateProjectCandidate(projectId, first.candidateId, {
    ...firstCandidate,
    bidPrice: "7999.75",
    technicalScore: "4",
    isOurCompany: false,
  });
  if (update.status !== "updated") {
    throw new Error("Candidate update failed.");
  }

  const setOurCompany = await setProjectCandidateAsOurCompany(
    projectId,
    first.candidateId,
  );
  if (setOurCompany.status !== "updated") {
    throw new Error("Setting the own-company candidate failed.");
  }

  const afterSetOurCompany = await getProjectCandidates(projectId);
  const ourCompaniesAfterSwitch =
    afterSetOurCompany?.candidates.filter(
      (candidate) => candidate.isOurCompany,
    ) ?? [];
  if (
    ourCompaniesAfterSwitch.length !== 1 ||
    ourCompaniesAfterSwitch[0]?.id !== first.candidateId
  ) {
    throw new Error("More than one own-company candidate was persisted.");
  }

  const deleted = await deleteProjectCandidate(projectId, second.candidateId);
  const afterDelete = await getProjectCandidates(projectId);
  if (!deleted || afterDelete?.candidates.length !== 1) {
    throw new Error("Candidate deletion was not persisted.");
  }

  console.log(
    JSON.stringify(
      {
        created: 2,
        updated: true,
        deleted: true,
        duplicateRejected: true,
        ownCompanyCount: ourCompaniesAfterSwitch.length,
        persistedCandidateCount: afterDelete.candidates.length,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.$disconnect();
}

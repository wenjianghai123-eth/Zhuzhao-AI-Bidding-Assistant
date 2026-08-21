import "dotenv/config";

import { prisma } from "../src/server/db/prisma";

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: "project-001" },
    include: {
      rule: { include: { projectTypes: true } },
      candidates: true,
    },
  });

  if (!project) {
    throw new Error("Seed project project-001 was not found.");
  }

  const performanceCount = await prisma.companyPerformance.count();

  console.log(
    JSON.stringify(
      {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
        },
        candidateCount: project.candidates.length,
        projectTypeCount: project.rule?.projectTypes.length ?? 0,
        performanceCount,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

import { checkApplicationHealth } from "@/server/application/health-service";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  const health = await checkApplicationHealth(() => prisma.project.count());
  return Response.json(health, { status: health.status === "ok" ? 200 : 503 });
}

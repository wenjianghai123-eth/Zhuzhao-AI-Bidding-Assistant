export type HealthStatus = {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
};

export async function checkApplicationHealth(
  checkDatabase: () => Promise<unknown>,
): Promise<HealthStatus> {
  try {
    await checkDatabase();
    return { status: "ok", database: "ok" };
  } catch {
    return { status: "degraded", database: "unavailable" };
  }
}

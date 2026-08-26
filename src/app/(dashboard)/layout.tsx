import { connection } from "next/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  return <AppShell>{children}</AppShell>;
}

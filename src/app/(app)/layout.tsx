import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // proxy.ts already redirects an unauthenticated request here, but its
  // edge JWT check can't see a suspension that happened after the JWT was
  // issued — this DB check catches that case, so a suspended user gets a
  // clear redirect to /login instead of a page that renders and then fails
  // every data fetch with requireUser()'s own 403 (see api-auth.ts).
  const session = await auth();
  if (session?.user) {
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
    if (!dbUser || dbUser.status === "SUSPENDED") {
      redirect("/login?suspended=1");
    }
  }
  return <DashboardShell>{children}</DashboardShell>;
}

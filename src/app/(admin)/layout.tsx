import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  // Same reasoning as (app)/layout.tsx's own check — catches an admin
  // account suspended after their JWT was issued, which proxy.ts's edge
  // check can't see.
  const session = await auth();
  if (session?.user) {
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
    if (!dbUser || dbUser.status === "SUSPENDED") {
      redirect("/login?suspended=1");
    }
  }
  return <AdminShell>{children}</AdminShell>;
}

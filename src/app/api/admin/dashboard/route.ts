import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/**
 * Overview stats for the admin landing page. Revenue counts only SUCCESS
 * top-ups created since the start of the current calendar month (server
 * local time, same as everywhere else in this app — no per-user timezone
 * handling). "Active jobs" means generations still PENDING/PROCESSING,
 * i.e. work in flight right now, not a historical count.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [totalUsers, revenueThisMonth, pendingTransactions, activeJobs, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.topupTransaction.aggregate({
      where: { status: "SUCCESS", createdAt: { gte: monthStart } },
      _sum: { amountIdr: true },
    }),
    prisma.topupTransaction.count({ where: { status: "PENDING" } }),
    prisma.generation.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, creditBalance: true, status: true },
    }),
  ]);

  return NextResponse.json({
    totalUsers,
    revenueThisMonthIdr: revenueThisMonth._sum.amountIdr ?? 0,
    pendingTransactions,
    activeJobs,
    recentUsers,
  });
}

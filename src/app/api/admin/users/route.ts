import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/**
 * Full list, no server-side pagination — search/filter/sort/paging all
 * happen client-side (same pattern as ai-providers/avatar-animations), and
 * this app's user count doesn't warrant the extra complexity of a paginated
 * API yet. Per-user total top-up is a separate groupBy (topupTransaction has
 * no direct relation loadable via _count) merged in after, rather than an
 * N+1 query per row.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [users, topupTotals] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        creditBalance: true,
        createdAt: true,
        _count: { select: { generations: true } },
      },
    }),
    prisma.topupTransaction.groupBy({
      by: ["userId"],
      where: { status: "SUCCESS" },
      _sum: { amountIdr: true },
    }),
  ]);

  const topupByUserId = new Map(topupTotals.map((t) => [t.userId, t._sum.amountIdr ?? 0]));

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      creditBalance: u.creditBalance,
      createdAt: u.createdAt,
      generationsCount: u._count.generations,
      totalTopupIdr: topupByUserId.get(u.id) ?? 0,
    })),
  });
}

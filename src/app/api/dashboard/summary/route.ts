import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [assetsThisMonth, processingJobs, recentActivity] = await Promise.all([
    prisma.generation.count({
      where: { userId: session.user.id, status: "COMPLETED", createdAt: { gte: startOfMonth } },
    }),
    prisma.generation.count({
      where: { userId: session.user.id, status: { in: ["PENDING", "PROCESSING"] } },
    }),
    prisma.generation.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, status: true, creditCost: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ assetsThisMonth, processingJobs, recentActivity });
}

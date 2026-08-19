import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const [user, purchased] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { creditBalance: true },
    }),
    prisma.topupTransaction.aggregate({
      where: { userId: session.user.id, status: "SUCCESS" },
      _sum: { credits: true },
    }),
  ]);

  return NextResponse.json({
    creditBalance: user?.creditBalance ?? 0,
    // Lifetime credits ever purchased — gives the sidebar's "X% used" bar a
    // real denominator instead of an invented monthly quota (this app has
    // no subscription/quota concept, just a top-up balance).
    totalPurchasedCredits: purchased._sum.credits ?? 0,
  });
}

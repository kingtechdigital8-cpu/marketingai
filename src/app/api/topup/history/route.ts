import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const topups = await prisma.topupTransaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      refId: true,
      amountIdr: true,
      credits: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ topups });
}

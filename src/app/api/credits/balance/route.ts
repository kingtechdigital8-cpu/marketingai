import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { creditBalance: true },
  });

  return NextResponse.json({ creditBalance: user?.creditBalance ?? 0 });
}

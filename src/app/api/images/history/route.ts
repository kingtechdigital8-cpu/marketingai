import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const generations = await prisma.generation.findMany({
    where: { userId: session.user.id, type: "IMAGE_GENERATION" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      creditCost: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ generations });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const generations = await prisma.generation.findMany({
    where: {
      userId: session.user.id,
      type: { in: ["IMAGE_GENERATION", "VIDEO_GENERATION", "VOICE_DUB"] },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      content: true,
      creditCost: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ assets: generations });
}

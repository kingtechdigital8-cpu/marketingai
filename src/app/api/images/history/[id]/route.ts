import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const generation = await prisma.generation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      content: true,
      creditCost: true,
      createdAt: true,
      type: true,
    },
  });

  if (!generation || generation.userId !== session.user.id || generation.type !== "IMAGE_GENERATION") {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ generation });
}

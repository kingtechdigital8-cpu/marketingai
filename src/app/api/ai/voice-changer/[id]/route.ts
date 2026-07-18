import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { refreshPendingFalGeneration } from "@/lib/fal-job";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const generation = await prisma.generation.findUnique({ where: { id } });

  if (!generation || generation.userId !== session.user.id || generation.type !== "VOICE_DUB") {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  const refreshed = await refreshPendingFalGeneration(generation, "voice-dubs");

  return NextResponse.json({
    generation: {
      id: refreshed.id,
      title: refreshed.title,
      status: refreshed.status,
      content: refreshed.content,
      errorMessage: refreshed.errorMessage,
      creditCost: refreshed.creditCost,
      createdAt: refreshed.createdAt,
    },
  });
}

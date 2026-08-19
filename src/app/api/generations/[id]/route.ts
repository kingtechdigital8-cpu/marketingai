import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

// Generic status poll for any generation type — used by tools whose job
// runs against our own in-process worker (not a remote queue), so there's
// no "refresh" step to do here, just a read of whatever the worker last wrote.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const generation = await prisma.generation.findUnique({ where: { id } });

  if (!generation || generation.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({
    generation: {
      id: generation.id,
      title: generation.title,
      status: generation.status,
      content: generation.content,
      errorMessage: generation.errorMessage,
      creditCost: generation.creditCost,
      createdAt: generation.createdAt,
    },
  });
}

// Only removes the history entry — related CreditTransaction rows keep their
// amount but lose the back-reference (generationId -> null, per schema's
// onDelete: SetNull), so the credit ledger itself is never altered by this.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const result = await prisma.generation.deleteMany({ where: { id, userId: session.user.id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

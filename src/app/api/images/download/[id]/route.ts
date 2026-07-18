import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const generation = await prisma.generation.findUnique({
    where: { id },
    select: { userId: true, type: true, content: true },
  });

  if (
    !generation ||
    generation.userId !== session.user.id ||
    generation.type !== "IMAGE_GENERATION" ||
    !generation.content
  ) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  const upstream = await fetch(generation.content);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Gagal mengambil gambar." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Content-Disposition": `attachment; filename="gambar-${id}.png"`,
    },
  });
}

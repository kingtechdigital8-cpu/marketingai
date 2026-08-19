import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const asset = await prisma.videoClipAsset.findUnique({ where: { id } });
  if (!asset || asset.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  await deleteFromR2(asset.key).catch(() => {});
  await prisma.videoClipAsset.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

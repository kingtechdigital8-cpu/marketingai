import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { uniqueAnimationSlug } from "@/lib/avatar-animation-slug";

/** Loads one library entry for editing — shared/global, so any admin can open any entry, not just the one who created it (see schema.prisma's own comment on AvatarAnimation). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const animation = await prisma.avatarAnimation.findUnique({ where: { id } });
  if (!animation) {
    return NextResponse.json({ error: "Animasi tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ animation });
}

/** Overwrites an existing animation's name/duration/keyframe data — this is what "editing a previously created animation" actually persists, and since it's a shared library entry, every place already referencing this row (a live avatar's `customAnimationId`, or the VRM Animation Studio's own "Edit Gesture") picks up the change automatically on next fetch, with no per-avatar copy to go stale. Re-slugifies only when the name changed, so a plain re-save (no rename) never churns the slug an existing runtime reference is pointing at. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.avatarAnimation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Animasi tidak ditemukan." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const duration = typeof body?.duration === "number" && Number.isFinite(body.duration) ? body.duration : null;
  const data = body?.data;

  if (!name) {
    return NextResponse.json({ error: "Nama animasi wajib diisi." }, { status: 400 });
  }
  if (duration === null || duration < 0) {
    return NextResponse.json({ error: "Durasi tidak valid." }, { status: 400 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "Data keyframe tidak valid." }, { status: 400 });
  }

  const slug = name === existing.name ? existing.slug : await uniqueAnimationSlug(name, existing.id);
  const animation = await prisma.avatarAnimation.update({
    where: { id },
    data: { name, slug, duration, data },
  });

  return NextResponse.json({ animation });
}

/** Removes a library entry permanently — no soft-delete/undo, matching this project's other admin delete endpoints (e.g. avatar-templates). Any TiktokLiveComment.customAnimationId still pointing at this row is set null by the database (see schema.prisma's onDelete: SetNull), never blocked/cascaded. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.avatarAnimation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Animasi tidak ditemukan." }, { status: 404 });
  }

  await prisma.avatarAnimation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { uniqueAnimationSlug } from "@/lib/avatar-animation-slug";

/** Animation Library list — the full shared/global library (see schema.prisma's own comment on AvatarAnimation), not scoped to the requesting admin, most recently updated first. Any admin can see and manage every entry, matching the AvatarTemplate gallery's own "system-owned, shared" pattern. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const animations = await prisma.avatarAnimation.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ animations });
}

/** Saves a new animation clip into the shared library — `data` is the studio's own keyframe array, stored opaque (see schema.prisma's own comment on AvatarAnimation.data). `userId` is recorded as creation audit trail only, not an access boundary. */
export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

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

  const slug = await uniqueAnimationSlug(name);
  const animation = await prisma.avatarAnimation.create({
    data: { userId: session.user.id, name, slug, duration, data },
  });

  return NextResponse.json({ animation }, { status: 201 });
}

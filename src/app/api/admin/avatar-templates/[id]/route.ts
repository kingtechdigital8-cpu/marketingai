import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (typeof body.credit === "string" && body.credit.trim()) data.credit = body.credit.trim();
  if (body.gender === "male" || body.gender === "female") data.gender = body.gender;
  if (Number.isFinite(Number(body.order))) data.order = Number(body.order);

  const template = await prisma.avatarTemplate.update({ where: { id }, data });
  return NextResponse.json({ template });
}

/**
 * Deleting a template does NOT touch any user's TiktokLiveConfig — a user
 * who already picked it keeps virtualHostVrmKey pointing at the now-deleted
 * R2 file, and their avatar preview will start failing to load. The admin
 * page surfaces this trade-off in its confirmation dialog rather than
 * silently protecting against it (no reverse lookup of "who's using this"
 * exists, and building one for a rarely-hit delete path isn't worth it).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const template = await prisma.avatarTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ ok: true });

  await prisma.avatarTemplate.delete({ where: { id } });

  await Promise.all([
    deleteFromR2(template.vrmKey).catch((err) => console.error("[avatar-templates] failed to delete VRM:", err)),
    deleteFromR2(template.thumbnailKey).catch((err) => console.error("[avatar-templates] failed to delete thumbnail:", err)),
  ]);

  return NextResponse.json({ ok: true });
}

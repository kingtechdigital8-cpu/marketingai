import { prisma } from "@/lib/prisma";
import { getR2PublicUrl } from "@/lib/r2";
import type { AvatarTemplate } from "@prisma/client";

export type { AvatarTemplate };

// System-owned VRM files offered in the "avatar3d" host gallery — managed by
// an admin at /admin/avatar-templates (see src/app/api/admin/avatar-templates),
// shared across every user, never tied to one account. A user's
// TiktokLiveConfig.virtualHostVrmKey stores a template row's vrmKey directly
// (not a foreign key) — matched back to a template by key equality, so
// deleting a template does NOT cascade to users who already picked it.

/** True if this R2 key belongs to a shared system template rather than a specific user's own upload — such keys must never be deleted on a per-user replace/remove. */
export async function isTemplateVrmKey(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  const match = await prisma.avatarTemplate.findUnique({ where: { vrmKey: key }, select: { id: true } });
  return Boolean(match);
}

export async function getAvatarTemplate(id: string | null | undefined): Promise<AvatarTemplate | null> {
  if (!id) return null;
  return prisma.avatarTemplate.findUnique({ where: { id } });
}

/** Only set when the current VRM is a shared template, not a self-uploaded file — used to highlight the active card in the gallery UI. */
export async function getAvatarTemplateIdForVrmKey(vrmKey: string | null | undefined): Promise<string | null> {
  if (!vrmKey) return null;
  const match = await prisma.avatarTemplate.findUnique({ where: { vrmKey }, select: { id: true } });
  return match?.id ?? null;
}

export async function serializeAvatarTemplates() {
  const templates = await prisma.avatarTemplate.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return templates.map((t) => ({
    id: t.id,
    label: t.label,
    thumbnailUrl: getR2PublicUrl(t.thumbnailKey),
    // Shown on the template card — keeps license/attribution visible where
    // it's picked, since these files get redistributed to every user.
    credit: t.credit,
    // Which Mixamo idle clip this template uses — copied onto
    // TiktokLiveConfig.virtualHostGender server-side the moment it's picked
    // (see host-vrm/template/route.ts); surfaced here too so the gallery UI
    // can update its local state immediately without waiting on a re-fetch.
    gender: t.gender,
  }));
}

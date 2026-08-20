import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";
import { ensureDbConnection } from "@/lib/with-db-retry";
import { serializeConfig } from "@/lib/tiktok-live-config";
import { getAvatarTemplate, isTemplateVrmKey } from "@/lib/tiktok-live-avatar-templates";

/** Points the user's host VRM at a shared system template instead of a self-uploaded file — never trusts a client-supplied R2 key directly, only a templateId resolved server-side against the known registry. */
export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const templateId = typeof body?.templateId === "string" ? body.templateId : "";

  // Must run before the FIRST Prisma call of this request (getAvatarTemplate
  // below), not just before the later upsert — same P1001 mitigation every
  // other tiktok-live route applies (see host-vrm/route.ts), but this route
  // used to call it too late to protect that first read.
  await ensureDbConnection();
  const template = await getAvatarTemplate(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template avatar tidak ditemukan." }, { status: 400 });
  }

  const existing = await prisma.tiktokLiveConfig.findUnique({ where: { userId: session.user.id } });

  const config = await prisma.tiktokLiveConfig.upsert({
    where: { userId: session.user.id },
    update: {
      virtualHostVrmKey: template.vrmKey,
      virtualHostGender: template.gender,
      overlayToken: existing?.overlayToken ?? randomUUID(),
    },
    create: {
      userId: session.user.id,
      tiktokUsername: "",
      virtualHostVrmKey: template.vrmKey,
      virtualHostGender: template.gender,
      overlayToken: randomUUID(),
    },
  });

  // Only clean up the previous file if it was this user's own upload — a
  // shared template key must never be deleted just because one user moved on.
  if (existing?.virtualHostVrmKey && existing.virtualHostVrmKey !== template.vrmKey && !(await isTemplateVrmKey(existing.virtualHostVrmKey))) {
    await deleteFromR2(existing.virtualHostVrmKey).catch((err) =>
      console.error("[tiktok-live] failed to delete old host VRM:", err)
    );
  }

  return NextResponse.json({ config: await serializeConfig(config) });
}

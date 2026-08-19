import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { ensureDbConnection } from "@/lib/with-db-retry";
import { serializeConfig } from "@/lib/tiktok-live-config";
import { isTemplateVrmKey } from "@/lib/tiktok-live-avatar-templates";

const MAX_VRM_BYTES = 50 * 1024 * 1024;

/** Uploads/replaces the virtual host's VRM 3D avatar file — generates the overlay token the first time one is set, mirrors host-image/route.ts. */
export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  const vrm = form?.get("vrm");

  if (!(vrm instanceof File) || vrm.size === 0) {
    return NextResponse.json({ error: "File avatar wajib diunggah." }, { status: 400 });
  }
  // A .glb without VRM extension data still loads fine geometrically but
  // has no humanoid bones/expressions for VRMLoaderPlugin to find — that
  // gets caught client-side (AvatarCanvas.tsx's "File VRM tidak valid atau
  // tidak didukung." error) at render time, not here. Both extensions are
  // structurally the same glTF-Binary format either way, VRM being .glb
  // plus that extra extension data — accepting .glb just covers files
  // exported/named without the .vrm convention.
  const name = vrm.name.toLowerCase();
  if (!name.endsWith(".vrm") && !name.endsWith(".glb")) {
    return NextResponse.json({ error: "File harus berformat .vrm atau .glb." }, { status: 400 });
  }
  if (vrm.size > MAX_VRM_BYTES) {
    return NextResponse.json({ error: "Ukuran file VRM maksimal 50MB." }, { status: 400 });
  }

  await ensureDbConnection();
  const existing = await prisma.tiktokLiveConfig.findUnique({ where: { userId: session.user.id } });

  const buffer = Buffer.from(await vrm.arrayBuffer());
  const vrmKey = `tiktok-live-host/${session.user.id}/${randomUUID()}.vrm`;
  await uploadToR2(buffer, vrmKey, "model/gltf-binary");

  const config = await prisma.tiktokLiveConfig.upsert({
    where: { userId: session.user.id },
    update: {
      virtualHostVrmKey: vrmKey,
      overlayToken: existing?.overlayToken ?? randomUUID(),
    },
    create: {
      userId: session.user.id,
      tiktokUsername: "",
      virtualHostVrmKey: vrmKey,
      overlayToken: randomUUID(),
    },
  });

  // Never delete a shared template's file just because this user moved on
  // from it — only clean up R2 when the previous key was this user's own upload.
  if (existing?.virtualHostVrmKey && existing.virtualHostVrmKey !== vrmKey && !(await isTemplateVrmKey(existing.virtualHostVrmKey))) {
    await deleteFromR2(existing.virtualHostVrmKey).catch((err) =>
      console.error("[tiktok-live] failed to delete old host VRM:", err)
    );
  }

  return NextResponse.json({ config: await serializeConfig(config, request) });
}

export async function DELETE(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  await ensureDbConnection();
  const existing = await prisma.tiktokLiveConfig.findUnique({ where: { userId: session.user.id } });
  if (!existing) return NextResponse.json({ config: null });

  const config = await prisma.tiktokLiveConfig.update({
    where: { userId: session.user.id },
    data: { virtualHostVrmKey: null, virtualHostEnabled: false },
  });

  if (existing.virtualHostVrmKey && !(await isTemplateVrmKey(existing.virtualHostVrmKey))) {
    await deleteFromR2(existing.virtualHostVrmKey).catch((err) =>
      console.error("[tiktok-live] failed to delete host VRM:", err)
    );
  }

  return NextResponse.json({ config: await serializeConfig(config, request) });
}

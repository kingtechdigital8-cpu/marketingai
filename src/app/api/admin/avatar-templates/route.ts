import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { uploadToR2, getR2PublicUrl } from "@/lib/r2";
import { peekGlbJson, hasVrmExtension, convertMixamoGlbToVrm } from "@/lib/vrm-converter";

/** Indonesian-friendly labels for the VRM humanoid bone names surfaced in a failed-conversion error — the bare English names alone aren't self-explanatory to someone who's never touched the VRM spec. */
const BONE_LABELS: Record<string, string> = {
  hips: "Hips (pinggul)",
  spine: "Spine (tulang belakang)",
  head: "Head (kepala)",
  leftUpperLeg: "LeftUpLeg (paha kiri)",
  leftLowerLeg: "LeftLeg (betis kiri)",
  leftFoot: "LeftFoot (kaki kiri)",
  rightUpperLeg: "RightUpLeg (paha kanan)",
  rightLowerLeg: "RightLeg (betis kanan)",
  rightFoot: "RightFoot (kaki kanan)",
  leftUpperArm: "LeftArm (lengan atas kiri)",
  leftLowerArm: "LeftForeArm (lengan bawah kiri)",
  leftHand: "LeftHand (tangan kiri)",
  rightUpperArm: "RightArm (lengan atas kanan)",
  rightLowerArm: "RightForeArm (lengan bawah kanan)",
  rightHand: "RightHand (tangan kanan)",
};

const MAX_VRM_BYTES = 50 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const ALLOWED_THUMBNAIL_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const templates = await prisma.avatarTemplate.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      label: t.label,
      credit: t.credit,
      gender: t.gender,
      order: t.order,
      vrmUrl: getR2PublicUrl(t.vrmKey),
      thumbnailUrl: getR2PublicUrl(t.thumbnailKey),
      createdAt: t.createdAt,
    })),
  });
}

/** Uploads a new shared avatar template (VRM + thumbnail) into the gallery every user's Live TikTok config can pick from — admin-only, mirrors the per-user host-vrm upload route. */
export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  const label = typeof form?.get("label") === "string" ? (form.get("label") as string).trim() : "";
  const credit = typeof form?.get("credit") === "string" ? (form.get("credit") as string).trim() : "";
  const genderRaw = form?.get("gender");
  const gender = genderRaw === "male" ? "male" : "female";
  const vrm = form?.get("vrm");
  const thumbnail = form?.get("thumbnail");

  if (!label) {
    return NextResponse.json({ error: "Nama avatar wajib diisi." }, { status: 400 });
  }
  if (!credit) {
    return NextResponse.json({ error: "Kredit/lisensi wajib diisi." }, { status: 400 });
  }
  if (!(vrm instanceof File) || vrm.size === 0) {
    return NextResponse.json({ error: "File avatar wajib diunggah." }, { status: 400 });
  }
  // Same acceptance as the per-user upload (host-vrm/route.ts) — a .glb is
  // structurally the same glTF-Binary format VRM uses, just without the
  // .vrm naming convention; genuinely invalid files are still caught
  // client-side when VRMLoaderPlugin fails to find VRM extension data.
  const vrmName = vrm.name.toLowerCase();
  if (!vrmName.endsWith(".vrm") && !vrmName.endsWith(".glb")) {
    return NextResponse.json({ error: "File avatar harus berformat .vrm atau .glb." }, { status: 400 });
  }
  if (vrm.size > MAX_VRM_BYTES) {
    return NextResponse.json({ error: "Ukuran file VRM maksimal 50MB." }, { status: 400 });
  }
  if (!(thumbnail instanceof File) || thumbnail.size === 0) {
    return NextResponse.json({ error: "Gambar thumbnail wajib diunggah." }, { status: 400 });
  }
  if (!ALLOWED_THUMBNAIL_TYPES.has(thumbnail.type)) {
    return NextResponse.json({ error: "Thumbnail harus berformat PNG, JPEG, atau WebP." }, { status: 400 });
  }
  if (thumbnail.size > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: "Ukuran thumbnail maksimal 5MB." }, { status: 400 });
  }

  let vrmBuffer: Buffer = Buffer.from(await vrm.arrayBuffer());
  let autoConverted = false;

  // A file with no VRM extension data at all can't be rendered by this
  // product's avatar system regardless of its .vrm/.glb extension — before
  // rejecting it outright, try the one conversion path that's actually
  // reliable: Mixamo's rig has completely standardized bone names, so it can
  // be mapped to VRM's humanoid bones deterministically. Any other kind of
  // "plain rigged .glb" (Sketchfab, custom Blender rigs, etc.) still gets
  // rejected — see vrm-converter.ts for why guessing bone mappings for an
  // unknown rig convention is worse than just failing clearly.
  try {
    const json = peekGlbJson(vrmBuffer);
    if (!hasVrmExtension(json)) {
      const result = convertMixamoGlbToVrm(vrmBuffer, { name: label, author: credit });
      if (!result.ok) {
        const missingLabels = result.missingRequiredBones.map((b) => BONE_LABELS[b] ?? b).join(", ");
        return NextResponse.json(
          {
            error:
              `File ini bukan VRM dan bukan rig Mixamo standar — tulang berikut tidak ditemukan: ${missingLabels}. ` +
              "Convert otomatis hanya bekerja untuk model yang di-rig lewat Mixamo. Untuk rig lain, konversi manual " +
              "lewat Blender + VRM Add-on diperlukan.",
          },
          { status: 400 }
        );
      }
      vrmBuffer = result.buffer;
      autoConverted = true;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "File avatar tidak valid atau rusak." },
      { status: 400 }
    );
  }

  const folderId = randomUUID();
  const vrmKey = `system/avatar-templates/${folderId}/model.vrm`;
  const thumbnailExt = thumbnail.type === "image/png" ? "png" : thumbnail.type === "image/webp" ? "webp" : "jpg";
  const thumbnailKey = `system/avatar-templates/${folderId}/thumbnail.${thumbnailExt}`;

  await uploadToR2(vrmBuffer, vrmKey, "model/gltf-binary");
  await uploadToR2(Buffer.from(await thumbnail.arrayBuffer()), thumbnailKey, thumbnail.type);

  const order = await prisma.avatarTemplate.count();
  const template = await prisma.avatarTemplate.create({
    data: { label, credit, gender, vrmKey, thumbnailKey, order },
  });

  return NextResponse.json({ template, autoConverted }, { status: 201 });
}

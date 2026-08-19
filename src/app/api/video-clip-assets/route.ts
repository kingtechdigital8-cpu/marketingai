import { randomUUID } from "crypto";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { uploadToR2 } from "@/lib/r2";
import { probeMetadata } from "@/lib/ffmpeg";
import { VIDEO_CLIP_ASSET_KINDS, getAssetKindConfig } from "@/lib/video-clip-asset-options";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export async function GET(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const kindFilter = searchParams.get("kind");
  const validKind = VIDEO_CLIP_ASSET_KINDS.some((k) => k.value === kindFilter) ? kindFilter : undefined;

  const assets = await prisma.videoClipAsset.findMany({
    where: { userId: session.user.id, ...(validKind ? { kind: validKind as never } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });
  }

  const kind = typeof form.get("kind") === "string" ? (form.get("kind") as string) : "";
  const kindConfig = getAssetKindConfig(kind);
  if (!kindConfig) {
    return NextResponse.json({ error: "Jenis aset tidak valid." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Unggah file terlebih dahulu." }, { status: 400 });
  }
  if (!(kindConfig.mimeTypes as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: `Format file tidak didukung untuk ${kindConfig.label}.` }, { status: 400 });
  }
  if (file.size > kindConfig.maxBytes) {
    return NextResponse.json(
      { error: `Ukuran file maksimal ${Math.round(kindConfig.maxBytes / (1024 * 1024))}MB.` },
      { status: 400 }
    );
  }

  const label = typeof form.get("label") === "string" && (form.get("label") as string).trim()
    ? (form.get("label") as string).trim().slice(0, 80)
    : file.name || kindConfig.label;

  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const buffer = Buffer.from(await file.arrayBuffer());

  const maxDuration = "maxDurationSeconds" in kindConfig ? kindConfig.maxDurationSeconds : undefined;
  if (maxDuration) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "videoclip-asset-"));
    try {
      const localPath = path.join(tempDir, `probe.${ext}`);
      await writeFile(localPath, buffer);
      const meta = await probeMetadata(localPath).catch(() => null);
      if (meta && meta.durationSeconds > maxDuration) {
        return NextResponse.json(
          { error: `Durasi ${kindConfig.label.toLowerCase()} maksimal ${maxDuration} detik.` },
          { status: 400 }
        );
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const key = `video-clip-assets/${session.user.id}/${kindConfig.value.toLowerCase()}/${randomUUID()}.${ext}`;
  const url = await uploadToR2(buffer, key, file.type);

  const asset = await prisma.videoClipAsset.create({
    data: { userId: session.user.id, kind: kindConfig.value as never, key, url, label },
  });

  return NextResponse.json({ asset });
}

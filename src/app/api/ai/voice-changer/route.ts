import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { generateSpeech, isAllowedVoice } from "@/lib/openai-tts";
import { submitLipsyncJob } from "@/lib/fal";
import { uploadToR2 } from "@/lib/r2";
import { ProviderNotConfiguredError, ProviderBillingError } from "@/lib/errors";
import { reserveCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MAX_TEXT_LENGTH = 500;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });
  }

  const sourceGenerationId = typeof form.get("sourceGenerationId") === "string" ? (form.get("sourceGenerationId") as string) : "";
  const sourceVideoFile = form.get("sourceVideo");
  const hasUploadedVideo = sourceVideoFile instanceof File && sourceVideoFile.size > 0;
  const text = typeof form.get("text") === "string" ? (form.get("text") as string).trim() : "";
  const voice = typeof form.get("voice") === "string" ? (form.get("voice") as string) : "";

  if (!sourceGenerationId && !hasUploadedVideo) {
    return NextResponse.json({ error: "Pilih video sumber atau unggah video terlebih dahulu." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Teks dialog wajib diisi." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Teks dialog maksimal ${MAX_TEXT_LENGTH} karakter.` }, { status: 400 });
  }
  if (!isAllowedVoice(voice)) {
    return NextResponse.json({ error: "Pilihan suara tidak valid." }, { status: 400 });
  }
  if (hasUploadedVideo) {
    const file = sourceVideoFile as File;
    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Video harus berformat MP4, WEBM, atau MOV." }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "Ukuran video maksimal 50MB." }, { status: 400 });
    }
  }

  let sourceVideoUrl: string;
  if (hasUploadedVideo) {
    const file = sourceVideoFile as File;
    const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
    const key = `voice-dubs/${session.user.id}/${randomUUID()}-source.${ext}`;
    try {
      sourceVideoUrl = await uploadToR2(Buffer.from(await file.arrayBuffer()), key, file.type);
    } catch (err) {
      console.error("Voice changer source video upload failed:", err);
      return NextResponse.json({ error: "Gagal mengunggah video sumber." }, { status: 502 });
    }
  } else {
    const sourceGeneration = await prisma.generation.findUnique({ where: { id: sourceGenerationId } });
    if (
      !sourceGeneration ||
      sourceGeneration.userId !== session.user.id ||
      sourceGeneration.type !== "VIDEO_GENERATION" ||
      sourceGeneration.status !== "COMPLETED" ||
      !sourceGeneration.content
    ) {
      return NextResponse.json(
        { error: "Video sumber tidak ditemukan atau belum selesai diproses." },
        { status: 400 }
      );
    }
    sourceVideoUrl = sourceGeneration.content;
  }

  try {
    const audioBuffer = await generateSpeech({ text, voice });
    const audioKey = `voice-dubs/${session.user.id}/${randomUUID()}.mp3`;
    const audioUrl = await uploadToR2(audioBuffer, audioKey, "audio/mpeg");

    const job = await submitLipsyncJob({ videoUrl: sourceVideoUrl, audioUrl });

    await ensureDbConnection();
    const result = await reserveCreditsForGeneration({
      userId: session.user.id,
      type: "VOICE_DUB",
      title: text.length > 80 ? `${text.slice(0, 80)}...` : text,
      input: {
        sourceGenerationId: sourceGenerationId || null,
        sourceVideoUrl,
        text,
        voice,
        audioUrl,
        falRequestId: job.requestId,
        falStatusUrl: job.statusUrl,
        falResponseUrl: job.responseUrl,
        falProviderSlug: job.providerSlug,
      },
      cost: CREDIT_COSTS.VOICE_DUB,
    });

    return NextResponse.json({
      generationId: result.generation.id,
      status: result.generation.status,
      creditBalance: result.creditBalance,
    });
  } catch (err) {
    if (err instanceof ProviderBillingError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsufficientCreditError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("Voice changer job submission failed:", err);
    return NextResponse.json({ error: "Gagal memulai voice changer. Coba lagi." }, { status: 502 });
  }
}

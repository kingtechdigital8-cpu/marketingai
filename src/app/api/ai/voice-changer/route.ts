import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { generateSpeech, isAllowedVoice } from "@/lib/openai-tts";
import { submitLipsyncJob } from "@/lib/fal";
import { uploadToR2 } from "@/lib/r2";
import { ProviderNotConfiguredError, ProviderBillingError } from "@/lib/errors";
import { reserveCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { getProviderCost, roundCreditCost } from "@/lib/provider-cost";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MAX_TEXT_LENGTH = 500;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a"]);
// Uploaded videos carry no known duration (no probing library wired up) — assume our
// own generator's default so lipsync (billed per-second of video) isn't undercharged.
const ASSUMED_UPLOADED_VIDEO_SECONDS = 5;

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

  const audioFile = form.get("audioFile");
  const hasUploadedAudio = audioFile instanceof File && audioFile.size > 0;
  const text = typeof form.get("text") === "string" ? (form.get("text") as string).trim() : "";
  const voice = typeof form.get("voice") === "string" ? (form.get("voice") as string) : "";

  if (!sourceGenerationId && !hasUploadedVideo) {
    return NextResponse.json({ error: "Pilih video sumber atau unggah video terlebih dahulu." }, { status: 400 });
  }
  if (!hasUploadedAudio) {
    if (!text) {
      return NextResponse.json({ error: "Teks dialog wajib diisi." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `Teks dialog maksimal ${MAX_TEXT_LENGTH} karakter.` }, { status: 400 });
    }
    if (!isAllowedVoice(voice)) {
      return NextResponse.json({ error: "Pilihan suara tidak valid." }, { status: 400 });
    }
  } else {
    const file = audioFile as File;
    if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Audio harus berformat MP3, WAV, atau M4A." }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Ukuran audio maksimal 10MB." }, { status: 400 });
    }
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
  let sourceVideoSeconds = ASSUMED_UPLOADED_VIDEO_SECONDS;
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
    const storedDuration = Number((sourceGeneration.input as { duration?: string })?.duration);
    if (Number.isFinite(storedDuration) && storedDuration > 0) sourceVideoSeconds = storedDuration;
  }

  try {
    let audioUrl: string;
    if (hasUploadedAudio) {
      const file = audioFile as File;
      const ext = file.type === "audio/wav" || file.type === "audio/x-wav" ? "wav" : file.type.includes("mp4") || file.type.includes("m4a") ? "m4a" : "mp3";
      const key = `voice-dubs/${session.user.id}/${randomUUID()}.${ext}`;
      audioUrl = await uploadToR2(Buffer.from(await file.arrayBuffer()), key, file.type);
    } else {
      const audioBuffer = await generateSpeech({ text, voice });
      const key = `voice-dubs/${session.user.id}/${randomUUID()}.mp3`;
      audioUrl = await uploadToR2(audioBuffer, key, "audio/mpeg");
    }

    const job = await submitLipsyncJob({ videoUrl: sourceVideoUrl, audioUrl });

    const title = hasUploadedAudio
      ? `Voice Changer: ${(audioFile as File).name}`
      : text.length > 80
        ? `${text.slice(0, 80)}...`
        : text;

    // falai-lipsync's base cost is per second of source video processed.
    const lipsyncCost = (await getProviderCost("falai-lipsync")) * sourceVideoSeconds;
    const ttsCost = hasUploadedAudio ? 0 : await getProviderCost("openai-tts");
    const cost = roundCreditCost(lipsyncCost + ttsCost);

    await ensureDbConnection();
    const result = await reserveCreditsForGeneration({
      userId: session.user.id,
      type: "VOICE_DUB",
      title,
      input: {
        sourceGenerationId: sourceGenerationId || null,
        sourceVideoUrl,
        text: hasUploadedAudio ? null : text,
        voice: hasUploadedAudio ? null : voice,
        uploadedAudio: hasUploadedAudio,
        audioUrl,
        falRequestId: job.requestId,
        falStatusUrl: job.statusUrl,
        falResponseUrl: job.responseUrl,
        falProviderSlug: job.providerSlug,
      },
      cost,
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

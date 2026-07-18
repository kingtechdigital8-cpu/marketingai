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

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const sourceGenerationId = typeof body?.sourceGenerationId === "string" ? body.sourceGenerationId : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = typeof body?.voice === "string" ? body.voice : "";

  if (!sourceGenerationId) {
    return NextResponse.json({ error: "Pilih video sumber terlebih dahulu." }, { status: 400 });
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

  const sourceGeneration = await prisma.generation.findUnique({ where: { id: sourceGenerationId } });
  if (
    !sourceGeneration ||
    sourceGeneration.userId !== session.user.id ||
    sourceGeneration.type !== "VIDEO_GENERATION" ||
    sourceGeneration.status !== "COMPLETED" ||
    !sourceGeneration.content
  ) {
    return NextResponse.json({ error: "Video sumber tidak ditemukan atau belum selesai diproses." }, { status: 400 });
  }

  try {
    const audioBuffer = await generateSpeech({ text, voice });
    const audioKey = `voice-dubs/${session.user.id}/${randomUUID()}.mp3`;
    const audioUrl = await uploadToR2(audioBuffer, audioKey, "audio/mpeg");

    const job = await submitLipsyncJob({ videoUrl: sourceGeneration.content, audioUrl });

    await ensureDbConnection();
    const result = await reserveCreditsForGeneration({
      userId: session.user.id,
      type: "VOICE_DUB",
      title: text.length > 80 ? `${text.slice(0, 80)}...` : text,
      input: {
        sourceGenerationId,
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

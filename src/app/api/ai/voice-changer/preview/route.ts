import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { generateSpeech, isAllowedVoice } from "@/lib/openai-tts";
import { ProviderNotConfiguredError } from "@/lib/errors";

const PREVIEW_TEXT = "Halo, ini adalah contoh suara yang akan digunakan untuk video Anda.";

export async function POST(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const voice = typeof body?.voice === "string" ? body.voice : "";

  if (!isAllowedVoice(voice)) {
    return NextResponse.json({ error: "Pilihan suara tidak valid." }, { status: 400 });
  }

  try {
    const audioBuffer = await generateSpeech({ text: PREVIEW_TEXT, voice });
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Voice preview failed:", err);
    return NextResponse.json({ error: "Gagal memutar contoh suara." }, { status: 502 });
  }
}

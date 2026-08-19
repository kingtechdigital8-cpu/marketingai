import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { generateGoogleTtsSpeech, getPreviewSampleText } from "@/lib/google-tts";
import { ProviderNotConfiguredError } from "@/lib/errors";

const MAX_VOICE_NAME_LENGTH = 100;

/** On-demand synthesis for the "listen" button — Google's voices.list has no
 * pre-made sample audio the way ElevenLabs' previewUrl does, so this actually
 * calls the provider with a short greeting each time it's pressed. */
export async function POST(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const voiceName = typeof body?.voiceName === "string" ? body.voiceName.trim().slice(0, MAX_VOICE_NAME_LENGTH) : "";
  if (!voiceName) {
    return NextResponse.json({ error: "voiceName wajib diisi." }, { status: 400 });
  }

  try {
    const audioBuffer = await generateGoogleTtsSpeech({ text: getPreviewSampleText(voiceName), voiceName });
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Failed to generate Google Cloud TTS preview:", err);
    return NextResponse.json({ error: "Gagal membuat contoh suara." }, { status: 502 });
  }
}

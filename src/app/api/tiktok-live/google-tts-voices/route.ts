import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { listGoogleTtsVoices } from "@/lib/google-tts";
import { GOOGLE_TTS_LANGUAGES } from "@/lib/google-tts-languages";
import { ProviderNotConfiguredError } from "@/lib/errors";

/** Mirrors elevenlabs-voices/route.ts. */
export async function GET(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const languageParam = new URL(request.url).searchParams.get("language") ?? "";
  const languageCode = GOOGLE_TTS_LANGUAGES.some((l) => l.code === languageParam) ? languageParam : "id-ID";

  try {
    const voices = await listGoogleTtsVoices(languageCode);
    return NextResponse.json({ voices });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Failed to list Google Cloud TTS voices:", err);
    return NextResponse.json({ error: "Gagal mengambil daftar suara." }, { status: 502 });
  }
}

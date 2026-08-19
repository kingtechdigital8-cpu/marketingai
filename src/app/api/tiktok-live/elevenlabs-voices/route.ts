import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { listElevenLabsVoices, listElevenLabsSharedVoices } from "@/lib/elevenlabs-tts";
import { ELEVENLABS_LANGUAGES } from "@/lib/elevenlabs-languages";
import { ProviderNotConfiguredError } from "@/lib/errors";

export async function GET(request: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const language = new URL(request.url).searchParams.get("language") ?? "";
  const isValidLanguage = ELEVENLABS_LANGUAGES.some((l) => l.code === language);

  try {
    const voices = isValidLanguage ? await listElevenLabsSharedVoices(language) : await listElevenLabsVoices();
    return NextResponse.json({ voices });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Failed to list ElevenLabs voices:", err);
    return NextResponse.json({ error: "Gagal mengambil daftar suara." }, { status: 502 });
  }
}

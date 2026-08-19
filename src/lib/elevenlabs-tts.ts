import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";

const ELEVENLABS_SLUG = "elevenlabs-tts";
const API_BASE = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_multilingual_v2";

async function getElevenLabsProvider(): Promise<{ apiKey: string; model: string }> {
  const provider = await prisma.aiProvider.findUnique({ where: { slug: ELEVENLABS_SLUG } });
  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new ProviderNotConfiguredError(
      "Layanan suara balasan belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Provider AI."
    );
  }
  return { apiKey: provider.apiKey, model: provider.model || DEFAULT_MODEL };
}

/** Pulls just the human-readable message out of the API's JSON error body, if present. */
async function extractErrorMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.detail?.message ?? parsed?.detail ?? parsed?.message;
    if (typeof message === "string") return message.slice(0, 300);
  } catch {
    // body wasn't JSON — fall through to the raw text
  }
  return body.slice(0, 300);
}

export async function generateElevenLabsSpeech({
  text,
  voiceId,
}: {
  text: string;
  voiceId: string;
}): Promise<Buffer> {
  const { apiKey, model } = await getElevenLabsProvider();

  const res = await fetch(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: model }),
  });

  if (!res.ok) {
    throw new Error(`Gagal membuat suara balasan (${res.status}): ${await extractErrorMessage(res)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export interface CharacterTiming {
  character: string;
  start: number;
  end: number;
}

/**
 * Same voice/text as generateElevenLabsSpeech, same per-character pricing —
 * just requests the variant endpoint that also returns per-character timing
 * alongside the audio, so a caller (the "avatar3d" virtual-host mode) can
 * lip-sync the VRM avatar to the actual audio instead of paying for a
 * rendered video.
 */
export async function generateElevenLabsSpeechWithTimestamps({
  text,
  voiceId,
}: {
  text: string;
  voiceId: string;
}): Promise<{ audioBuffer: Buffer; characters: CharacterTiming[] }> {
  const { apiKey, model } = await getElevenLabsProvider();

  const res = await fetch(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: model }),
  });

  if (!res.ok) {
    throw new Error(`Gagal membuat suara balasan (${res.status}): ${await extractErrorMessage(res)}`);
  }

  const data = await res.json();
  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const alignment = data.alignment as {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  const characters: CharacterTiming[] = (alignment?.characters ?? []).map((character, i) => ({
    character,
    start: alignment.character_start_times_seconds[i],
    end: alignment.character_end_times_seconds[i],
  }));

  return { audioBuffer, characters };
}

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  gender: string | null;
  accent: string | null;
  previewUrl: string | null;
  isPremium: boolean;
}

/**
 * Fetches voices actually available to the configured account, rather than a
 * hardcoded list — ElevenLabs' shared "Default voices" library is being
 * retired (expires end of 2026, and isn't granted to accounts created after
 * March 2026), so a static ID list would silently break for some accounts.
 *
 * Voice Library ("professional"/shared) voices return 402 Payment Required
 * at generation time on ElevenLabs' free tier even if added to "My Voices" —
 * they require a paid plan (Starter or above), so they're only included once
 * the account is confirmed to be on one.
 */
export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const { apiKey } = await getElevenLabsProvider();

  const res = await fetch(`${API_BASE}/v2/voices?page_size=100`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar suara (${res.status}): ${await extractErrorMessage(res)}`);
  }

  const data = await res.json();
  const allVoices = Array.isArray(data?.voices) ? data.voices : [];

  return allVoices.map((v: Record<string, unknown>) => {
    const labels = (v.labels as Record<string, unknown>) ?? {};
    return {
      voiceId: String(v.voice_id),
      name: String(v.name ?? v.voice_id),
      gender: typeof labels.gender === "string" ? labels.gender : null,
      accent: typeof labels.accent === "string" ? labels.accent : null,
      previewUrl: typeof v.preview_url === "string" ? v.preview_url : null,
      isPremium: v.category !== "premade",
    };
  });
}

/**
 * Searches ElevenLabs' full shared Voice Library (thousands of community/
 * professional voices), not just the ones already added to this account's
 * "My Voices" — the account list can have as few as a handful per language,
 * while the library has far more (confirmed: Indonesian alone has dozens).
 * Paid plans (Starter+) can use a returned voice_id directly for
 * text-to-speech without any separate "add to my voices" step.
 */
export async function listElevenLabsSharedVoices(language: string): Promise<ElevenLabsVoice[]> {
  const { apiKey } = await getElevenLabsProvider();

  const params = new URLSearchParams({ page_size: "100", language, sort: "trending" });
  const res = await fetch(`${API_BASE}/v1/shared-voices?${params.toString()}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar suara (${res.status}): ${await extractErrorMessage(res)}`);
  }

  const data = await res.json();
  const allVoices = Array.isArray(data?.voices) ? data.voices : [];

  return allVoices.map((v: Record<string, unknown>) => ({
    voiceId: String(v.voice_id),
    name: String(v.name ?? v.voice_id),
    gender: typeof v.gender === "string" ? v.gender : null,
    accent: typeof v.accent === "string" ? v.accent : null,
    previewUrl: typeof v.preview_url === "string" ? v.preview_url : null,
    isPremium: true,
  }));
}

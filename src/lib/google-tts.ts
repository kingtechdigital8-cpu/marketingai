import { v1beta1 } from "@google-cloud/text-to-speech";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import ffprobeStatic from "ffprobe-static";
import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";
import type { CharacterTiming } from "@/lib/elevenlabs-tts";

const execFileAsync = promisify(execFile);
const FFPROBE_BIN = ffprobeStatic.path;

const GOOGLE_TTS_SLUG = "google-tts-chirp3";

/**
 * The admin's "API Key" field (a generic text column shared by every
 * AiProvider row — see elevenlabs-tts.ts for the same pattern) holds a full
 * Google Cloud SERVICE ACCOUNT JSON key for this provider, not a short API
 * key string. Text-to-Speech's synthesize endpoint requires OAuth2
 * credentials (confirmed against Google's own REST reference — unlike some
 * Cloud APIs, it does not accept a bare `?key=` API key), and the standard,
 * officially-documented way to authenticate a backend service with those is
 * to hand the client library the parsed service-account JSON directly
 * (`credentials`), which is exactly what a Google Cloud service-account key
 * file contains. A new client is created per call rather than cached — this
 * fires once per generated reply (not a hot path), and avoids ever serving a
 * stale credential if the admin rotates the key.
 */
async function getGoogleTtsClient(): Promise<v1beta1.TextToSpeechClient> {
  const provider = await prisma.aiProvider.findUnique({ where: { slug: GOOGLE_TTS_SLUG } });
  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new ProviderNotConfiguredError(
      "Layanan Google Cloud Text-to-Speech belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Provider AI."
    );
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(provider.apiKey);
  } catch {
    throw new Error(
      "Kredensial Google Cloud tidak valid — kolom API Key untuk provider ini harus diisi seluruh isi file JSON service account, bukan API key biasa."
    );
  }
  return new v1beta1.TextToSpeechClient({ credentials });
}

/** Voice names follow "<locale>-Chirp3-HD-<name>" (e.g. "id-ID-Chirp3-HD-Autonoe") — the locale prefix IS the languageCode Google's API expects, so this never needs to be tracked/stored separately from the voice name itself. */
function deriveLanguageCode(voiceName: string): string {
  const match = voiceName.match(/^([a-z]{2,3}-[A-Z]{2})-/);
  return match ? match[1] : "id-ID";
}

export async function generateGoogleTtsSpeech({ text, voiceName }: { text: string; voiceName: string }): Promise<Buffer> {
  const client = await getGoogleTtsClient();
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: deriveLanguageCode(voiceName), name: voiceName },
    audioConfig: { audioEncoding: "MP3" },
  });
  if (!response.audioContent) throw new Error("Google Cloud TTS tidak menghasilkan audio.");
  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * ffprobe (already a project dependency, see ffmpeg.ts for the same
 * execFile pattern used for video) needs a real file, not an in-memory
 * buffer — written to the OS temp dir and always cleaned up, even on error.
 */
async function probeAudioDurationSeconds(audioBuffer: Buffer): Promise<number> {
  const tempPath = path.join(os.tmpdir(), `google-tts-${randomUUID()}.mp3`);
  await writeFile(tempPath, audioBuffer);
  try {
    const { stdout } = await execFileAsync(FFPROBE_BIN, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      tempPath,
    ]);
    const duration = Number(JSON.parse(stdout)?.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

/** Spreads every character (including spaces/punctuation, same convention as ElevenLabs' own per-character timing) evenly across the given duration. Falls back to zero-width entries if duration couldn't be measured — matches findActiveViseme's existing "no active interval" behavior rather than inventing a fake pace. */
function buildEvenCharacterTiming(text: string, durationSeconds: number): CharacterTiming[] {
  if (durationSeconds <= 0 || text.length === 0) {
    return [...text].map((character) => ({ character, start: 0, end: 0 }));
  }
  const charDuration = durationSeconds / text.length;
  return [...text].map((character, i) => ({
    character,
    start: i * charDuration,
    end: (i + 1) * charDuration,
  }));
}

/**
 * Chirp3 HD's synthesize response has no per-character alignment the way
 * ElevenLabs' /with-timestamps endpoint does. Google's documented timing
 * hook — SSML <mark> tags + enableTimePointing — was tried first, but
 * confirmed empirically against a real Chirp3 HD call to return a
 * completely EMPTY timepoints array regardless (the model appears to not
 * support SSML marks at all, unlike Google's older WaveNet/Neural2 voices).
 * The fallback here — measuring the actual rendered audio's real duration
 * (via ffprobe) and spreading every character evenly across it — is a
 * coarser approximation than true phoneme timing, but produces genuinely
 * moving, roughly-paced lip-sync instead of a frozen mouth, and self-
 * corrects to whatever this specific reply/voice/pace actually renders at
 * (unlike a flat chars-per-second guess).
 */
export async function generateGoogleTtsSpeechWithTimestamps({
  text,
  voiceName,
}: {
  text: string;
  voiceName: string;
}): Promise<{ audioBuffer: Buffer; characters: CharacterTiming[] }> {
  const client = await getGoogleTtsClient();

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: deriveLanguageCode(voiceName), name: voiceName },
    audioConfig: { audioEncoding: "MP3" },
  });
  if (!response.audioContent) throw new Error("Google Cloud TTS tidak menghasilkan audio.");
  const audioBuffer = Buffer.from(response.audioContent as Uint8Array);

  const durationSeconds = await probeAudioDurationSeconds(audioBuffer);
  const characters = buildEvenCharacterTiming(text, durationSeconds);

  return { audioBuffer, characters };
}

// Short, natural-sounding greeting per language for the "listen" preview
// button — a real TTS call (billed like any other synthesis), so this stays
// short. Falls back to English for locales without a curated phrase; English
// text is intelligible read by virtually any Chirp3 HD voice even if accented.
const PREVIEW_SAMPLE_TEXT: Record<string, string> = {
  "id-ID": "Halo, ini contoh suara saya untuk Live TikTok.",
  "en-US": "Hi there, this is a preview of my voice.",
  "en-GB": "Hi there, this is a preview of my voice.",
  "en-AU": "Hi there, this is a preview of my voice.",
  "en-IN": "Hi there, this is a preview of my voice.",
  "cmn-CN": "你好,这是我的声音预览。",
  "yue-HK": "你好,呢個係我把聲嘅預覽。",
  "ja-JP": "こんにちは、これは私の声のサンプルです。",
  "ko-KR": "안녕하세요, 제 목소리 미리듣기입니다.",
  "vi-VN": "Xin chào, đây là bản xem trước giọng nói của tôi.",
  "th-TH": "สวัสดีค่ะ นี่คือตัวอย่างเสียงของฉัน",
  "hi-IN": "नमस्ते, यह मेरी आवाज़ का एक नमूना है।",
  "ar-XA": "مرحبا، هذه معاينة لصوتي.",
  "es-ES": "Hola, esta es una vista previa de mi voz.",
  "es-US": "Hola, esta es una vista previa de mi voz.",
  "pt-BR": "Olá, esta é uma prévia da minha voz.",
  "fr-FR": "Bonjour, ceci est un aperçu de ma voix.",
  "fr-CA": "Bonjour, ceci est un aperçu de ma voix.",
  "de-DE": "Hallo, das ist eine Vorschau meiner Stimme.",
  "it-IT": "Ciao, questa è un'anteprima della mia voce.",
  "nl-NL": "Hallo, dit is een voorbeeld van mijn stem.",
  "ru-RU": "Привет, это образец моего голоса.",
  "tr-TR": "Merhaba, bu benim sesimin bir önizlemesi.",
};

export function getPreviewSampleText(voiceName: string): string {
  const languageCode = deriveLanguageCode(voiceName);
  return PREVIEW_SAMPLE_TEXT[languageCode] ?? "Hi there, this is a preview of my voice.";
}

export interface GoogleTtsVoice {
  voiceId: string; // the full name, e.g. "id-ID-Chirp3-HD-Autonoe" — passed straight back as `voice` on save
  name: string; // just the speaker name, e.g. "Autonoe"
  gender: string | null;
}

/**
 * Queried live against the account's actual catalog rather than a hardcoded
 * list — same reasoning as listElevenLabsVoices(): Google's own Chirp3 HD
 * lineup has changed shape before (new voices added) and availability can
 * differ by region/project, so a static list risks silently going stale.
 * Filtered to Chirp3 HD specifically (this project only wants the newest,
 * most natural generation) and to Indonesian, this product's language.
 */
export async function listGoogleTtsVoices(languageCode = "id-ID"): Promise<GoogleTtsVoice[]> {
  const client = await getGoogleTtsClient();
  const [response] = await client.listVoices({ languageCode });
  const voices = response.voices ?? [];

  return voices
    .filter((v) => typeof v.name === "string" && v.name.includes("Chirp3-HD"))
    .map((v) => {
      const name = v.name ?? "";
      const speakerName = name.split("-Chirp3-HD-")[1] ?? name;
      const genderRaw = v.ssmlGender;
      const gender = genderRaw === "MALE" ? "male" : genderRaw === "FEMALE" ? "female" : null;
      return { voiceId: name, name: speakerName, gender };
    });
}

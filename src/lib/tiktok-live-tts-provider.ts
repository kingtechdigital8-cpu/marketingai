import { prisma } from "@/lib/prisma";

export type TtsProvider = "elevenlabs" | "google-tts";

const SETTING_KEY = "tiktok.tts_provider";

/** Which TTS backend every user's `voice` value is interpreted against — an
 * admin-wide choice (Setting table, same pattern as tiktok.sign_provider),
 * not per-user, since it's really a cost-control decision the platform owner
 * makes, not something individual users need to reason about. */
export async function getActiveTtsProvider(): Promise<TtsProvider> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return row?.value === "google-tts" ? "google-tts" : "elevenlabs";
}

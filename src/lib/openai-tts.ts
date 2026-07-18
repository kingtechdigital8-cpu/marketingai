import { getOpenAiClient } from "@/lib/ai-provider";

const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);

export function isAllowedVoice(voice: string): boolean {
  return ALLOWED_VOICES.has(voice);
}

export async function generateSpeech({ text, voice }: { text: string; voice: string }): Promise<Buffer> {
  const { client, model } = await getOpenAiClient("openai-tts");

  const response = await client.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
  });

  return Buffer.from(await response.arrayBuffer());
}

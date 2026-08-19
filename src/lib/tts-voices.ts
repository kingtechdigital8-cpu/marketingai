// Client-safe voice roster for our own openai-tts pipeline (src/lib/openai-tts.ts),
// shared by the Voice Changer and Live TikTok AI reply features.
export const TTS_VOICES = [
  { value: "alloy", label: "Alloy (netral)" },
  { value: "nova", label: "Nova (wanita, ceria)" },
  { value: "shimmer", label: "Shimmer (wanita, lembut)" },
  { value: "echo", label: "Echo (pria, hangat)" },
  { value: "onyx", label: "Onyx (pria, dalam)" },
  { value: "fable", label: "Fable (pria, ekspresif)" },
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number]["value"];

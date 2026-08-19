// Shared between the Live TikTok voice picker (client) and the ElevenLabs
// server helpers — kept in its own module (no server-only imports) so the
// client bundle can import it directly.

// The languages eleven_multilingual_v2 (our TTS model) actually supports —
// matches the "Languages" filter in ElevenLabs' own Voice Library, so every
// value here is guaranteed to return real results.
export const ELEVENLABS_LANGUAGES = [
  { code: "id", label: "Indonesia" },
  { code: "en", label: "Inggris" },
  { code: "zh", label: "Mandarin" },
  { code: "ja", label: "Jepang" },
  { code: "ko", label: "Korea" },
  { code: "ms", label: "Melayu" },
  { code: "fil", label: "Filipina" },
  { code: "hi", label: "India (Hindi)" },
  { code: "ta", label: "Tamil" },
  { code: "ar", label: "Arab" },
  { code: "es", label: "Spanyol" },
  { code: "pt", label: "Portugis" },
  { code: "fr", label: "Prancis" },
  { code: "de", label: "Jerman" },
  { code: "it", label: "Italia" },
  { code: "nl", label: "Belanda" },
  { code: "tr", label: "Turki" },
  { code: "pl", label: "Polandia" },
  { code: "sv", label: "Swedia" },
  { code: "da", label: "Denmark" },
  { code: "fi", label: "Finlandia" },
  { code: "el", label: "Yunani" },
  { code: "cs", label: "Ceko" },
  { code: "sk", label: "Slovakia" },
  { code: "ro", label: "Rumania" },
  { code: "bg", label: "Bulgaria" },
  { code: "hr", label: "Kroasia" },
  { code: "uk", label: "Ukraina" },
  { code: "ru", label: "Rusia" },
] as const;

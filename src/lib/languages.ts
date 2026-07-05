export interface LanguageOption {
  code: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "th", label: "ภาษาไทย (Thai)" },
  { code: "vi", label: "Tiếng Việt (Vietnamese)" },
  { code: "zh-cn", label: "中文简体 (Chinese Simplified)" },
  { code: "zh-tw", label: "中文繁體 (Chinese Traditional)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "ko", label: "한국어 (Korean)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "bn", label: "বাংলা (Bengali)" },
  { code: "ur", label: "اردو (Urdu)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
  { code: "fa", label: "فارسی (Persian/Farsi)" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "he", label: "עברית (Hebrew)" },
  { code: "tl", label: "Filipino (Tagalog)" },
  { code: "my", label: "မြန်မာဘာသာ (Burmese)" },
  { code: "km", label: "ភាសាខ្មែរ (Khmer)" },
  { code: "lo", label: "ພາສາລາວ (Lao)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "pt-br", label: "Português Brasileiro (Portuguese - Brazil)" },
  { code: "pt-pt", label: "Português (Portuguese - Portugal)" },
  { code: "fr", label: "Français (French)" },
  { code: "de", label: "Deutsch (German)" },
  { code: "it", label: "Italiano (Italian)" },
  { code: "nl", label: "Nederlands (Dutch)" },
  { code: "sv", label: "Svenska (Swedish)" },
  { code: "no", label: "Norsk (Norwegian)" },
  { code: "da", label: "Dansk (Danish)" },
  { code: "fi", label: "Suomi (Finnish)" },
  { code: "pl", label: "Polski (Polish)" },
  { code: "cs", label: "Čeština (Czech)" },
  { code: "el", label: "Ελληνικά (Greek)" },
  { code: "ro", label: "Română (Romanian)" },
  { code: "hu", label: "Magyar (Hungarian)" },
  { code: "uk", label: "Українська (Ukrainian)" },
  { code: "ru", label: "Русский (Russian)" },
  { code: "tr", label: "Türkçe (Turkish)" },
  { code: "sw", label: "Kiswahili (Swahili)" },
];

export function getLanguageLabel(code?: string | null): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? LANGUAGES[0].label;
}

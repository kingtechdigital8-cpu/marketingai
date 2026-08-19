// Shared between the Auto Clip form (client) and the API route's validation
// (server), so labels/values always stay in sync.

export const ASPECT_RATIOS = [
  { value: "original", label: "Rasio Asli" },
  { value: "9:16", label: "Vertikal 9:16 (Shorts/Reels/TikTok)" },
  { value: "1:1", label: "Kotak 1:1 (Feed)" },
] as const;

export type AspectRatioOption = (typeof ASPECT_RATIOS)[number]["value"];

export const EFFECT_PRESETS = [
  { value: "zoom_punch", label: "Zoom Punch" },
  { value: "zoom_out", label: "Zoom Out" },
  { value: "cinematic_grade", label: "Cinematic Grade" },
  { value: "vintage_warm", label: "Vintage Warm" },
  { value: "black_white", label: "Hitam Putih" },
  { value: "vivid_pop", label: "Vivid Pop" },
] as const;

export type EffectPresetOption = (typeof EFFECT_PRESETS)[number]["value"];

export const MIN_CLIP_COUNT = 1;
export const MAX_CLIP_COUNT = 20;
export const DEFAULT_CLIP_COUNT = 20;

// value/family must match the font's real family name (verified against both
// drawtext's fontfile and libass's fontsdir-based fontselect). Each entry
// lists all 4 weight/style file variants under public/fonts/ — Bebas Neue and
// Anton only ship one real weight in Google Fonts (they're already bold
// display faces), so their variants all point at the same file rather than
// branching resolveFont() into a special case. cssFamily is the @font-face
// name declared in globals.css (weight/style are separate @font-face blocks
// under the same family there), used only for the browser-side previews.
export const TEXT_STYLE_FONTS = [
  {
    value: "inter",
    label: "Inter (Modern)",
    family: "Inter",
    cssFamily: "Auto Clip Inter",
    supportsBoldItalic: true,
    files: {
      regular: "Inter-Regular.ttf",
      bold: "Inter-Bold.ttf",
      italic: "Inter-Italic.ttf",
      boldItalic: "Inter-BoldItalic.ttf",
    },
  },
  {
    value: "poppins",
    label: "Poppins (Rounded)",
    family: "Poppins",
    cssFamily: "Auto Clip Poppins",
    supportsBoldItalic: true,
    files: {
      regular: "Poppins-Regular.ttf",
      bold: "Poppins-Bold.ttf",
      italic: "Poppins-Italic.ttf",
      boldItalic: "Poppins-BoldItalic.ttf",
    },
  },
  {
    value: "bebas",
    label: "Bebas Neue (Ramping Tebal)",
    family: "Bebas Neue",
    cssFamily: "Auto Clip Bebas Neue",
    supportsBoldItalic: false,
    files: {
      regular: "BebasNeue-Regular.ttf",
      bold: "BebasNeue-Regular.ttf",
      italic: "BebasNeue-Regular.ttf",
      boldItalic: "BebasNeue-Regular.ttf",
    },
  },
  {
    value: "anton",
    label: "Anton (Impact)",
    family: "Anton",
    cssFamily: "Auto Clip Anton",
    supportsBoldItalic: false,
    files: {
      regular: "Anton-Regular.ttf",
      bold: "Anton-Regular.ttf",
      italic: "Anton-Regular.ttf",
      boldItalic: "Anton-Regular.ttf",
    },
  },
  {
    value: "archivo_black",
    label: "Archivo Black (Tebal Solid)",
    family: "Archivo Black",
    cssFamily: "Auto Clip Archivo Black",
    supportsBoldItalic: false,
    files: {
      regular: "ArchivoBlack-Regular.ttf",
      bold: "ArchivoBlack-Regular.ttf",
      italic: "ArchivoBlack-Regular.ttf",
      boldItalic: "ArchivoBlack-Regular.ttf",
    },
  },
  {
    value: "fjalla_one",
    label: "Fjalla One (Ramping Rapi)",
    family: "Fjalla One",
    cssFamily: "Auto Clip Fjalla One",
    supportsBoldItalic: false,
    files: {
      regular: "FjallaOne-Regular.ttf",
      bold: "FjallaOne-Regular.ttf",
      italic: "FjallaOne-Regular.ttf",
      boldItalic: "FjallaOne-Regular.ttf",
    },
  },
  {
    value: "alfa_slab_one",
    label: "Alfa Slab One (Chunky)",
    family: "Alfa Slab One",
    cssFamily: "Auto Clip Alfa Slab One",
    supportsBoldItalic: false,
    files: {
      regular: "AlfaSlabOne-Regular.ttf",
      bold: "AlfaSlabOne-Regular.ttf",
      italic: "AlfaSlabOne-Regular.ttf",
      boldItalic: "AlfaSlabOne-Regular.ttf",
    },
  },
  {
    value: "passion_one",
    label: "Passion One (Bulat Tebal)",
    family: "Passion One",
    cssFamily: "Auto Clip Passion One",
    supportsBoldItalic: false,
    files: {
      regular: "PassionOne-Regular.ttf",
      bold: "PassionOne-Regular.ttf",
      italic: "PassionOne-Regular.ttf",
      boldItalic: "PassionOne-Regular.ttf",
    },
  },
  {
    value: "bangers",
    label: "Bangers (Komik Playful)",
    family: "Bangers",
    cssFamily: "Auto Clip Bangers",
    supportsBoldItalic: false,
    files: {
      regular: "Bangers-Regular.ttf",
      bold: "Bangers-Regular.ttf",
      italic: "Bangers-Regular.ttf",
      boldItalic: "Bangers-Regular.ttf",
    },
  },
  {
    value: "righteous",
    label: "Righteous (Bulat Modern)",
    family: "Righteous",
    cssFamily: "Auto Clip Righteous",
    supportsBoldItalic: false,
    files: {
      regular: "Righteous-Regular.ttf",
      bold: "Righteous-Regular.ttf",
      italic: "Righteous-Regular.ttf",
      boldItalic: "Righteous-Regular.ttf",
    },
  },
  {
    value: "bungee",
    label: "Bungee (Urban Bold)",
    family: "Bungee",
    cssFamily: "Auto Clip Bungee",
    supportsBoldItalic: false,
    files: {
      regular: "Bungee-Regular.ttf",
      bold: "Bungee-Regular.ttf",
      italic: "Bungee-Regular.ttf",
      boldItalic: "Bungee-Regular.ttf",
    },
  },
  {
    value: "lobster",
    label: "Lobster (Script Kasual)",
    family: "Lobster",
    cssFamily: "Auto Clip Lobster",
    supportsBoldItalic: false,
    files: {
      regular: "Lobster-Regular.ttf",
      bold: "Lobster-Regular.ttf",
      italic: "Lobster-Regular.ttf",
      boldItalic: "Lobster-Regular.ttf",
    },
  },
] as const;

export type TextStyleFontOption = (typeof TEXT_STYLE_FONTS)[number]["value"];
export const DEFAULT_TEXT_FONT: TextStyleFontOption = "inter";

/** True 6-digit hex (no #) — the format both drawtext and the ASS color helpers expect. */
export function isValidHexColor(value: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(value);
}

// Kept as one-click starting points for the "Template" gallery and as the
// legacy value shape (resolveColorHex/resolveBackgroundHex in ffmpeg.ts
// accept either a raw hex string OR one of these preset keys) — the actual
// color picker in the UI now accepts any hex, not just this list.
export const TEXT_STYLE_COLORS = [
  { value: "white", label: "Putih", hex: "FFFFFF" },
  { value: "black", label: "Hitam", hex: "000000" },
  { value: "yellow", label: "Kuning", hex: "FFD60A" },
  { value: "red", label: "Merah", hex: "FF3B30" },
  { value: "brand", label: "Hijau Brand", hex: "10B981" },
] as const;

export type TextStyleColorOption = (typeof TEXT_STYLE_COLORS)[number]["value"];
export const DEFAULT_TEXT_COLOR: TextStyleColorOption = "white";

export const TEXT_STYLE_BACKGROUNDS = [
  { value: "none", label: "Tanpa Latar", hex: null },
  { value: "black", label: "Kotak Hitam", hex: "000000" },
  { value: "white", label: "Kotak Putih", hex: "FFFFFF" },
  { value: "brand", label: "Kotak Hijau Brand", hex: "10B981" },
] as const;

export type TextStyleBackgroundOption = (typeof TEXT_STYLE_BACKGROUNDS)[number]["value"];
export const DEFAULT_TEXT_BACKGROUND: TextStyleBackgroundOption = "black";

export const TEXT_STYLE_ALIGNMENTS = [
  { value: "left", label: "Kiri" },
  { value: "center", label: "Tengah" },
  { value: "right", label: "Kanan" },
] as const;
export type TextStyleAlignOption = (typeof TEXT_STYLE_ALIGNMENTS)[number]["value"];
export const DEFAULT_TEXT_ALIGN: TextStyleAlignOption = "center";

export const MIN_FONT_SCALE = 50;
export const MAX_FONT_SCALE = 200;
export const DEFAULT_FONT_SCALE = 100;

// "Entrance" animations only (matches what the user is picking these for —
// a caption/headline appearing), not exit/loop animations.
// supportsHeadline=false means it's not offered for the headline picker:
// "blur" needs a separate blurred text layer composited over the video
// (multi-branch filter graph) which drawtext alone can't do — libass's
// native \blur tag makes it trivial for subtitles, so it's subtitle-only.
export const TEXT_STYLE_ANIMATIONS = [
  { value: "none", label: "Tanpa Animasi", supportsHeadline: true },
  { value: "fade", label: "Fade In", supportsHeadline: true },
  { value: "pop", label: "Pop In", supportsHeadline: true },
  { value: "blur", label: "Blur In", supportsHeadline: false },
  { value: "typewriter", label: "Ketik (Typewriter)", supportsHeadline: true },
  { value: "slide_up", label: "Geser Naik", supportsHeadline: true },
  { value: "bounce", label: "Pantul (Bounce)", supportsHeadline: true },
  // Needs per-word Whisper timestamps, only meaningful for the multi-line
  // subtitle track — a single headline has no "current word" to highlight.
  { value: "karaoke", label: "Karaoke (Highlight Kata)", supportsHeadline: false },
] as const;

export type TextStyleAnimationOption = (typeof TEXT_STYLE_ANIMATIONS)[number]["value"];
export const DEFAULT_TEXT_ANIMATION: TextStyleAnimationOption = "none";

// Quick-pick combos of the font/color/background/animation/bold/uppercase
// options above — picking one just fills those fields, so it's still fully
// editable afterward rather than being a separate locked-in mode. Deliberately
// spans every animation in TEXT_STYLE_ANIMATIONS at least once (including the
// subtitle-only karaoke/blur ones — the picker itself filters those out for
// headline context, see auto-clip/page.tsx) so browsing presets alone shows
// off the full range of what's possible, not just 2-3 repeated looks.
export const TEXT_STYLE_PRESETS = [
  {
    value: "classic",
    label: "Klasik",
    font: "inter",
    color: "white",
    background: "black",
    animation: "fade",
    bold: false,
    uppercase: false,
  },
  {
    value: "bold_impact",
    label: "Bold Impact",
    font: "anton",
    color: "yellow",
    background: "black",
    animation: "pop",
    bold: false,
    uppercase: true,
  },
  {
    value: "minimal",
    label: "Minimalis",
    font: "inter",
    color: "white",
    background: "none",
    animation: "fade",
    bold: false,
    uppercase: false,
  },
  {
    value: "neon_brand",
    label: "Neon Brand",
    font: "poppins",
    color: "brand",
    background: "black",
    animation: "pop",
    bold: true,
    uppercase: false,
  },
  {
    value: "high_contrast",
    label: "Kontras Tinggi",
    font: "bebas",
    color: "black",
    background: "white",
    animation: "none",
    bold: false,
    uppercase: true,
  },
  {
    value: "bold_red",
    label: "Merah Berani",
    font: "anton",
    color: "red",
    background: "black",
    animation: "pop",
    bold: false,
    uppercase: true,
  },
  {
    value: "typewriter_clean",
    label: "Ketik Hidup",
    font: "inter",
    color: "white",
    background: "none",
    animation: "typewriter",
    bold: false,
    uppercase: false,
  },
  {
    value: "momentum",
    label: "Momentum",
    font: "bebas",
    color: "white",
    background: "black",
    animation: "slide_up",
    bold: false,
    uppercase: true,
  },
  {
    value: "bounce_fresh",
    label: "Pantul Segar",
    font: "poppins",
    color: "white",
    background: "brand",
    animation: "bounce",
    bold: true,
    uppercase: false,
  },
  {
    value: "karaoke_cheerful",
    label: "Karaoke Ceria",
    font: "poppins",
    color: "white",
    background: "none",
    animation: "karaoke",
    bold: true,
    uppercase: false,
  },
  {
    value: "cinematic_blur",
    label: "Blur Sinematik",
    font: "poppins",
    color: "white",
    background: "none",
    animation: "blur",
    bold: false,
    uppercase: false,
  },
  {
    value: "playful_green",
    label: "Hijau Playful",
    font: "anton",
    color: "black",
    background: "brand",
    animation: "pop",
    bold: false,
    uppercase: true,
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  font: TextStyleFontOption;
  color: TextStyleColorOption;
  background: TextStyleBackgroundOption;
  animation: TextStyleAnimationOption;
  bold: boolean;
  uppercase: boolean;
}>;

// Shared between subtitle and headline positioning. "auto" resolves
// differently per context (bottom for subtitle, top for headline — see
// DEFAULT_SUBTITLE_POSITION / DEFAULT_HEADLINE_POSITION and ffmpeg.ts's
// computeHeadlineBasePosition), kept as a distinct value from "top"/"bottom"
// so each text type's sensible default is explicit rather than hardcoded.
export const TEXT_STYLE_POSITIONS = [
  { value: "auto", label: "Auto" },
  { value: "top", label: "Atas" },
  { value: "middle", label: "Tengah" },
  { value: "bottom", label: "Bawah" },
  { value: "custom", label: "Custom" },
] as const;
export type TextStylePositionOption = (typeof TEXT_STYLE_POSITIONS)[number]["value"];
export const DEFAULT_SUBTITLE_POSITION: TextStylePositionOption = "auto";
export const DEFAULT_SUBTITLE_POSITION_X = 50;
export const DEFAULT_SUBTITLE_POSITION_Y = 85;
export const DEFAULT_HEADLINE_POSITION: TextStylePositionOption = "top";
export const DEFAULT_HEADLINE_POSITION_X = 50;
export const DEFAULT_HEADLINE_POSITION_Y = 6;

// Always resegments captions into short, word-capped cues using per-word
// Whisper timestamps (see buildChunkedCaptionsForMoment in
// video-clip-manager.ts) — there's no more "raw Whisper segment" mode, since
// an unspoken-for-length spoken segment could render as one huge unwrapped
// line at small font sizes. "one" = up to WORDS_PER_LINE words on a single
// line; "two" = up to 2×WORDS_PER_LINE words, forced onto exactly two lines
// (an explicit break after the first WORDS_PER_LINE, not just auto-wrap).
export const SUBTITLE_LINE_MODES = [
  { value: "one", label: "1 Baris" },
  { value: "two", label: "2 Baris" },
] as const;
export type SubtitleLineModeOption = (typeof SUBTITLE_LINE_MODES)[number]["value"];
export const DEFAULT_SUBTITLE_LINE_MODE: SubtitleLineModeOption = "one";
export const WORDS_PER_LINE = 3;

export const MIN_STROKE_WIDTH = 0;
export const MAX_STROKE_WIDTH = 6;
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_STROKE_COLOR = "000000";

export const MIN_SHADOW_OFFSET = 0;
export const MAX_SHADOW_OFFSET = 10;
export const DEFAULT_SHADOW_OFFSET = 2;

export const DEFAULT_HIGHLIGHT_COLOR = "10B981";

// Must comfortably cover a full-length video at MAX_DURATION_SECONDS —
// downloadYoutubeVideo caps at 720p, and a 45-minute 720p mp4 can reach
// ~1.5-1.7GB (~38MB/min), so at the 2-hour ceiling that's roughly 4.5GB
// worst case. 5GB leaves headroom above that.
export const MAX_VIDEO_BYTES = 5000 * 1024 * 1024;
// Whisper's hard per-request limit is 25MB of audio, which our extraction
// bitrate (64kbps mono, see extractAudio) hits around ~55 minutes — well
// under what a real podcast/long-form video needs. video-clip-manager.ts
// transcribes past that by splitting the audio into TRANSCRIPTION_CHUNK_SECONDS
// pieces and merging the results, so this ceiling is now just a sane upper
// bound (2 hours) rather than dictated by the Whisper file-size limit.
export const MAX_DURATION_SECONDS = 120 * 60;
// Each chunk's audio (64kbps mono) comes out to ~11.4MB at this length —
// comfortable margin under Whisper's 25MB/request limit.
export const TRANSCRIPTION_CHUNK_SECONDS = 25 * 60;
// Clips are padded up to a 60s minimum (MIN_MOMENT_SECONDS in
// video-clip-manager.ts) — a shorter source could never produce one.
export const MIN_DURATION_SECONDS = 60;

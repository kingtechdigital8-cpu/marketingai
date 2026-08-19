// Shared between the Brand Kit asset picker (client) and the upload API's
// validation (server) — mirrors the pattern in video-clip-options.ts.

export const VIDEO_CLIP_ASSET_KINDS = [
  {
    value: "LOGO",
    label: "Logo",
    accept: "image/png,image/jpeg,image/webp",
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    hint: "PNG/JPG/WEBP, maks 5MB",
  },
  {
    value: "INTRO",
    label: "Intro",
    accept: "video/mp4,video/webm,video/quicktime",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    maxBytes: 50 * 1024 * 1024,
    maxDurationSeconds: 15,
    hint: "MP4/WEBM/MOV, maks 50MB & 15 detik",
  },
  {
    value: "OUTRO",
    label: "Outro",
    accept: "video/mp4,video/webm,video/quicktime",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    maxBytes: 50 * 1024 * 1024,
    maxDurationSeconds: 15,
    hint: "MP4/WEBM/MOV, maks 50MB & 15 detik",
  },
  {
    value: "MUSIC",
    label: "Musik",
    accept: "audio/mpeg,audio/mp4,audio/wav,audio/x-wav",
    mimeTypes: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav"],
    maxBytes: 20 * 1024 * 1024,
    hint: "MP3/M4A/WAV, maks 20MB",
  },
] as const;

export type VideoClipAssetKind = (typeof VIDEO_CLIP_ASSET_KINDS)[number]["value"];

export function getAssetKindConfig(kind: string) {
  return VIDEO_CLIP_ASSET_KINDS.find((k) => k.value === kind);
}

export const OVERLAY_LOGO_POSITIONS = [
  { value: "top-left", label: "Kiri Atas" },
  { value: "top-right", label: "Kanan Atas" },
  { value: "bottom-left", label: "Kiri Bawah" },
  { value: "bottom-right", label: "Kanan Bawah" },
] as const;
export type OverlayLogoPosition = (typeof OVERLAY_LOGO_POSITIONS)[number]["value"];
export const DEFAULT_OVERLAY_LOGO_POSITION: OverlayLogoPosition = "top-right";

export const FIT_MODES = [
  { value: "fill", label: "Isi Penuh (Crop)" },
  { value: "fit", label: "Muat Semua (Letterbox)" },
] as const;
export type FitMode = (typeof FIT_MODES)[number]["value"];
export const DEFAULT_FIT_MODE: FitMode = "fill";

// Only meaningful when fitMode is "fill" — "fit" never crops, so there's no
// frame to steer. Runs local face detection (see video-clip-reframe.ts), no
// external API cost.
export const DEFAULT_SMART_CROP_ENABLED = false;

export const DEFAULT_MUSIC_VOLUME_PERCENT = 20;
export const MAX_CTA_TEXT_LENGTH = 60;

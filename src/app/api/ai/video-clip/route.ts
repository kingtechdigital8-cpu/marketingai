import { randomUUID } from "crypto";
import { writeFile, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { probeMetadata } from "@/lib/ffmpeg";
import { uploadToR2 } from "@/lib/r2";
import { isYoutubeUrl, getYoutubeInfo } from "@/lib/youtube";
import { reserveCreditsForVideoClipBatch, InsufficientCreditError } from "@/lib/credit";
import { getProviderCost, roundCreditCost } from "@/lib/provider-cost";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { ensureDbConnection } from "@/lib/with-db-retry";
import { videoClipManager } from "@/lib/video-clip-manager";
import {
  ASPECT_RATIOS,
  EFFECT_PRESETS,
  MIN_CLIP_COUNT,
  MAX_CLIP_COUNT,
  DEFAULT_CLIP_COUNT,
  MAX_VIDEO_BYTES,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  TEXT_STYLE_FONTS,
  TEXT_STYLE_COLORS,
  TEXT_STYLE_BACKGROUNDS,
  TEXT_STYLE_ANIMATIONS,
  TEXT_STYLE_ALIGNMENTS,
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_BACKGROUND,
  DEFAULT_TEXT_ANIMATION,
  DEFAULT_TEXT_ALIGN,
  MIN_FONT_SCALE,
  MAX_FONT_SCALE,
  DEFAULT_FONT_SCALE,
  isValidHexColor,
  TEXT_STYLE_POSITIONS,
  SUBTITLE_LINE_MODES,
  DEFAULT_SUBTITLE_POSITION,
  DEFAULT_SUBTITLE_LINE_MODE,
  DEFAULT_SUBTITLE_POSITION_X,
  DEFAULT_SUBTITLE_POSITION_Y,
  DEFAULT_HEADLINE_POSITION,
  DEFAULT_HEADLINE_POSITION_X,
  DEFAULT_HEADLINE_POSITION_Y,
  MIN_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_STROKE_COLOR,
  MIN_SHADOW_OFFSET,
  MAX_SHADOW_OFFSET,
  DEFAULT_SHADOW_OFFSET,
  DEFAULT_HIGHLIGHT_COLOR,
} from "@/lib/video-clip-options";
import {
  FIT_MODES,
  OVERLAY_LOGO_POSITIONS,
  DEFAULT_FIT_MODE,
  DEFAULT_OVERLAY_LOGO_POSITION,
  DEFAULT_MUSIC_VOLUME_PERCENT,
  MAX_CTA_TEXT_LENGTH,
} from "@/lib/video-clip-asset-options";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
};
const MAX_QUERY_LENGTH = 500;
const MAX_DURATION_MINUTES = Math.round(MAX_DURATION_SECONDS / 60);
const MAX_VIDEO_MB = Math.round(MAX_VIDEO_BYTES / (1024 * 1024));

function pickValidOption<T extends string>(
  raw: FormDataEntryValue | null,
  options: ReadonlyArray<{ value: T }>,
  fallback: T
): T {
  return typeof raw === "string" && options.some((o) => o.value === raw) ? (raw as T) : fallback;
}

/** Accepts either a raw 6-digit hex from the free-form color picker or one of the preset keys (incl. "none" for "no background"). */
function pickColorValue(raw: FormDataEntryValue | null, presets: ReadonlyArray<{ value: string }>, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  if (isValidHexColor(raw)) return raw.toUpperCase();
  return presets.some((p) => p.value === raw) ? raw : fallback;
}

interface Typography {
  headlineBold: boolean;
  headlineItalic: boolean;
  headlineAlign: string;
  headlineFontScale: number;
  headlinePosition: string;
  headlinePositionX: number;
  headlinePositionY: number;
  subtitleBold: boolean;
  subtitleItalic: boolean;
  subtitleUnderline: boolean;
  subtitleAlign: string;
  subtitleFontScale: number;
}

function pickFontScale(raw: FormDataEntryValue | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(n)));
}

function parseTypography(form: FormData): Typography {
  return {
    headlineBold: form.get("headlineBold") === "true",
    headlineItalic: form.get("headlineItalic") === "true",
    headlineAlign: pickValidOption(form.get("headlineAlign"), TEXT_STYLE_ALIGNMENTS, DEFAULT_TEXT_ALIGN),
    headlineFontScale: pickFontScale(form.get("headlineFontScale")),
    headlinePosition: pickValidOption(form.get("headlinePosition"), TEXT_STYLE_POSITIONS, DEFAULT_HEADLINE_POSITION),
    headlinePositionX: pickIntInRange(form.get("headlinePositionX"), 0, 100, DEFAULT_HEADLINE_POSITION_X),
    headlinePositionY: pickIntInRange(form.get("headlinePositionY"), 0, 100, DEFAULT_HEADLINE_POSITION_Y),
    subtitleBold: form.get("subtitleBold") === "true",
    subtitleItalic: form.get("subtitleItalic") === "true",
    subtitleUnderline: form.get("subtitleUnderline") === "true",
    subtitleAlign: pickValidOption(form.get("subtitleAlign"), TEXT_STYLE_ALIGNMENTS, DEFAULT_TEXT_ALIGN),
    subtitleFontScale: pickFontScale(form.get("subtitleFontScale")),
  };
}

interface CaptionStyle {
  subtitleUppercase: boolean;
  subtitleHighlightColor: string;
  subtitleStrokeColor: string;
  subtitleStrokeWidth: number;
  subtitleShadowEnabled: boolean;
  subtitleShadowOffsetX: number;
  subtitleShadowOffsetY: number;
  subtitlePosition: string;
  subtitlePositionX: number;
  subtitlePositionY: number;
  subtitleLineMode: string;
}

function pickHexColor(raw: FormDataEntryValue | null, fallback: string): string {
  return typeof raw === "string" && isValidHexColor(raw) ? raw.toUpperCase() : fallback;
}

function pickIntInRange(raw: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseCaptionStyle(form: FormData): CaptionStyle {
  return {
    subtitleUppercase: form.get("subtitleUppercase") === "true",
    subtitleHighlightColor: pickHexColor(form.get("subtitleHighlightColor"), DEFAULT_HIGHLIGHT_COLOR),
    subtitleStrokeColor: pickHexColor(form.get("subtitleStrokeColor"), DEFAULT_STROKE_COLOR),
    subtitleStrokeWidth: pickIntInRange(form.get("subtitleStrokeWidth"), MIN_STROKE_WIDTH, MAX_STROKE_WIDTH, DEFAULT_STROKE_WIDTH),
    subtitleShadowEnabled: form.get("subtitleShadowEnabled") === "true",
    subtitleShadowOffsetX: pickIntInRange(form.get("subtitleShadowOffsetX"), MIN_SHADOW_OFFSET, MAX_SHADOW_OFFSET, DEFAULT_SHADOW_OFFSET),
    subtitleShadowOffsetY: pickIntInRange(form.get("subtitleShadowOffsetY"), MIN_SHADOW_OFFSET, MAX_SHADOW_OFFSET, DEFAULT_SHADOW_OFFSET),
    subtitlePosition: pickValidOption(form.get("subtitlePosition"), TEXT_STYLE_POSITIONS, DEFAULT_SUBTITLE_POSITION),
    subtitlePositionX: pickIntInRange(form.get("subtitlePositionX"), 0, 100, DEFAULT_SUBTITLE_POSITION_X),
    subtitlePositionY: pickIntInRange(form.get("subtitlePositionY"), 0, 100, DEFAULT_SUBTITLE_POSITION_Y),
    subtitleLineMode: pickValidOption(form.get("subtitleLineMode"), SUBTITLE_LINE_MODES, DEFAULT_SUBTITLE_LINE_MODE),
  };
}

interface BrandKit {
  fitMode: string;
  smartCropEnabled: boolean;
  overlayLogoKey: string | null;
  overlayLogoPosition: string;
  overlayCtaText: string | null;
  introKey: string | null;
  outroKey: string | null;
  musicKey: string | null;
  musicVolumePercent: number;
  removeFillerWords: boolean;
  removePauses: boolean;
  autoTransitions: boolean;
}

/** Only resolves to a key if the asset exists, belongs to this user, and is the expected kind. */
async function resolveAssetKey(userId: string, assetId: string | null, kind: string): Promise<string | null> {
  if (!assetId) return null;
  const asset = await prisma.videoClipAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== userId || asset.kind !== kind) return null;
  return asset.key;
}

async function parseBrandKit(userId: string, form: FormData): Promise<BrandKit> {
  const fitMode = pickValidOption(form.get("fitMode"), FIT_MODES, DEFAULT_FIT_MODE);
  const smartCropEnabled = form.get("smartCropEnabled") === "true";
  const overlayLogoPosition = pickValidOption(
    form.get("overlayLogoPosition"),
    OVERLAY_LOGO_POSITIONS,
    DEFAULT_OVERLAY_LOGO_POSITION
  );
  const overlayCtaTextRaw = typeof form.get("overlayCtaText") === "string" ? (form.get("overlayCtaText") as string).trim() : "";
  const overlayCtaText = overlayCtaTextRaw ? overlayCtaTextRaw.slice(0, MAX_CTA_TEXT_LENGTH) : null;
  const musicVolumeRaw = Number(form.get("musicVolumePercent"));
  const musicVolumePercent = Number.isFinite(musicVolumeRaw)
    ? Math.min(100, Math.max(0, Math.round(musicVolumeRaw)))
    : DEFAULT_MUSIC_VOLUME_PERCENT;
  const removeFillerWords = form.get("removeFillerWords") === "true";
  const removePauses = form.get("removePauses") === "true";
  const autoTransitions = form.get("autoTransitions") === "true";

  const overlayLogoAssetId = typeof form.get("overlayLogoAssetId") === "string" ? (form.get("overlayLogoAssetId") as string) : null;
  const introAssetId = typeof form.get("introAssetId") === "string" ? (form.get("introAssetId") as string) : null;
  const outroAssetId = typeof form.get("outroAssetId") === "string" ? (form.get("outroAssetId") as string) : null;
  const musicAssetId = typeof form.get("musicAssetId") === "string" ? (form.get("musicAssetId") as string) : null;

  const [overlayLogoKey, introKey, outroKey, musicKey] = await Promise.all([
    resolveAssetKey(userId, overlayLogoAssetId, "LOGO"),
    resolveAssetKey(userId, introAssetId, "INTRO"),
    resolveAssetKey(userId, outroAssetId, "OUTRO"),
    resolveAssetKey(userId, musicAssetId, "MUSIC"),
  ]);

  return {
    fitMode,
    smartCropEnabled,
    overlayLogoKey,
    overlayLogoPosition,
    overlayCtaText,
    introKey,
    outroKey,
    musicKey,
    musicVolumePercent,
    removeFillerWords,
    removePauses,
    autoTransitions,
  };
}

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const batches = await prisma.videoClipBatch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      sourceLabel: true,
      momentQuery: true,
      status: true,
      analysisCreditCost: true,
      createdAt: true,
      _count: { select: { clips: true } },
    },
  });

  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id,
      sourceLabel: b.sourceLabel,
      momentQuery: b.momentQuery,
      status: b.status,
      creditCost: b.analysisCreditCost,
      clipCount: b._count.clips,
      createdAt: b.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });
  }

  const file = form.get("video");
  const youtubeUrl = typeof form.get("youtubeUrl") === "string" ? (form.get("youtubeUrl") as string).trim() : "";
  const momentQuery = typeof form.get("momentQuery") === "string" ? (form.get("momentQuery") as string).trim() : "";
  const requestedCountRaw = Number(form.get("requestedCount"));
  const requestedCount = Number.isFinite(requestedCountRaw)
    ? Math.min(MAX_CLIP_COUNT, Math.max(MIN_CLIP_COUNT, Math.round(requestedCountRaw)))
    : DEFAULT_CLIP_COUNT;
  const aspectRatioRaw = typeof form.get("aspectRatio") === "string" ? (form.get("aspectRatio") as string) : "";
  const aspectRatio = ASPECT_RATIOS.some((a) => a.value === aspectRatioRaw) ? aspectRatioRaw : "original";
  const headlineEnabled = form.get("headlineEnabled") === "true";
  const subtitleEnabled = form.get("subtitleEnabled") === "true";
  const socialCaptionEnabled = form.get("socialCaptionEnabled") === "true";
  const effectPresetRaw = typeof form.get("effectPreset") === "string" ? (form.get("effectPreset") as string) : "";
  const effectPreset = EFFECT_PRESETS.some((e) => e.value === effectPresetRaw) ? effectPresetRaw : null;

  const headlineFont = pickValidOption(form.get("headlineFont"), TEXT_STYLE_FONTS, DEFAULT_TEXT_FONT);
  const headlineColor = pickColorValue(form.get("headlineColor"), TEXT_STYLE_COLORS, DEFAULT_TEXT_COLOR);
  const headlineBackground = pickColorValue(form.get("headlineBackground"), TEXT_STYLE_BACKGROUNDS, DEFAULT_TEXT_BACKGROUND);
  const subtitleFont = pickValidOption(form.get("subtitleFont"), TEXT_STYLE_FONTS, DEFAULT_TEXT_FONT);
  const subtitleColor = pickColorValue(form.get("subtitleColor"), TEXT_STYLE_COLORS, DEFAULT_TEXT_COLOR);
  const subtitleBackground = pickColorValue(form.get("subtitleBackground"), TEXT_STYLE_BACKGROUNDS, DEFAULT_TEXT_BACKGROUND);
  const headlineAnimation = pickValidOption(form.get("headlineAnimation"), TEXT_STYLE_ANIMATIONS, DEFAULT_TEXT_ANIMATION);
  const subtitleAnimation = pickValidOption(form.get("subtitleAnimation"), TEXT_STYLE_ANIMATIONS, DEFAULT_TEXT_ANIMATION);

  const hasUpload = file instanceof File && file.size > 0;
  const hasYoutubeUrl = youtubeUrl.length > 0;

  if (!hasUpload && !hasYoutubeUrl) {
    return NextResponse.json({ error: "Unggah video atau masukkan link YouTube." }, { status: 400 });
  }
  if (hasUpload && !ALLOWED_VIDEO_TYPES.has((file as File).type)) {
    return NextResponse.json({ error: "Video harus berformat MP4, WEBM, atau MOV." }, { status: 400 });
  }
  if (hasUpload && (file as File).size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: `Ukuran video maksimal ${MAX_VIDEO_MB}MB.` }, { status: 400 });
  }
  if (hasYoutubeUrl && !isYoutubeUrl(youtubeUrl)) {
    return NextResponse.json({ error: "Link YouTube tidak valid." }, { status: 400 });
  }
  if (!momentQuery) {
    return NextResponse.json({ error: "Jelaskan momen yang ingin dicari." }, { status: 400 });
  }
  if (momentQuery.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Deskripsi momen maksimal ${MAX_QUERY_LENGTH} karakter.` }, { status: 400 });
  }

  try {
    const brandKit = await parseBrandKit(session.user.id, form);
    const typography = parseTypography(form);
    const captionStyle = parseCaptionStyle(form);

    if (hasYoutubeUrl) {
      return await handleYoutubeSubmit({
        userId: session.user.id,
        youtubeUrl,
        momentQuery,
        requestedCount,
        aspectRatio,
        headlineEnabled,
        headlineFont,
        headlineColor,
        headlineBackground,
        headlineAnimation,
        subtitleEnabled,
        subtitleFont,
        subtitleColor,
        subtitleBackground,
        subtitleAnimation,
        effectPreset,
        socialCaptionEnabled,
        brandKit,
        typography,
        captionStyle,
      });
    }

    return await handleUploadSubmit({
      userId: session.user.id,
      file: file as File,
      momentQuery,
      requestedCount,
      aspectRatio,
      headlineEnabled,
      headlineFont,
      headlineColor,
      headlineBackground,
      headlineAnimation,
      subtitleEnabled,
      subtitleFont,
      subtitleColor,
      subtitleBackground,
      subtitleAnimation,
      effectPreset,
      socialCaptionEnabled,
      brandKit,
      typography,
      captionStyle,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsufficientCreditError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("Video clip analysis submission failed:", err);
    return NextResponse.json({ error: "Gagal memulai analisis video. Coba lagi." }, { status: 502 });
  }
}

interface SubmitOptions {
  userId: string;
  momentQuery: string;
  requestedCount: number;
  aspectRatio: string;
  headlineEnabled: boolean;
  headlineFont: string;
  headlineColor: string;
  headlineBackground: string;
  headlineAnimation: string;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitleColor: string;
  subtitleBackground: string;
  subtitleAnimation: string;
  effectPreset: string | null;
  socialCaptionEnabled: boolean;
  brandKit: BrandKit;
  typography: Typography;
  captionStyle: CaptionStyle;
}

/**
 * The video bytes are already local (part of the multipart body) — probing,
 * uploading to R2, and charging all happen inline before responding, same as
 * every other upload-based tool in this app.
 */
async function handleUploadSubmit(options: SubmitOptions & { file: File }) {
  const {
    userId,
    file,
    momentQuery,
    requestedCount,
    aspectRatio,
    headlineEnabled,
    headlineFont,
    headlineColor,
    headlineBackground,
    headlineAnimation,
    subtitleEnabled,
    subtitleFont,
    subtitleColor,
    subtitleBackground,
    subtitleAnimation,
    effectPreset,
    socialCaptionEnabled,
    brandKit,
    typography,
    captionStyle,
  } = options;

  const tempDir = await mkdtemp(path.join(tmpdir(), "videoclip-upload-"));
  try {
    const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
    const localPath = path.join(tempDir, `source.${ext}`);
    await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

    let durationSeconds: number;
    try {
      const meta = await probeMetadata(localPath);
      durationSeconds = meta.durationSeconds;
    } catch (probeErr) {
      console.error("Video clip probeMetadata failed:", probeErr);
      return NextResponse.json({ error: "Gagal membaca video. Pastikan file tidak rusak." }, { status: 400 });
    }

    if (durationSeconds < MIN_DURATION_SECONDS) {
      return NextResponse.json(
        { error: `Video terlalu pendek. Minimal ${MIN_DURATION_SECONDS} detik agar bisa dibuatkan klip.` },
        { status: 400 }
      );
    }
    if (durationSeconds > MAX_DURATION_SECONDS) {
      return NextResponse.json({ error: `Durasi video maksimal ${MAX_DURATION_MINUTES} menit.` }, { status: 400 });
    }

    const buffer = await readFile(localPath);
    const contentType = CONTENT_TYPE_BY_EXT[ext] ?? "video/mp4";
    const key = `video-clips/${userId}/sources/${randomUUID()}.${ext}`;
    await uploadToR2(buffer, key, contentType);

    const cost = roundCreditCost(
      (await getProviderCost("openai-whisper")) * durationSeconds + (await getProviderCost("openai-text"))
    );

    await ensureDbConnection();
    const result = await reserveCreditsForVideoClipBatch({
      userId,
      sourceLabel: file.name || "video",
      sourceVideoKey: key,
      momentQuery,
      requestedCount,
      aspectRatio,
      headlineEnabled,
      headlineFont,
      headlineColor,
      headlineBackground,
      headlineAnimation,
      subtitleEnabled,
      subtitleFont,
      subtitleColor,
      subtitleBackground,
      subtitleAnimation,
      effectPreset,
      socialCaptionEnabled,
      brandKit,
      typography,
      captionStyle,
      durationSeconds: Math.round(durationSeconds),
      cost,
    });

    videoClipManager.enqueueAnalysis(result.batch.id);

    return NextResponse.json({ batchId: result.batch.id, creditBalance: result.creditBalance });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Only fetches metadata here (fast) — the actual download can take a while
 * for a longer video, so it's charged immediately against the known duration
 * and handed to the background worker instead of blocking this request
 * (which would otherwise risk a reverse-proxy timeout on a long video).
 */
async function handleYoutubeSubmit(options: SubmitOptions & { youtubeUrl: string }) {
  const {
    userId,
    youtubeUrl,
    momentQuery,
    requestedCount,
    aspectRatio,
    headlineEnabled,
    headlineFont,
    headlineColor,
    headlineBackground,
    headlineAnimation,
    subtitleEnabled,
    subtitleFont,
    subtitleColor,
    subtitleBackground,
    subtitleAnimation,
    effectPreset,
    socialCaptionEnabled,
    brandKit,
    typography,
    captionStyle,
  } = options;

  let info;
  try {
    info = await getYoutubeInfo(youtubeUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal membaca video YouTube." },
      { status: 400 }
    );
  }

  if (info.durationSeconds < MIN_DURATION_SECONDS) {
    return NextResponse.json(
      { error: `Video terlalu pendek. Minimal ${MIN_DURATION_SECONDS} detik agar bisa dibuatkan klip.` },
      { status: 400 }
    );
  }
  if (info.durationSeconds > MAX_DURATION_SECONDS) {
    return NextResponse.json({ error: `Durasi video maksimal ${MAX_DURATION_MINUTES} menit.` }, { status: 400 });
  }

  const cost = roundCreditCost(
    (await getProviderCost("openai-whisper")) * info.durationSeconds + (await getProviderCost("openai-text"))
  );

  await ensureDbConnection();
  const result = await reserveCreditsForVideoClipBatch({
    userId,
    sourceLabel: info.title,
    sourceVideoKey: null,
    momentQuery,
    requestedCount,
    aspectRatio,
    headlineEnabled,
    headlineFont,
    headlineColor,
    headlineBackground,
    headlineAnimation,
    subtitleEnabled,
    subtitleFont,
    subtitleColor,
    subtitleBackground,
    subtitleAnimation,
    effectPreset,
    socialCaptionEnabled,
    brandKit,
    typography,
    captionStyle,
    durationSeconds: Math.round(info.durationSeconds),
    cost,
  });

  videoClipManager.enqueueYoutubeAcquisition(result.batch.id, youtubeUrl);

  return NextResponse.json({ batchId: result.batch.id, creditBalance: result.creditBalance });
}

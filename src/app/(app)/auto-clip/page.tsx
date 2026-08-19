"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { motion, type TargetAndTransition, type Transition } from "framer-motion";
import {
  Scissors,
  Upload,
  X,
  Download,
  Sparkles,
  Check,
  Link as LinkIcon,
  Crop,
  Captions,
  Type,
  ImagePlus,
  Film,
  Music,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  CopyCheck,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { ImageGenerationLoader } from "@/components/ui/ImageGenerationLoader";
import { ToolLayout } from "@/components/ui/ToolLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { AssetPicker } from "@/components/ui/AssetPicker";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { HistoryTable, type HistoryStatus } from "@/components/history/HistoryTable";
import { useCreditReminder } from "@/components/layout/CreditReminderProvider";
import { useCreditCosts } from "@/lib/use-credit-costs";
import { usePagination } from "@/lib/use-pagination";
import { cn } from "@/lib/utils";
import {
  ASPECT_RATIOS,
  EFFECT_PRESETS,
  MAX_CLIP_COUNT,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  MAX_VIDEO_BYTES,
  TEXT_STYLE_FONTS,
  TEXT_STYLE_COLORS,
  TEXT_STYLE_BACKGROUNDS,
  TEXT_STYLE_ANIMATIONS,
  TEXT_STYLE_PRESETS,
  TEXT_STYLE_ALIGNMENTS,
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_COLOR,
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
  WORDS_PER_LINE,
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
  DEFAULT_SMART_CROP_ENABLED,
  DEFAULT_OVERLAY_LOGO_POSITION,
  DEFAULT_MUSIC_VOLUME_PERCENT,
  MAX_CTA_TEXT_LENGTH,
} from "@/lib/video-clip-asset-options";

const MIN_DURATION_LABEL = `${Math.round(MIN_DURATION_SECONDS / 60) || 1} menit`;
const MAX_DURATION_LABEL = `${Math.round(MAX_DURATION_SECONDS / 60)} menit`;
const MAX_VIDEO_MB_LABEL = `${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB`;

type BatchStatus = "PENDING" | "TRANSCRIBING" | "FINDING_MOMENTS" | "MOMENTS_FOUND" | "FAILED";
type ClipStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface Moment {
  index: number;
  start: number;
  end: number;
  label: string;
  snippet: string;
}

interface Clip {
  id: string;
  title: string;
  status: ClipStatus;
  content: string | null;
  socialCaption: string | null;
  errorMessage: string | null;
  creditCost: number;
  createdAt: string;
}

interface BatchDetail {
  id: string;
  sourceLabel: string;
  momentQuery: string;
  requestedCount: number;
  aspectRatio: string;
  headlineEnabled: boolean;
  subtitleEnabled: boolean;
  effectPreset: string | null;
  durationSeconds: number;
  status: BatchStatus;
  moments: Moment[] | null;
  analysisCreditCost: number;
  errorMessage: string | null;
  createdAt: string;
  clips: Clip[];
}

interface HistoryItem {
  id: string;
  sourceLabel: string;
  momentQuery: string;
  status: BatchStatus;
  creditCost: number;
  clipCount: number;
  createdAt: string;
}

const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  PENDING: "Menyiapkan video...",
  TRANSCRIBING: "Mentranskrip video...",
  FINDING_MOMENTS: "Mencari momen yang cocok...",
  MOMENTS_FOUND: "Momen ditemukan",
  FAILED: "Gagal",
};

// Maps this tool's own richer batch-workflow states down to the same 4
// generic statuses every other history table uses, so the Status column
// looks identical everywhere — the detailed BATCH_STATUS_LABEL text above is
// still used elsewhere (e.g. the in-progress analysis view), just not here.
const BATCH_TO_HISTORY_STATUS: Record<BatchStatus, HistoryStatus> = {
  PENDING: "PENDING",
  TRANSCRIBING: "PROCESSING",
  FINDING_MOMENTS: "PROCESSING",
  MOMENTS_FOUND: "COMPLETED",
  FAILED: "FAILED",
};

const CLIP_STATUS_BADGE: Record<ClipStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

function isBatchAnalyzing(status: BatchStatus) {
  return status === "PENDING" || status === "TRANSCRIBING" || status === "FINDING_MOMENTS";
}

function isClipPending(status: ClipStatus) {
  return status === "PENDING" || status === "PROCESSING";
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STORAGE_KEY = "marketingai:lastAutoClipBatchId";
// Persists the Layout/Auto Headline/Caption/Overlay/Intro-Outro/Musik settings
// panels only — not per-clip fields like the source video, moment query, or
// clip count — so returning users don't have to re-configure their preferred
// style every time they make a new clip.
const SETTINGS_STORAGE_KEY = "marketingai:autoClipSettings";

interface PersistedAutoClipSettings {
  aspectRatio: string;
  fitMode: string;
  smartCropEnabled: boolean;
  effectPreset: string;
  headlineEnabled: boolean;
  headlineFont: string;
  headlineColor: string;
  headlineBackground: string;
  headlineAnimation: string;
  headlineBold: boolean;
  headlineItalic: boolean;
  headlineAlign: string;
  headlineFontScale: number;
  headlinePosition: string;
  headlinePositionX: number;
  headlinePositionY: number;
  subtitleEnabled: boolean;
  subtitleFont: string;
  subtitleColor: string;
  subtitleBackground: string;
  subtitleAnimation: string;
  subtitleBold: boolean;
  subtitleItalic: boolean;
  subtitleUnderline: boolean;
  subtitleAlign: string;
  subtitleFontScale: number;
  subtitleUppercase: boolean;
  subtitleStrokeColor: string;
  subtitleStrokeWidth: number;
  subtitleShadowEnabled: boolean;
  subtitleShadowOffsetX: number;
  subtitleShadowOffsetY: number;
  subtitlePosition: string;
  subtitlePositionX: number;
  subtitlePositionY: number;
  subtitleLineMode: string;
  subtitleHighlightColor: string;
  overlayLogoAssetId: string | null;
  overlayLogoPosition: string;
  overlayCtaText: string;
  introAssetId: string | null;
  outroAssetId: string | null;
  musicAssetId: string | null;
  musicVolumePercent: number;
  removeFillerWords: boolean;
  removePauses: boolean;
  autoTransitions: boolean;
  socialCaptionEnabled: boolean;
}

const ANALYSIS_LOADING_MESSAGES = [
  "Mengunduh dan membaca video...",
  "Mentranskrip percakapan...",
  "Menganalisis momen yang relevan...",
  "Menyusun hasil...",
];

function getFontCssFamily(value: string): string {
  return TEXT_STYLE_FONTS.find((f) => f.value === value)?.cssFamily ?? TEXT_STYLE_FONTS[0].cssFamily;
}

// YouTube video IDs are always exactly 11 URL-safe-base64 characters —
// matching that length keeps this from over-capturing trailing query params
// (e.g. "&t=30s") that a looser pattern might pull in.
const YOUTUBE_VIDEO_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function extractYoutubeVideoId(url: string): string | null {
  return url.trim().match(YOUTUBE_VIDEO_ID_PATTERN)?.[1] ?? null;
}

/** Accepts either a raw hex (custom-picked) or a legacy preset key — mirrors resolveColorHex in ffmpeg.ts. */
function resolveDisplayColor(value: string): string {
  if (isValidHexColor(value)) return value.toUpperCase();
  return TEXT_STYLE_COLORS.find((c) => c.value === value)?.hex ?? "FFFFFF";
}

/** null = "Tanpa Latar" — mirrors resolveBackgroundHex in ffmpeg.ts. */
function resolveDisplayBackground(value: string): string | null {
  if (isValidHexColor(value)) return value.toUpperCase();
  return TEXT_STYLE_BACKGROUNDS.find((b) => b.value === value)?.hex ?? null;
}

// Looping framer-motion keyframe presets for the tiny style-preview card,
// mirroring the entrance-animation names in TEXT_STYLE_ANIMATIONS so the
// chosen style is visible without the user having to trigger anything.
// "karaoke" isn't here — it needs per-word timing (see KaraokePreviewText)
// — and "none" simply renders with no motion wrapper at all.
const PREVIEW_TEXT_ANIMATIONS: Partial<
  Record<string, { animate: TargetAndTransition; transition: Transition }>
> = {
  fade: {
    animate: { opacity: [0, 1, 1, 0] },
    transition: { duration: 2, times: [0, 0.35, 0.8, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" },
  },
  pop: {
    animate: { opacity: [0, 1, 1, 1, 0], scale: [0.6, 1.08, 1, 1, 0.6] },
    transition: { duration: 2, times: [0, 0.25, 0.4, 0.85, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" },
  },
  blur: {
    animate: { opacity: [0, 1, 1, 0], filter: ["blur(6px)", "blur(0px)", "blur(0px)", "blur(6px)"] },
    transition: { duration: 2, times: [0, 0.35, 0.8, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" },
  },
  typewriter: {
    animate: { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 100% 0 0)"] },
    transition: { duration: 2.2, times: [0, 0.55, 0.85, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" },
  },
  slide_up: {
    animate: { opacity: [0, 1, 1, 0], y: [10, 0, 0, 10] },
    transition: { duration: 2, times: [0, 0.35, 0.8, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" },
  },
  bounce: {
    animate: { opacity: [0, 1, 1, 1, 1, 0], y: [14, -5, 2, 0, 0, 14] },
    transition: { duration: 2.2, times: [0, 0.3, 0.45, 0.6, 0.85, 1], repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" },
  },
};

// Only zoom_punch/zoom_out are actual motion in the real render (cutClip's
// zoompan filter) — the other presets are static color grades, approximated
// below via PREVIEW_EFFECT_FILTER instead of a scale animation.
const PREVIEW_ZOOM_ANIMATIONS: Partial<
  Record<string, { animate: TargetAndTransition; transition: Transition }>
> = {
  zoom_punch: {
    animate: { scale: [1, 1.15, 1.15, 1] },
    transition: { duration: 3, times: [0, 0.85, 0.95, 1], repeat: Infinity, ease: "easeInOut" },
  },
  zoom_out: {
    animate: { scale: [1.15, 1, 1, 1.15] },
    transition: { duration: 3, times: [0, 0.85, 0.95, 1], repeat: Infinity, ease: "easeInOut" },
  },
};

// Long enough (2×WORDS_PER_LINE) to demonstrate both "1 Baris" (first
// WORDS_PER_LINE words) and "2 Baris" (all of them, split across two lines)
// in the style preview.
const SUBTITLE_PREVIEW_WORDS = ["Ini", "contoh", "teks", "subtitle", "otomatis", "kamu"];

// Above this, the caption card shows a clamped preview + "Lihat selengkapnya"
// instead of the full text — keeps every result card the same height
// regardless of how long an individual AI-generated caption turns out.
const CAPTION_PREVIEW_MAX_LENGTH = 140;

// CSS approximations of cutClip's static `eq`/`vignette` ffmpeg filters for
// the color-grade effect presets — close enough for a 144px-wide thumbnail,
// not meant to byte-for-byte match the real render.
const PREVIEW_EFFECT_FILTER: Record<string, string> = {
  cinematic_grade: "contrast(1.15) saturate(1.25) brightness(1.02)",
  vintage_warm: "contrast(1.05) saturate(0.85) brightness(1.02) sepia(0.18)",
  black_white: "grayscale(1) contrast(1.05)",
  vivid_pop: "contrast(1.12) saturate(1.35) brightness(1.02)",
};

/**
 * Renders the karaoke word-highlight animation in the style preview — cycles
 * the highlight color word-by-word, looping. `lineBreakAfterIndex` mirrors
 * buildKaraokeAss's forced-break behavior for "2 Baris" mode: a <br/> at that
 * word index instead of a plain space.
 */
function KaraokePreviewText({
  words,
  baseColorHex,
  highlightHex,
  lineBreakAfterIndex,
  className,
  style,
}: {
  words: string[];
  baseColorHex: string;
  highlightHex: string;
  lineBreakAfterIndex?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const step = 0.55;
  const nodes: ReactNode[] = [];
  words.forEach((word, i) => {
    nodes.push(
      <motion.span
        key={`w-${i}`}
        style={{ display: "inline-block" }}
        // Mirrors the real render's per-word ASS override tag exactly
        // (`\c...\b1\fscx112\fscy112` in buildKaraokeAss) — the active word
        // scales up 12% and bolds, not just changes color, so this preview
        // doesn't undersell what actually ends up in the exported clip.
        animate={{
          color: [`#${baseColorHex}`, `#${highlightHex}`, `#${baseColorHex}`],
          scale: [1, 1.12, 1],
          fontWeight: [400, 700, 400],
        }}
        transition={{
          duration: step,
          repeat: Infinity,
          repeatDelay: Math.max(0, (words.length - 1) * step),
          delay: i * step,
          ease: "easeInOut",
        }}
      >
        {word}
      </motion.span>
    );
    if (i < words.length - 1) {
      nodes.push(i === lineBreakAfterIndex ? <br key={`br-${i}`} /> : " ");
    }
  });
  return (
    <span className={className} style={style}>
      {nodes}
    </span>
  );
}

/**
 * CSS equivalent of ffmpeg.ts's computeAlignment/computeRestPosition
 * (subtitle) / computeHeadlineBasePosition (headline) for the style preview —
 * "custom" anchors around the exact X/Y percent point (matching ASS
 * alignment 5 / center-anchor used for custom in the real render), the
 * others anchor to a screen edge/row. `autoPosition` is what "auto" resolves
 * to for this text type — bottom for subtitle, top for headline, mirroring
 * each one's real-render default.
 */
function getTextPreviewPositionStyle(
  position: string,
  positionX: number,
  positionY: number,
  align: string,
  autoPosition: "top" | "bottom"
): CSSProperties {
  const justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  if (position === "custom") {
    return {
      position: "absolute",
      left: `${positionX}%`,
      top: `${positionY}%`,
      transform: "translate(-50%, -50%)",
      display: "flex",
      justifyContent,
      width: "calc(100% - 16px)",
    };
  }
  const resolved = position === "auto" ? autoPosition : position;
  if (resolved === "top") {
    return { position: "absolute", top: 8, left: 8, right: 8, display: "flex", justifyContent };
  }
  if (resolved === "middle") {
    return { position: "absolute", top: "50%", left: 8, right: 8, transform: "translateY(-50%)", display: "flex", justifyContent };
  }
  // "bottom"
  return { position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", justifyContent };
}

const selectClass =
  "h-9 min-w-0 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";
const fieldSelectClass =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

interface TextStyleEditorProps {
  context: "headline" | "subtitle";
  font: string;
  onFontChange: (value: string) => void;
  color: string;
  onColorChange: (value: string) => void;
  background: string;
  onBackgroundChange: (value: string) => void;
  animation: string;
  onAnimationChange: (value: string) => void;
  bold: boolean;
  onBoldChange: (value: boolean) => void;
  italic: boolean;
  onItalicChange: (value: boolean) => void;
  underline: boolean;
  onUnderlineChange: (value: boolean) => void;
  align: string;
  onAlignChange: (value: string) => void;
  fontScale: number;
  onFontScaleChange: (value: number) => void;
  // Subtitle-only (per user decision — Auto Headline keeps its current, simpler styling).
  uppercase: boolean;
  onUppercaseChange: (value: boolean) => void;
  strokeColor: string;
  onStrokeColorChange: (value: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (value: number) => void;
  shadowEnabled: boolean;
  onShadowEnabledChange: (value: boolean) => void;
  shadowOffsetX: number;
  onShadowOffsetXChange: (value: number) => void;
  shadowOffsetY: number;
  onShadowOffsetYChange: (value: number) => void;
  position: string;
  onPositionChange: (value: string) => void;
  positionX: number;
  onPositionXChange: (value: number) => void;
  positionY: number;
  onPositionYChange: (value: number) => void;
  lineMode: string;
  onLineModeChange: (value: string) => void;
  highlightColor: string;
  onHighlightColorChange: (value: string) => void;
}

function TextStyleEditor(props: TextStyleEditorProps) {
  const {
    context, font, onFontChange, color, onColorChange, background, onBackgroundChange,
    animation, onAnimationChange, bold, onBoldChange, italic, onItalicChange,
    underline, onUnderlineChange, align, onAlignChange, fontScale, onFontScaleChange,
    uppercase, onUppercaseChange, strokeColor, onStrokeColorChange, strokeWidth, onStrokeWidthChange,
    shadowEnabled, onShadowEnabledChange, shadowOffsetX, onShadowOffsetXChange, shadowOffsetY, onShadowOffsetYChange,
    position, onPositionChange, positionX, onPositionXChange, positionY, onPositionYChange,
    lineMode, onLineModeChange, highlightColor, onHighlightColorChange,
  } = props;
  const [tab, setTab] = useState("presets");
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  const fontConfig = TEXT_STYLE_FONTS.find((f) => f.value === font) ?? TEXT_STYLE_FONTS[0];
  const animationOptions = TEXT_STYLE_ANIMATIONS.filter((a) => context === "subtitle" || a.supportsHeadline);
  // Same headline/subtitle animation restriction as the dropdown above —
  // without this, a karaoke/blur preset (subtitle-only) would silently set
  // an animation the headline's drawtext renderer doesn't know how to play.
  const presetOptions = TEXT_STYLE_PRESETS.filter((p) => {
    if (!animationOptions.some((a) => a.value === p.animation)) return false;
    // Headline ignores every preset's animation (see the click handler
    // below), so a preset whose animation was its only differentiator from
    // another preset becomes a visually identical duplicate there — "Ketik
    // Hidup" (typewriter) is indistinguishable from "Minimalis" (fade) once
    // animation drops out of the picture (same font/color/background/bold/
    // uppercase). Hidden for headline only; still a real, useful preset for
    // subtitle, where its animation actually plays.
    if (context === "headline" && p.value === "typewriter_clean") return false;
    return true;
  });
  const activePreset = presetOptions.find(
    (p) =>
      p.font === font &&
      resolveDisplayColor(p.color) === resolveDisplayColor(color) &&
      resolveDisplayBackground(p.background) === resolveDisplayBackground(background) &&
      // Headline presets no longer touch animation at all (see the preset
      // click handler below) — ignore it here too, or a headline preset
      // whose own `animation` field isn't "none" would never show as active.
      (context !== "subtitle" || p.animation === animation) &&
      p.bold === bold &&
      // Headline has no uppercase toggle at all (hardcoded false/no-op above
      // this component, per prior design decision) — ignore it there so a
      // headline preset with uppercase:true can still show as active.
      (context !== "subtitle" || p.uppercase === uppercase)
  );
  const bgHexCurrent = resolveDisplayBackground(background);
  const hasBackground = bgHexCurrent !== null;
  const showFormattingRow = fontConfig.supportsBoldItalic || context === "subtitle";

  // Headline: no standalone "Effects" tab — per explicit decision, a
  // headline doesn't need manual animation control (presets still set
  // headlineAnimation under the hood, this just removes the dropdown), and
  // its Posisi control moves into the Font tab instead. Subtitle keeps both
  // unchanged.
  const positionBlock = (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted">Posisi</label>
      <div className="grid grid-cols-5 gap-1.5">
        {TEXT_STYLE_POSITIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPositionChange(p.value)}
            className={cn(
              "rounded-lg border py-1.5 text-[11px] font-medium",
              position === p.value ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {position === "custom" && (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Posisi X ({positionX}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              value={positionX}
              onChange={(e) => onPositionXChange(Number(e.target.value))}
              className="accent-brand"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Posisi Y ({positionY}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              value={positionY}
              onChange={(e) => onPositionYChange(Number(e.target.value))}
              className="accent-brand"
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        items={
          context === "headline"
            ? [
                { id: "presets", label: "Presets" },
                { id: "font", label: "Font" },
              ]
            : [
                { id: "presets", label: "Presets" },
                { id: "font", label: "Font" },
                { id: "effects", label: "Effects" },
              ]
        }
        value={tab}
        onChange={setTab}
        layoutId={`text-style-tabs-${context}`}
      />

      {tab === "presets" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {presetOptions.map((preset) => {
            const isActive = activePreset?.value === preset.value;
            const presetBgHex = resolveDisplayBackground(preset.background);
            const isHovered = hoveredPreset === preset.value;
            const baseHex = resolveDisplayColor(preset.color);
            // Split box from text: the coloured/bordered box is a plain static
            // wrapper, the animated motion.span inside carries only font/text
            // styling — animating scale/etc. on an element that ALSO owns the
            // background made the whole box visibly stretch/shrink on hover,
            // when only the text itself should move.
            const boxStyle: CSSProperties = {
              backgroundColor: presetBgHex ? `#${presetBgHex}` : "transparent",
              border: presetBgHex ? "none" : "1px dashed rgba(255,255,255,.25)",
            };
            const textStyle: CSSProperties = {
              fontFamily: getFontCssFamily(preset.font),
              color: `#${baseHex}`,
              fontWeight: preset.bold ? 700 : 400,
              textTransform: preset.uppercase ? "uppercase" : "none",
            };
            const sampleText = context === "subtitle" ? "Ini Contoh Subtitle" : "Ini Contoh Headline";
            const sampleWords = sampleText.split(" ");
            // Headline never applies a preset's animation (see the click
            // handler below) — previewing one on hover here would show an
            // effect that clicking the card can't actually produce, so the
            // hover preview is subtitle-only too, for the same reason.
            const hoverAnim = context === "subtitle" ? PREVIEW_TEXT_ANIMATIONS[preset.animation] : undefined;
            // Explicit "at rest" target (all properties any hoverAnim might
            // touch, reset to neutral) rather than an undefined animate prop —
            // otherwise framer-motion leaves the span frozen mid-animation
            // (e.g. mid-fade or scaled up) the instant the mouse leaves instead
            // of easing back to normal.
            const restAnimate = { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", clipPath: "inset(0 0% 0 0)", color: `#${baseHex}` };
            const previewAnimate = isHovered && hoverAnim ? hoverAnim.animate : restAnimate;
            const previewTransition = isHovered && hoverAnim ? hoverAnim.transition : { duration: 0.2 };
            return (
              <button
                key={preset.value}
                type="button"
                onMouseEnter={() => setHoveredPreset(preset.value)}
                onMouseLeave={() => setHoveredPreset(null)}
                onClick={() => {
                  onFontChange(preset.font);
                  onColorChange(resolveDisplayColor(preset.color));
                  onBackgroundChange(presetBgHex ?? "none");
                  // Headline never gets animation from a preset — it has no
                  // animation control at all anymore (per explicit decision),
                  // so applying one here would silently set a value the user
                  // can no longer see or change.
                  if (context === "subtitle") onAnimationChange(preset.animation);
                  onBoldChange(preset.bold);
                  onUppercaseChange(preset.uppercase);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
                  isActive ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong"
                )}
              >
                <span
                  className="flex min-h-11 w-full items-center justify-center overflow-hidden rounded px-1.5 py-1"
                  style={boxStyle}
                >
                  {isHovered && context === "subtitle" && preset.animation === "karaoke" ? (
                    // Real per-word highlight (same component as the main
                    // preview panel), not the generic whole-phrase pulse below
                    // — karaoke's whole identity IS the word-by-word cycling,
                    // so this preset needs the genuine thing to demo it at all.
                    <KaraokePreviewText
                      words={sampleWords}
                      baseColorHex={baseHex}
                      highlightHex={DEFAULT_HIGHLIGHT_COLOR}
                      className="text-center text-[9px] leading-tight"
                      style={textStyle}
                    />
                  ) : (
                    <motion.span
                      className="text-center text-[9px] leading-tight"
                      style={textStyle}
                      animate={previewAnimate}
                      transition={previewTransition}
                    >
                      {sampleText}
                    </motion.span>
                  )}
                </span>
                <span className="text-center text-[10px] leading-tight text-muted">{preset.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "font" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Font</label>
            <select value={font} onChange={(e) => onFontChange(e.target.value)} className={selectClass}>
              {TEXT_STYLE_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {showFormattingRow && (
            <div className="flex gap-2">
              {fontConfig.supportsBoldItalic && (
                <>
                  <button
                    type="button"
                    onClick={() => onBoldChange(!bold)}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium",
                      bold ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
                    )}
                  >
                    <Bold className="h-3.5 w-3.5" />
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => onItalicChange(!italic)}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium",
                      italic ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
                    )}
                  >
                    <Italic className="h-3.5 w-3.5" />
                    Italic
                  </button>
                </>
              )}
              {context === "subtitle" && (
                <button
                  type="button"
                  onClick={() => onUnderlineChange(!underline)}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium",
                    underline ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
                  )}
                >
                  <Underline className="h-3.5 w-3.5" />
                  Underline
                </button>
              )}
            </div>
          )}
          {!fontConfig.supportsBoldItalic && context === "headline" && (
            <p className="text-[10px] text-muted">Font ini hanya punya satu ketebalan (Bold/Italic tidak tersedia).</p>
          )}

          {context === "subtitle" && (
            <>
              <Switch checked={uppercase} onChange={onUppercaseChange} label="Uppercase" description="Otomatis huruf besar semua" />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted">Warna Stroke</label>
                  <input
                    type="color"
                    value={`#${strokeColor}`}
                    onChange={(e) => onStrokeColorChange(e.target.value.slice(1).toUpperCase())}
                    className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted">Ketebalan Stroke ({strokeWidth}px)</label>
                  <input
                    type="range"
                    min={MIN_STROKE_WIDTH}
                    max={MAX_STROKE_WIDTH}
                    value={strokeWidth}
                    onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                    className="accent-brand"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Ukuran Font ({fontScale}%)</label>
            <input
              type="range"
              min={MIN_FONT_SCALE}
              max={MAX_FONT_SCALE}
              value={fontScale}
              onChange={(e) => onFontScaleChange(Number(e.target.value))}
              className="accent-brand"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Perataan</label>
            <div className="flex gap-2">
              {TEXT_STYLE_ALIGNMENTS.map((a) => {
                const Icon = ALIGN_ICON[a.value];
                const isActive = align === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => onAlignChange(a.value)}
                    aria-label={a.label}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center rounded-lg border",
                      isActive ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Warna Teks</label>
              <input
                type="color"
                value={`#${resolveDisplayColor(color)}`}
                onChange={(e) => onColorChange(e.target.value.slice(1).toUpperCase())}
                className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Latar Belakang</label>
              <input
                type="color"
                disabled={!hasBackground}
                value={`#${bgHexCurrent ?? "000000"}`}
                onChange={(e) => onBackgroundChange(e.target.value.slice(1).toUpperCase())}
                className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={!hasBackground}
                  onChange={(e) => onBackgroundChange(e.target.checked ? "none" : (bgHexCurrent ?? "000000"))}
                  className="h-3 w-3 rounded border-border"
                />
                Tanpa latar
              </label>
            </div>
          </div>

          {context === "headline" && positionBlock}
        </div>
      )}

      {tab === "effects" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Animasi</label>
            <select value={animation} onChange={(e) => onAnimationChange(e.target.value)} className={selectClass}>
              {animationOptions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {positionBlock}

          {context === "subtitle" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted">Mode Baris</label>
                <div className="flex gap-2">
                  {SUBTITLE_LINE_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => onLineModeChange(m.value)}
                      className={cn(
                        "flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-medium",
                        lineMode === m.value ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <Switch
                checked={shadowEnabled}
                onChange={onShadowEnabledChange}
                label="Bayangan (Shadow)"
                description="Warna bayangan ikut warna stroke"
              />
              {shadowEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted">Offset X ({shadowOffsetX}px)</label>
                    <input
                      type="range"
                      min={MIN_SHADOW_OFFSET}
                      max={MAX_SHADOW_OFFSET}
                      value={shadowOffsetX}
                      onChange={(e) => onShadowOffsetXChange(Number(e.target.value))}
                      className="accent-brand"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted">Offset Y ({shadowOffsetY}px)</label>
                    <input
                      type="range"
                      min={MIN_SHADOW_OFFSET}
                      max={MAX_SHADOW_OFFSET}
                      value={shadowOffsetY}
                      onChange={(e) => onShadowOffsetYChange(Number(e.target.value))}
                      className="accent-brand"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted">Warna Highlight Kata</label>
                <input
                  type="color"
                  value={`#${highlightColor}`}
                  onChange={(e) => onHighlightColorChange(e.target.value.slice(1).toUpperCase())}
                  className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface"
                />
                <p className="text-[10px] text-muted">Dipakai saat Animasi diset ke Karaoke.</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type SectionId = "layout" | "headline" | "caption" | "overlay" | "introOutro" | "music";
const SECTIONS: { id: SectionId; label: string; icon: typeof Crop }[] = [
  { id: "layout", label: "Layout", icon: Crop },
  { id: "headline", label: "Auto Headline", icon: Type },
  { id: "caption", label: "Caption", icon: Captions },
  { id: "overlay", label: "Overlay (Logo, CTA)", icon: ImagePlus },
  { id: "introOutro", label: "Intro/Outro", icon: Film },
  { id: "music", label: "Musik", icon: Music },
];

export default function AutoClipPage() {
  const { update } = useSession();
  const costs = useCreditCosts();
  const triggerCreditReminder = useCreditReminder();

  const [sourceMode, setSourceMode] = useState<"upload" | "youtube">("youtube");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploadedVideoThumbnail, setUploadedVideoThumbnail] = useState<string | null>(null);

  // Captures a real frame from the user's uploaded file for the style
  // preview (instead of the generic stock photo) — entirely client-side via
  // a hidden <video>+<canvas>, no upload/server round-trip needed just to
  // show a thumbnail. Seeks a little into the clip so the frame isn't a
  // black/blank opening moment.
  useEffect(() => {
    // Resetting to null when a file is removed happens directly in that
    // button's onClick instead of here — clearing derived state as a plain
    // event-driven state update, not as a synchronous effect-body setState.
    if (!videoFile) return;
    const objectUrl = URL.createObjectURL(videoFile);
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";

    const handleLoadedMetadata = () => {
      videoEl.currentTime = Math.min(1, (videoEl.duration || 2) / 4);
    };
    const handleSeeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        setUploadedVideoThumbnail(canvas.toDataURL("image/jpeg", 0.85));
      }
    };
    videoEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoEl.addEventListener("seeked", handleSeeked);
    videoEl.src = objectUrl;

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoEl.removeEventListener("seeked", handleSeeked);
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  const [momentQuery, setMomentQuery] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("original");
  const [fitMode, setFitMode] = useState<string>(DEFAULT_FIT_MODE);
  const [smartCropEnabled, setSmartCropEnabled] = useState(DEFAULT_SMART_CROP_ENABLED);
  const [effectPreset, setEffectPreset] = useState<string>("");
  const [headlineEnabled, setHeadlineEnabled] = useState(false);
  const [headlineFont, setHeadlineFont] = useState<string>(DEFAULT_TEXT_FONT);
  const [headlineColor, setHeadlineColor] = useState<string>(DEFAULT_TEXT_COLOR);
  const [headlineBackground, setHeadlineBackground] = useState<string>("none");
  const [headlineAnimation, setHeadlineAnimation] = useState<string>(DEFAULT_TEXT_ANIMATION);
  const [headlineBold, setHeadlineBold] = useState(false);
  const [headlineItalic, setHeadlineItalic] = useState(false);
  const [headlineAlign, setHeadlineAlign] = useState<string>(DEFAULT_TEXT_ALIGN);
  const [headlineFontScale, setHeadlineFontScale] = useState(DEFAULT_FONT_SCALE);
  const [headlinePosition, setHeadlinePosition] = useState<string>(DEFAULT_HEADLINE_POSITION);
  const [headlinePositionX, setHeadlinePositionX] = useState(DEFAULT_HEADLINE_POSITION_X);
  const [headlinePositionY, setHeadlinePositionY] = useState(DEFAULT_HEADLINE_POSITION_Y);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleFont, setSubtitleFont] = useState<string>(DEFAULT_TEXT_FONT);
  const [subtitleColor, setSubtitleColor] = useState<string>(DEFAULT_TEXT_COLOR);
  const [subtitleBackground, setSubtitleBackground] = useState<string>("none");
  const [subtitleAnimation, setSubtitleAnimation] = useState<string>(DEFAULT_TEXT_ANIMATION);
  const [subtitleBold, setSubtitleBold] = useState(false);
  const [subtitleItalic, setSubtitleItalic] = useState(false);
  const [subtitleUnderline, setSubtitleUnderline] = useState(false);
  const [subtitleAlign, setSubtitleAlign] = useState<string>(DEFAULT_TEXT_ALIGN);
  const [subtitleFontScale, setSubtitleFontScale] = useState(DEFAULT_FONT_SCALE);
  const [subtitleUppercase, setSubtitleUppercase] = useState(false);
  const [subtitleStrokeColor, setSubtitleStrokeColor] = useState(DEFAULT_STROKE_COLOR);
  const [subtitleStrokeWidth, setSubtitleStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [subtitleShadowEnabled, setSubtitleShadowEnabled] = useState(false);
  const [subtitleShadowOffsetX, setSubtitleShadowOffsetX] = useState(DEFAULT_SHADOW_OFFSET);
  const [subtitleShadowOffsetY, setSubtitleShadowOffsetY] = useState(DEFAULT_SHADOW_OFFSET);
  const [subtitlePosition, setSubtitlePosition] = useState<string>(DEFAULT_SUBTITLE_POSITION);
  const [subtitlePositionX, setSubtitlePositionX] = useState(DEFAULT_SUBTITLE_POSITION_X);
  const [subtitlePositionY, setSubtitlePositionY] = useState(DEFAULT_SUBTITLE_POSITION_Y);
  const [subtitleLineMode, setSubtitleLineMode] = useState<string>(DEFAULT_SUBTITLE_LINE_MODE);
  const [subtitleHighlightColor, setSubtitleHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);

  const [overlayLogoAssetId, setOverlayLogoAssetId] = useState<string | null>(null);
  const [overlayLogoPosition, setOverlayLogoPosition] = useState<string>(DEFAULT_OVERLAY_LOGO_POSITION);
  const [overlayCtaText, setOverlayCtaText] = useState("");
  const [introAssetId, setIntroAssetId] = useState<string | null>(null);
  const [outroAssetId, setOutroAssetId] = useState<string | null>(null);
  const [musicAssetId, setMusicAssetId] = useState<string | null>(null);
  const [musicVolumePercent, setMusicVolumePercent] = useState(DEFAULT_MUSIC_VOLUME_PERCENT);
  const [removeFillerWords, setRemoveFillerWords] = useState(false);
  const [removePauses, setRemovePauses] = useState(false);
  const [autoTransitions, setAutoTransitions] = useState(false);
  const [socialCaptionEnabled, setSocialCaptionEnabled] = useState(false);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Restores the persisted settings after mount. This can't be a lazy
  // useState initializer (the "no setState in effect" lint rule's usual fix)
  // because localStorage doesn't exist during SSR — reading it synchronously
  // during the initial render would make the client's first render disagree
  // with the server-rendered HTML and trigger a hydration mismatch. Loading
  // post-mount, client-only, is the correct pattern for external browser
  // storage like this.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedAutoClipSettings>;
        if (saved.aspectRatio !== undefined) setAspectRatio(saved.aspectRatio);
        if (saved.fitMode !== undefined) setFitMode(saved.fitMode);
        if (saved.smartCropEnabled !== undefined) setSmartCropEnabled(saved.smartCropEnabled);
        if (saved.effectPreset !== undefined) setEffectPreset(saved.effectPreset);
        if (saved.headlineEnabled !== undefined) setHeadlineEnabled(saved.headlineEnabled);
        if (saved.headlineFont !== undefined) setHeadlineFont(saved.headlineFont);
        if (saved.headlineColor !== undefined) setHeadlineColor(saved.headlineColor);
        if (saved.headlineBackground !== undefined) setHeadlineBackground(saved.headlineBackground);
        if (saved.headlineAnimation !== undefined) setHeadlineAnimation(saved.headlineAnimation);
        if (saved.headlineBold !== undefined) setHeadlineBold(saved.headlineBold);
        if (saved.headlineItalic !== undefined) setHeadlineItalic(saved.headlineItalic);
        if (saved.headlineAlign !== undefined) setHeadlineAlign(saved.headlineAlign);
        if (saved.headlineFontScale !== undefined) setHeadlineFontScale(saved.headlineFontScale);
        if (saved.headlinePosition !== undefined) setHeadlinePosition(saved.headlinePosition);
        if (saved.headlinePositionX !== undefined) setHeadlinePositionX(saved.headlinePositionX);
        if (saved.headlinePositionY !== undefined) setHeadlinePositionY(saved.headlinePositionY);
        if (saved.subtitleEnabled !== undefined) setSubtitleEnabled(saved.subtitleEnabled);
        if (saved.subtitleFont !== undefined) setSubtitleFont(saved.subtitleFont);
        if (saved.subtitleColor !== undefined) setSubtitleColor(saved.subtitleColor);
        if (saved.subtitleBackground !== undefined) setSubtitleBackground(saved.subtitleBackground);
        if (saved.subtitleAnimation !== undefined) setSubtitleAnimation(saved.subtitleAnimation);
        if (saved.subtitleBold !== undefined) setSubtitleBold(saved.subtitleBold);
        if (saved.subtitleItalic !== undefined) setSubtitleItalic(saved.subtitleItalic);
        if (saved.subtitleUnderline !== undefined) setSubtitleUnderline(saved.subtitleUnderline);
        if (saved.subtitleAlign !== undefined) setSubtitleAlign(saved.subtitleAlign);
        if (saved.subtitleFontScale !== undefined) setSubtitleFontScale(saved.subtitleFontScale);
        if (saved.subtitleUppercase !== undefined) setSubtitleUppercase(saved.subtitleUppercase);
        if (saved.subtitleStrokeColor !== undefined) setSubtitleStrokeColor(saved.subtitleStrokeColor);
        if (saved.subtitleStrokeWidth !== undefined) setSubtitleStrokeWidth(saved.subtitleStrokeWidth);
        if (saved.subtitleShadowEnabled !== undefined) setSubtitleShadowEnabled(saved.subtitleShadowEnabled);
        if (saved.subtitleShadowOffsetX !== undefined) setSubtitleShadowOffsetX(saved.subtitleShadowOffsetX);
        if (saved.subtitleShadowOffsetY !== undefined) setSubtitleShadowOffsetY(saved.subtitleShadowOffsetY);
        if (saved.subtitlePosition !== undefined) setSubtitlePosition(saved.subtitlePosition);
        if (saved.subtitlePositionX !== undefined) setSubtitlePositionX(saved.subtitlePositionX);
        if (saved.subtitlePositionY !== undefined) setSubtitlePositionY(saved.subtitlePositionY);
        if (saved.subtitleLineMode !== undefined) setSubtitleLineMode(saved.subtitleLineMode);
        if (saved.subtitleHighlightColor !== undefined) setSubtitleHighlightColor(saved.subtitleHighlightColor);
        if (saved.overlayLogoAssetId !== undefined) setOverlayLogoAssetId(saved.overlayLogoAssetId);
        if (saved.overlayLogoPosition !== undefined) setOverlayLogoPosition(saved.overlayLogoPosition);
        if (saved.overlayCtaText !== undefined) setOverlayCtaText(saved.overlayCtaText);
        if (saved.introAssetId !== undefined) setIntroAssetId(saved.introAssetId);
        if (saved.outroAssetId !== undefined) setOutroAssetId(saved.outroAssetId);
        if (saved.musicAssetId !== undefined) setMusicAssetId(saved.musicAssetId);
        if (saved.musicVolumePercent !== undefined) setMusicVolumePercent(saved.musicVolumePercent);
        if (saved.removeFillerWords !== undefined) setRemoveFillerWords(saved.removeFillerWords);
        if (saved.removePauses !== undefined) setRemovePauses(saved.removePauses);
        if (saved.autoTransitions !== undefined) setAutoTransitions(saved.autoTransitions);
        if (saved.socialCaptionEnabled !== undefined) setSocialCaptionEnabled(saved.socialCaptionEnabled);
      }
    } catch {
      // Corrupted or outdated-shape value — ignore and keep the useState defaults.
    }
    // Only starts the save effect below (which would otherwise immediately
    // overwrite localStorage with these still-default values before this
    // load finishes) once this restore pass has run.
    setSettingsLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persists on every change to the Layout/Auto Headline/Caption/Overlay/
  // Intro-Outro/Musik/AI-toggle fields — deliberately excludes only the
  // per-clip fields (video source, moment query, clip count).
  useEffect(() => {
    if (!settingsLoaded) return;
    const settings: PersistedAutoClipSettings = {
      aspectRatio,
      fitMode,
      smartCropEnabled,
      effectPreset,
      headlineEnabled,
      headlineFont,
      headlineColor,
      headlineBackground,
      headlineAnimation,
      headlineBold,
      headlineItalic,
      headlineAlign,
      headlineFontScale,
      headlinePosition,
      headlinePositionX,
      headlinePositionY,
      subtitleEnabled,
      subtitleFont,
      subtitleColor,
      subtitleBackground,
      subtitleAnimation,
      subtitleBold,
      subtitleItalic,
      subtitleUnderline,
      subtitleAlign,
      subtitleFontScale,
      subtitleUppercase,
      subtitleStrokeColor,
      subtitleStrokeWidth,
      subtitleShadowEnabled,
      subtitleShadowOffsetX,
      subtitleShadowOffsetY,
      subtitlePosition,
      subtitlePositionX,
      subtitlePositionY,
      subtitleLineMode,
      subtitleHighlightColor,
      overlayLogoAssetId,
      overlayLogoPosition,
      overlayCtaText,
      introAssetId,
      outroAssetId,
      musicAssetId,
      musicVolumePercent,
      removeFillerWords,
      removePauses,
      autoTransitions,
      socialCaptionEnabled,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [
    aspectRatio,
    fitMode,
    smartCropEnabled,
    effectPreset,
    headlineEnabled,
    headlineFont,
    headlineColor,
    headlineBackground,
    headlineAnimation,
    headlineBold,
    headlineItalic,
    headlineAlign,
    headlineFontScale,
    headlinePosition,
    headlinePositionX,
    headlinePositionY,
    subtitleEnabled,
    subtitleFont,
    subtitleColor,
    subtitleBackground,
    subtitleAnimation,
    subtitleBold,
    subtitleItalic,
    subtitleUnderline,
    subtitleAlign,
    subtitleFontScale,
    subtitleUppercase,
    subtitleStrokeColor,
    subtitleStrokeWidth,
    subtitleShadowEnabled,
    subtitleShadowOffsetX,
    subtitleShadowOffsetY,
    subtitlePosition,
    subtitlePositionX,
    subtitlePositionY,
    subtitleLineMode,
    subtitleHighlightColor,
    overlayLogoAssetId,
    overlayLogoPosition,
    overlayCtaText,
    introAssetId,
    outroAssetId,
    musicAssetId,
    musicVolumePercent,
    removeFillerWords,
    removePauses,
    autoTransitions,
    socialCaptionEnabled,
    settingsLoaded,
  ]);

  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const { page: historyPage, setPage: setHistoryPage, pageCount: historyPageCount, pageItems: historyPageItems } =
    usePagination(history ?? [], 5);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [expandedCaptionClipId, setExpandedCaptionClipId] = useState<string | null>(null);
  const clipsRowRef = useRef<HTMLDivElement>(null);
  const [canScrollClipsLeft, setCanScrollClipsLeft] = useState(false);
  const [canScrollClipsRight, setCanScrollClipsRight] = useState(false);

  function scrollClipsRow(direction: 1 | -1) {
    const el = clipsRowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  function updateClipsScrollState() {
    const el = clipsRowRef.current;
    if (!el) return;
    setCanScrollClipsLeft(el.scrollLeft > 1);
    setCanScrollClipsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  // Re-checks on mount/clip-count-change (e.g. after Phase B generates
  // clips), on scroll (so a button disappears once its direction is
  // exhausted), and on viewport resize — so the nav buttons only ever show
  // when there's actually more to scroll to in that direction.
  useEffect(() => {
    updateClipsScrollState();
    const el = clipsRowRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateClipsScrollState);
    window.addEventListener("resize", updateClipsScrollState);
    return () => {
      el.removeEventListener("scroll", updateClipsScrollState);
      window.removeEventListener("resize", updateClipsScrollState);
    };
  }, [batch?.clips.length]);

  async function handleCopyCaption(clipId: string, caption: string) {
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedClipId(clipId);
      setTimeout(() => setCopiedClipId((prev) => (prev === clipId ? null : prev)), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS context) — the text is still visible to copy manually.
    }
  }

  function loadHistory() {
    fetch("/api/ai/video-clip")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setHistory(data.batches ?? []);
        setHistoryError(false);
      })
      .catch(() => {
        setHistory([]);
        setHistoryError(true);
      });
  }

  useEffect(loadHistory, []);

  function loadBatch(id: string) {
    fetch(`/api/ai/video-clip/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.batch) {
          setBatch(data.batch);
          if (data.batch.status === "MOMENTS_FOUND" && data.batch.clips.length === 0) {
            setSelectedIndexes((prev) => {
              if (prev.size > 0) return prev;
              const moments: Moment[] = data.batch.moments ?? [];
              return new Set(moments.map((m) => m.index));
            });
          }
        }
      })
      .catch(() => {});
  }

  // Resume tracking the last batch after a page reload.
  useEffect(() => {
    const lastId = localStorage.getItem(STORAGE_KEY);
    if (lastId) loadBatch(lastId);
  }, []);

  // Poll while analysis is in progress, or while any clip is still pending.
  useEffect(() => {
    if (!batch) return;
    const stillAnalyzing = isBatchAnalyzing(batch.status);
    const stillClipping = batch.clips.some((c) => isClipPending(c.status));
    if (!stillAnalyzing && !stillClipping) return;

    const id = setInterval(() => loadBatch(batch.id), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id, batch?.status, batch?.clips]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setVideoFile(file);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (sourceMode === "upload" && !videoFile) {
      setSubmitError("Unggah video terlebih dahulu.");
      return;
    }
    if (sourceMode === "youtube" && !youtubeUrl.trim()) {
      setSubmitError("Masukkan link YouTube terlebih dahulu.");
      return;
    }
    if (!momentQuery.trim()) {
      setSubmitError("Jelaskan momen yang ingin dicari.");
      return;
    }

    const balanceRes = await fetch("/api/credits/balance");
    const balanceData = await balanceRes.json().catch(() => null);
    if (balanceRes.ok && balanceData && balanceData.creditBalance < costs.VIDEO_CLIP_ANALYSIS) {
      setSubmitError(
        `Kredit Anda tidak cukup (butuh ~${costs.VIDEO_CLIP_ANALYSIS}, sisa ${balanceData.creditBalance}).`
      );
      if (balanceData.creditBalance <= 0) triggerCreditReminder();
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (sourceMode === "upload" && videoFile) {
        formData.set("video", videoFile);
      } else {
        formData.set("youtubeUrl", youtubeUrl.trim());
      }
      formData.set("momentQuery", momentQuery);
      // No user-facing clip-count picker anymore — always request the max,
      // same as the picker's default used to be.
      formData.set("requestedCount", String(MAX_CLIP_COUNT));
      formData.set("aspectRatio", aspectRatio);
      formData.set("fitMode", fitMode);
      formData.set("smartCropEnabled", String(smartCropEnabled));
      formData.set("effectPreset", effectPreset);
      formData.set("headlineEnabled", String(headlineEnabled));
      formData.set("headlineFont", headlineFont);
      formData.set("headlineColor", headlineColor);
      formData.set("headlineBackground", headlineBackground);
      formData.set("headlineAnimation", headlineAnimation);
      formData.set("headlineBold", String(headlineBold));
      formData.set("headlineItalic", String(headlineItalic));
      formData.set("headlineAlign", headlineAlign);
      formData.set("headlineFontScale", String(headlineFontScale));
      formData.set("headlinePosition", headlinePosition);
      formData.set("headlinePositionX", String(headlinePositionX));
      formData.set("headlinePositionY", String(headlinePositionY));
      formData.set("subtitleEnabled", String(subtitleEnabled));
      formData.set("subtitleFont", subtitleFont);
      formData.set("subtitleColor", subtitleColor);
      formData.set("subtitleBackground", subtitleBackground);
      formData.set("subtitleAnimation", subtitleAnimation);
      formData.set("subtitleBold", String(subtitleBold));
      formData.set("subtitleItalic", String(subtitleItalic));
      formData.set("subtitleUnderline", String(subtitleUnderline));
      formData.set("subtitleAlign", subtitleAlign);
      formData.set("subtitleFontScale", String(subtitleFontScale));
      formData.set("subtitleUppercase", String(subtitleUppercase));
      formData.set("subtitleStrokeColor", subtitleStrokeColor);
      formData.set("subtitleStrokeWidth", String(subtitleStrokeWidth));
      formData.set("subtitleShadowEnabled", String(subtitleShadowEnabled));
      formData.set("subtitleShadowOffsetX", String(subtitleShadowOffsetX));
      formData.set("subtitleShadowOffsetY", String(subtitleShadowOffsetY));
      formData.set("subtitlePosition", subtitlePosition);
      formData.set("subtitlePositionX", String(subtitlePositionX));
      formData.set("subtitlePositionY", String(subtitlePositionY));
      formData.set("subtitleLineMode", subtitleLineMode);
      formData.set("subtitleHighlightColor", subtitleHighlightColor);
      if (overlayLogoAssetId) formData.set("overlayLogoAssetId", overlayLogoAssetId);
      formData.set("overlayLogoPosition", overlayLogoPosition);
      if (overlayCtaText.trim()) formData.set("overlayCtaText", overlayCtaText.trim());
      if (introAssetId) formData.set("introAssetId", introAssetId);
      if (outroAssetId) formData.set("outroAssetId", outroAssetId);
      if (musicAssetId) formData.set("musicAssetId", musicAssetId);
      formData.set("musicVolumePercent", String(musicVolumePercent));
      formData.set("removeFillerWords", String(removeFillerWords));
      formData.set("removePauses", String(removePauses));
      formData.set("autoTransitions", String(autoTransitions));
      formData.set("socialCaptionEnabled", String(socialCaptionEnabled));

      const res = await fetch("/api/ai/video-clip", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Gagal memulai analisis video.");
        return;
      }

      localStorage.setItem(STORAGE_KEY, data.batchId);
      setSelectedIndexes(new Set());
      await update({ creditBalance: data.creditBalance });
      loadBatch(data.batchId);
      loadHistory();
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMomentSelection(index: number) {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleConfirmClips() {
    if (!batch || isConfirming || selectedIndexes.size === 0) return;
    setConfirmError(null);

    const balanceRes = await fetch("/api/credits/balance");
    const balanceData = await balanceRes.json().catch(() => null);
    if (balanceRes.ok && balanceData && balanceData.creditBalance < selectedCost) {
      setConfirmError(`Kredit Anda tidak cukup (butuh ~${selectedCost}, sisa ${balanceData.creditBalance}).`);
      if (balanceData.creditBalance <= 0) triggerCreditReminder();
      return;
    }

    setIsConfirming(true);
    try {
      const res = await fetch(`/api/ai/video-clip/${batch.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndexes: Array.from(selectedIndexes) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error ?? "Gagal memulai pembuatan klip.");
        return;
      }
      if (data.creditBalance !== undefined) await update({ creditBalance: data.creditBalance });
      loadBatch(batch.id);
      loadHistory();
    } catch {
      setConfirmError("Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.");
    } finally {
      setIsConfirming(false);
    }
  }

  // Costs from the API are raw/unrounded — summed first, then rounded ONCE
  // (matching how generate/route.ts actually charges) so this estimate never
  // overstates the real combined per-clip cost.
  const perClipCost = Math.ceil(
    costs.VIDEO_CLIP_PER_CLIP_BASE +
      (headlineEnabled ? costs.VIDEO_CLIP_HEADLINE_ADDON : 0) +
      (socialCaptionEnabled ? costs.VIDEO_CLIP_CAPTION_ADDON : 0)
  );
  const selectedCost = perClipCost * selectedIndexes.size;

  const headlineBgHex = resolveDisplayBackground(headlineBackground);
  const subtitleBgHex = resolveDisplayBackground(subtitleBackground);
  const transitionsDisabled = !introAssetId && !outroAssetId;

  const headlinePreviewClassName = cn(
    "rounded px-1.5 py-1 text-[10px] leading-tight",
    headlineBold && "font-bold",
    headlineItalic && "italic",
    headlineAlign === "left" && "text-left",
    headlineAlign === "right" && "text-right",
    headlineAlign === "center" && "text-center"
  );
  const headlinePreviewStyle: CSSProperties = {
    fontFamily: getFontCssFamily(headlineFont),
    color: `#${resolveDisplayColor(headlineColor)}`,
    backgroundColor: headlineBgHex ? `#${headlineBgHex}` : "transparent",
    fontSize: `${10 * (headlineFontScale / 100)}px`,
  };
  const subtitlePreviewClassName = cn(
    "rounded px-1.5 py-1 text-[10px] leading-tight",
    subtitleBold && "font-bold",
    subtitleItalic && "italic",
    subtitleUnderline && "underline",
    subtitleAlign === "left" && "text-left",
    subtitleAlign === "right" && "text-right",
    subtitleAlign === "center" && "text-center"
  );
  const subtitlePreviewStyle: CSSProperties = {
    fontFamily: getFontCssFamily(subtitleFont),
    color: `#${resolveDisplayColor(subtitleColor)}`,
    backgroundColor: subtitleBgHex ? `#${subtitleBgHex}` : "transparent",
    fontSize: `${10 * (subtitleFontScale / 100)}px`,
    whiteSpace: "pre-line",
  };
  const headlinePreviewAnim = PREVIEW_TEXT_ANIMATIONS[headlineAnimation];
  const subtitlePreviewAnim = PREVIEW_TEXT_ANIMATIONS[subtitleAnimation];
  const previewZoomAnim = PREVIEW_ZOOM_ANIMATIONS[effectPreset];

  // Mirrors buildChunkedCaptionsForMoment/buildKaraokeAss's real chunking: up
  // to WORDS_PER_LINE words per line, "two" forces a break after the first
  // line instead of relying on wrap — so the preview actually demonstrates
  // the difference between "1 Baris" and "2 Baris" instead of always
  // rendering the same short static string.
  const subtitleLineCount = subtitleLineMode === "two" ? 2 : 1;
  const subtitlePreviewWords = SUBTITLE_PREVIEW_WORDS.slice(0, WORDS_PER_LINE * subtitleLineCount);
  const subtitlePreviewLineBreakAfterIndex = subtitleLineCount === 2 ? WORDS_PER_LINE - 1 : undefined;
  const subtitlePreviewText =
    subtitleLineCount === 2
      ? `${subtitlePreviewWords.slice(0, WORDS_PER_LINE).join(" ")}\n${subtitlePreviewWords.slice(WORDS_PER_LINE).join(" ")}`
      : subtitlePreviewWords.join(" ");
  const subtitlePreviewPositionStyle = getTextPreviewPositionStyle(
    subtitlePosition,
    subtitlePositionX,
    subtitlePositionY,
    subtitleAlign,
    "bottom"
  );
  const headlinePreviewPositionStyle = getTextPreviewPositionStyle(
    headlinePosition,
    headlinePositionX,
    headlinePositionY,
    headlineAlign,
    "top"
  );

  function sectionSummary(id: SectionId): string | undefined {
    switch (id) {
      case "layout":
        return ASPECT_RATIOS.find((a) => a.value === aspectRatio)?.label;
      case "headline":
        return headlineEnabled ? "Aktif" : "Nonaktif";
      case "caption":
        return subtitleEnabled ? "Aktif" : "Nonaktif";
      case "overlay":
        return overlayLogoAssetId || overlayCtaText ? "Aktif" : undefined;
      case "introOutro":
        return introAssetId || outroAssetId ? "Aktif" : undefined;
      case "music":
        return musicAssetId ? "Aktif" : undefined;
    }
  }

  // Prefers a real frame from the user's own source — a client-captured
  // frame for an uploaded file, or YouTube's own public thumbnail CDN for a
  // pasted link (both are the video the user is actually about to process,
  // not a guessed/arbitrary URL) — falling back to a generic stock photo
  // placeholder so this isn't just an empty box before either is available.
  // Not a real video frame from ffmpeg either way, but every relevant style
  // setting from Layout/Auto Headline/Caption is still reflected: font,
  // color, alignment, the text entrance animation (karaoke's word-highlight
  // included), and the Layout effect preset's zoom motion or color grade.
  // Extracted to a variable (rather than left inline) so it can be placed
  // beside the Layout/Auto Headline/Caption/etc settings list specifically,
  // not the video-source/moment-query fields above it.
  const youtubeVideoId = sourceMode === "youtube" ? extractYoutubeVideoId(youtubeUrl) : null;
  const previewImageUrl =
    sourceMode === "upload" && uploadedVideoThumbnail
      ? uploadedVideoThumbnail
      : sourceMode === "youtube" && youtubeVideoId
        ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`
        : "/images/auto-clip-preview-person.jpg";

  // "fit" (letterbox) shows the WHOLE source with black bars filling the gap
  // — bg-contain instead of the default bg-cover (which crops to fill,
  // matching the "fill" fitMode) — mirroring cutClip's
  // scale+pad-vs-crop+scale branch. Irrelevant for "original" aspect ratio,
  // which never crops either way.
  const previewLetterboxed = fitMode === "fit" && aspectRatio !== "original";
  const previewCard = (
    <div className="relative mx-auto flex aspect-9/16 w-36 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-black">
      <motion.div
        className={cn("absolute inset-0 bg-center", previewLetterboxed ? "bg-contain bg-no-repeat" : "bg-cover")}
        style={{
          backgroundImage: `url(${previewImageUrl})`,
          filter: PREVIEW_EFFECT_FILTER[effectPreset] ?? "none",
        }}
        animate={previewZoomAnim?.animate}
        transition={previewZoomAnim?.transition}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/50" />
      {(effectPreset === "cinematic_grade" || effectPreset === "vintage_warm") && (
        <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 26px 10px rgba(0,0,0,0.55)" }} />
      )}
      {effectPreset === "vintage_warm" && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent" />
      )}

      <div className="relative z-10 h-full">
        {headlineEnabled && (
          <div style={headlinePreviewPositionStyle}>
            {headlinePreviewAnim ? (
              <motion.span
                className={headlinePreviewClassName}
                style={headlinePreviewStyle}
                animate={headlinePreviewAnim.animate}
                transition={headlinePreviewAnim.transition}
              >
                Contoh Headline
              </motion.span>
            ) : (
              <span className={headlinePreviewClassName} style={headlinePreviewStyle}>
                Contoh Headline
              </span>
            )}
          </div>
        )}
        {overlayLogoAssetId && (
          <span
            className={cn(
              "absolute rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted",
              overlayLogoPosition === "top-left" && "top-2 left-2",
              overlayLogoPosition === "top-right" && "top-2 right-2",
              overlayLogoPosition === "bottom-left" && "bottom-2 left-2",
              overlayLogoPosition === "bottom-right" && "bottom-2 right-2"
            )}
          >
            Logo
          </span>
        )}
        {subtitleEnabled && (
          <div style={subtitlePreviewPositionStyle}>
            {subtitleAnimation === "karaoke" ? (
              <KaraokePreviewText
                words={subtitlePreviewWords}
                lineBreakAfterIndex={subtitlePreviewLineBreakAfterIndex}
                baseColorHex={resolveDisplayColor(subtitleColor)}
                highlightHex={subtitleHighlightColor}
                className={subtitlePreviewClassName}
                style={subtitlePreviewStyle}
              />
            ) : subtitlePreviewAnim ? (
              <motion.span
                className={subtitlePreviewClassName}
                style={subtitlePreviewStyle}
                animate={subtitlePreviewAnim.animate}
                transition={subtitlePreviewAnim.transition}
              >
                {subtitlePreviewText}
              </motion.span>
            ) : (
              <span className={subtitlePreviewClassName} style={subtitlePreviewStyle}>
                {subtitlePreviewText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const expandedCaptionClip = batch?.clips.find((c) => c.id === expandedCaptionClipId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auto Clip"
        description="Unggah video, jelaskan momen yang dicari, dan biarkan AI membuatkan klip pendeknya secara otomatis."
        icon={Scissors}
      />

      <ToolLayout
        stacked
        formTitle="Unggah & Konfigurasi"
        formIcon={Scissors}
        resultTitle="Hasil"
        resultActions={
          batch?.status === "MOMENTS_FOUND" && batch.clips.length === 0 ? (
            <Badge variant="brand">{selectedIndexes.size} klip dipilih</Badge>
          ) : undefined
        }
        form={
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Video Sumber</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourceMode("upload")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
                    sourceMode === "upload"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Unggah Video
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("youtube")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
                    sourceMode === "youtube"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Link YouTube
                </button>
              </div>

              {sourceMode === "upload" ? (
                videoFile ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="truncate text-sm text-foreground">{videoFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoFile(null);
                        setUploadedVideoThumbnail(null);
                      }}
                      className="shrink-0 rounded-md p-1 text-muted hover:text-foreground"
                      aria-label="Hapus video"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">
                      Unggah video (MP4/WEBM/MOV, maks {MAX_VIDEO_MB_LABEL}, durasi {MIN_DURATION_LABEL}-{MAX_DURATION_LABEL})
                    </span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )
              ) : (
                <>
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted">
                    Video publik (bukan siaran langsung), durasi {MIN_DURATION_LABEL}-{MAX_DURATION_LABEL}.
                  </p>
                </>
              )}
            </div>

            <Textarea
              label="Momen yang Dicari"
              placeholder='mis. "momen dia membahas harga produk" atau "bagian-bagian paling lucu"'
              value={momentQuery}
              onChange={(e) => setMomentQuery(e.target.value.slice(0, 500))}
              rows={3}
              required
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-start lg:gap-5">
              {previewCard}
              {activeSection === null ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-1">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const summary = sectionSummary(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white/[.04]"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-brand" />
                      <span className="flex-1 truncate text-sm text-foreground">{s.label}</span>
                      {summary && <span className="shrink-0 truncate text-xs text-muted">{summary}</span>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {SECTIONS.find((s) => s.id === activeSection)?.label}
                </button>

                {activeSection === "layout" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">Format Klip</label>
                      <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className={fieldSelectClass}>
                        {ASPECT_RATIOS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {aspectRatio !== "original" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted">Mode Penyesuaian</label>
                        <select value={fitMode} onChange={(e) => setFitMode(e.target.value)} className={fieldSelectClass}>
                          {FIT_MODES.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {aspectRatio !== "original" && fitMode === "fill" && (
                      <Switch
                        checked={smartCropEnabled}
                        onChange={setSmartCropEnabled}
                        label="Ikuti wajah yang bicara"
                        description="Crop otomatis mengikuti orang yang sedang bicara, tanpa biaya tambahan"
                      />
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">Efek Visual</label>
                      <select value={effectPreset} onChange={(e) => setEffectPreset(e.target.value)} className={fieldSelectClass}>
                        <option value="">Tanpa Efek</option>
                        {EFFECT_PRESETS.map((e) => (
                          <option key={e.value} value={e.value}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {activeSection === "headline" && (
                  <>
                    <Switch checked={headlineEnabled} onChange={setHeadlineEnabled} label="Tambahkan headline otomatis" />
                    {headlineEnabled && (
                      <TextStyleEditor
                        context="headline"
                        font={headlineFont}
                        onFontChange={setHeadlineFont}
                        color={headlineColor}
                        onColorChange={setHeadlineColor}
                        background={headlineBackground}
                        onBackgroundChange={setHeadlineBackground}
                        animation={headlineAnimation}
                        onAnimationChange={setHeadlineAnimation}
                        bold={headlineBold}
                        onBoldChange={setHeadlineBold}
                        italic={headlineItalic}
                        onItalicChange={setHeadlineItalic}
                        underline={false}
                        onUnderlineChange={() => {}}
                        align={headlineAlign}
                        onAlignChange={setHeadlineAlign}
                        fontScale={headlineFontScale}
                        onFontScaleChange={setHeadlineFontScale}
                        uppercase={false}
                        onUppercaseChange={() => {}}
                        strokeColor={DEFAULT_STROKE_COLOR}
                        onStrokeColorChange={() => {}}
                        strokeWidth={DEFAULT_STROKE_WIDTH}
                        onStrokeWidthChange={() => {}}
                        shadowEnabled={false}
                        onShadowEnabledChange={() => {}}
                        shadowOffsetX={DEFAULT_SHADOW_OFFSET}
                        onShadowOffsetXChange={() => {}}
                        shadowOffsetY={DEFAULT_SHADOW_OFFSET}
                        onShadowOffsetYChange={() => {}}
                        position={headlinePosition}
                        onPositionChange={setHeadlinePosition}
                        positionX={headlinePositionX}
                        onPositionXChange={setHeadlinePositionX}
                        positionY={headlinePositionY}
                        onPositionYChange={setHeadlinePositionY}
                        lineMode={DEFAULT_SUBTITLE_LINE_MODE}
                        onLineModeChange={() => {}}
                        highlightColor={DEFAULT_HIGHLIGHT_COLOR}
                        onHighlightColorChange={() => {}}
                      />
                    )}
                  </>
                )}

                {activeSection === "caption" && (
                  <>
                    <Switch
                      checked={subtitleEnabled}
                      onChange={setSubtitleEnabled}
                      label="Tambahkan subtitle otomatis"
                      description="Tanpa biaya tambahan"
                    />
                    {subtitleEnabled && (
                      <TextStyleEditor
                        context="subtitle"
                        font={subtitleFont}
                        onFontChange={setSubtitleFont}
                        color={subtitleColor}
                        onColorChange={setSubtitleColor}
                        background={subtitleBackground}
                        onBackgroundChange={setSubtitleBackground}
                        animation={subtitleAnimation}
                        onAnimationChange={setSubtitleAnimation}
                        bold={subtitleBold}
                        onBoldChange={setSubtitleBold}
                        italic={subtitleItalic}
                        onItalicChange={setSubtitleItalic}
                        underline={subtitleUnderline}
                        onUnderlineChange={setSubtitleUnderline}
                        align={subtitleAlign}
                        onAlignChange={setSubtitleAlign}
                        fontScale={subtitleFontScale}
                        onFontScaleChange={setSubtitleFontScale}
                        uppercase={subtitleUppercase}
                        onUppercaseChange={setSubtitleUppercase}
                        strokeColor={subtitleStrokeColor}
                        onStrokeColorChange={setSubtitleStrokeColor}
                        strokeWidth={subtitleStrokeWidth}
                        onStrokeWidthChange={setSubtitleStrokeWidth}
                        shadowEnabled={subtitleShadowEnabled}
                        onShadowEnabledChange={setSubtitleShadowEnabled}
                        shadowOffsetX={subtitleShadowOffsetX}
                        onShadowOffsetXChange={setSubtitleShadowOffsetX}
                        shadowOffsetY={subtitleShadowOffsetY}
                        onShadowOffsetYChange={setSubtitleShadowOffsetY}
                        position={subtitlePosition}
                        onPositionChange={setSubtitlePosition}
                        positionX={subtitlePositionX}
                        onPositionXChange={setSubtitlePositionX}
                        positionY={subtitlePositionY}
                        onPositionYChange={setSubtitlePositionY}
                        lineMode={subtitleLineMode}
                        onLineModeChange={setSubtitleLineMode}
                        highlightColor={subtitleHighlightColor}
                        onHighlightColorChange={setSubtitleHighlightColor}
                      />
                    )}
                  </>
                )}

                {activeSection === "overlay" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">Logo</label>
                      <AssetPicker kind="LOGO" value={overlayLogoAssetId} onChange={setOverlayLogoAssetId} />
                    </div>
                    {overlayLogoAssetId && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted">Posisi Logo</label>
                        <select
                          value={overlayLogoPosition}
                          onChange={(e) => setOverlayLogoPosition(e.target.value)}
                          className={fieldSelectClass}
                        >
                          {OVERLAY_LOGO_POSITIONS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Input
                      label="Teks CTA (opsional)"
                      placeholder="mis. Follow untuk tips lainnya!"
                      value={overlayCtaText}
                      onChange={(e) => setOverlayCtaText(e.target.value.slice(0, MAX_CTA_TEXT_LENGTH))}
                    />
                  </>
                )}

                {activeSection === "introOutro" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">Intro</label>
                      <AssetPicker kind="INTRO" value={introAssetId} onChange={setIntroAssetId} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">Outro</label>
                      <AssetPicker kind="OUTRO" value={outroAssetId} onChange={setOutroAssetId} />
                    </div>
                  </>
                )}

                {activeSection === "music" && (
                  <>
                    <AssetPicker kind="MUSIC" value={musicAssetId} onChange={setMusicAssetId} />
                    {musicAssetId && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted">Volume Musik ({musicVolumePercent}%)</label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={musicVolumePercent}
                          onChange={(e) => setMusicVolumePercent(Number(e.target.value))}
                          className="accent-brand"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            </div>

            <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Wand2 className="h-4 w-4 text-brand" />
                AI
              </span>
              <Switch checked={removeFillerWords} onChange={setRemoveFillerWords} label="Hapus filler words" />
              <Switch checked={removePauses} onChange={setRemovePauses} label="Hapus jeda diam" />
              <Switch
                checked={autoTransitions}
                onChange={setAutoTransitions}
                label="Auto transitions"
                description={transitionsDisabled ? "Perlu Intro/Outro terlebih dahulu" : undefined}
                disabled={transitionsDisabled}
              />
              <Switch
                checked={socialCaptionEnabled}
                onChange={setSocialCaptionEnabled}
                label="Caption & Deskripsi Postingan"
                description="Dioptimalkan biar gampang FYP"
              />
            </div>

            {submitError && <ErrorNotice message={submitError} />}

            <Button type="submit" isLoading={isSubmitting}>
              <Sparkles className="h-4 w-4" />
              Cari Momen
            </Button>
          </form>
        }
        result={
          !batch ? (
            <EmptyState icon={Scissors} title="Belum ada video dianalisis" />
          ) : isBatchAnalyzing(batch.status) ? (
            <div className="flex flex-col gap-3">
              <ImageGenerationLoader messages={ANALYSIS_LOADING_MESSAGES} compact />
              <p className="text-center text-xs text-muted">{BATCH_STATUS_LABEL[batch.status]}</p>
            </div>
          ) : batch.status === "FAILED" ? (
            <ErrorNotice message={batch.errorMessage ?? "Gagal menganalisis video."} />
          ) : batch.clips.length > 0 ? (
            <div className="flex flex-col gap-3">
              {confirmError && <ErrorNotice message={confirmError} />}
              <div className="relative">
                {canScrollClipsLeft && (
                  <button
                    type="button"
                    onClick={() => scrollClipsRow(-1)}
                    aria-label="Geser ke kiri"
                    className="absolute top-1/2 -left-3 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground shadow-lg hover:bg-white/[.06] sm:flex"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div
                  ref={clipsRowRef}
                  className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {batch.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="flex w-56 shrink-0 snap-start flex-col gap-2 rounded-lg border border-border p-3"
                    >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{clip.title}</p>
                      <Badge variant={CLIP_STATUS_BADGE[clip.status].variant}>
                        {CLIP_STATUS_BADGE[clip.status].label}
                      </Badge>
                    </div>
                    {isClipPending(clip.status) ? (
                      <div className="h-8 animate-pulse rounded bg-white/[.06]" />
                    ) : clip.status === "COMPLETED" && clip.content ? (
                      <>
                        <video controls src={clip.content} className="w-full rounded-lg border border-border bg-black" />
                        {clip.socialCaption && (
                          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-muted">Caption Postingan</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCaption(clip.id, clip.socialCaption!)}
                                className="flex items-center gap-1 text-xs text-brand hover:underline"
                              >
                                {copiedClipId === clip.id ? (
                                  <CopyCheck className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copiedClipId === clip.id ? "Tersalin" : "Salin"}
                              </button>
                            </div>
                            <p className="line-clamp-4 whitespace-pre-wrap text-xs text-foreground">
                              {clip.socialCaption}
                            </p>
                            <button
                              type="button"
                              onClick={() => setExpandedCaptionClipId(clip.id)}
                              className={cn(
                                "self-start text-xs text-brand hover:underline",
                                clip.socialCaption.length <= CAPTION_PREVIEW_MAX_LENGTH && "invisible"
                              )}
                            >
                              Lihat selengkapnya
                            </button>
                          </div>
                        )}
                        <a
                          href={`/api/videoclips/download/${clip.id}`}
                          download
                          className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Unduh
                        </a>
                      </>
                    ) : (
                      <ErrorNotice message={clip.errorMessage ?? "Gagal membuat klip."} />
                    )}
                    </div>
                  ))}
                </div>
                {canScrollClipsRight && (
                  <button
                    type="button"
                    onClick={() => scrollClipsRow(1)}
                    aria-label="Geser ke kanan"
                    className="absolute top-1/2 -right-3 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground shadow-lg hover:bg-white/[.06] sm:flex"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : batch.moments && batch.moments.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Pilih momen yang ingin dijadikan klip ({selectedIndexes.size} dipilih dari {batch.moments.length}).
              </p>
              {batch.moments.map((moment) => {
                const isSelected = selectedIndexes.has(moment.index);
                return (
                  <button
                    key={moment.index}
                    type="button"
                    onClick={() => toggleMomentSelection(moment.index)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      isSelected ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        isSelected ? "border-brand bg-brand text-[#04120c]" : "border-border"
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{moment.label}</p>
                        <span className="shrink-0 text-xs text-muted">
                          {formatTime(moment.start)}–{formatTime(moment.end)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{moment.snippet}</p>
                    </div>
                  </button>
                );
              })}
              {confirmError && <ErrorNotice message={confirmError} />}
              <Button onClick={handleConfirmClips} isLoading={isConfirming} disabled={selectedIndexes.size === 0}>
                <Sparkles className="h-4 w-4" />
                Buat {selectedIndexes.size} Klip
              </Button>
            </div>
          ) : (
            <EmptyState icon={Scissors} title="Tidak ada momen yang cocok ditemukan" />
          )
        }
      />

      <HistoryTable
        title="Riwayat"
        items={
          history
            ? historyPageItems.map((item) => ({
                id: item.id,
                title: (
                  <span className="flex flex-col">
                    <span className="truncate">{item.sourceLabel}</span>
                    <span className="truncate text-xs font-normal text-muted">{item.momentQuery}</span>
                  </span>
                ),
                status: BATCH_TO_HISTORY_STATUS[item.status],
                creditCost: item.creditCost,
                createdAt: item.createdAt,
              }))
            : null
        }
        hasError={historyError}
        page={historyPage}
        pageCount={historyPageCount}
        onPageChange={setHistoryPage}
        onView={(id) => {
          localStorage.setItem(STORAGE_KEY, id);
          setSelectedIndexes(new Set());
          loadBatch(id);
        }}
      />

      <Modal
        open={expandedCaptionClipId !== null}
        onClose={() => setExpandedCaptionClipId(null)}
        title="Caption Postingan"
        footer={
          expandedCaptionClip && (
            <Button
              variant="outline"
              onClick={() => handleCopyCaption(expandedCaptionClip.id, expandedCaptionClip.socialCaption!)}
            >
              {copiedClipId === expandedCaptionClip.id ? (
                <CopyCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedClipId === expandedCaptionClip.id ? "Tersalin" : "Salin"}
            </Button>
          )
        }
      >
        {expandedCaptionClip && (
          <p className="whitespace-pre-wrap text-sm text-foreground">{expandedCaptionClip.socialCaption}</p>
        )}
      </Modal>
    </div>
  );
}

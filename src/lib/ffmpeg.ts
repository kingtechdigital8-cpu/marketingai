import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { TEXT_STYLE_FONTS, TEXT_STYLE_COLORS, TEXT_STYLE_BACKGROUNDS, isValidHexColor } from "@/lib/video-clip-options";
import type { FitMode } from "@/lib/video-clip-asset-options";

const execFileAsync = promisify(execFile);

// Some ffmpeg-static Linux binaries ship without the drawtext filter
// compiled in (see AGENTS.md-adjacent deploy notes) — FFMPEG_PATH/FFPROBE_PATH
// let production point at a system-installed ffmpeg (e.g. `apt install ffmpeg`)
// instead, without touching node_modules.
const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegPath as string);
const FFPROBE_BIN = process.env.FFPROBE_PATH || ffprobeStatic.path;
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

export type AspectRatio = "original" | "9:16" | "1:1";
export type EffectPreset =
  | "zoom_punch"
  | "zoom_out"
  | "cinematic_grade"
  | "vintage_warm"
  | "black_white"
  | "vivid_pop"
  | null;

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
}

export interface CaptionSegment {
  /** Seconds, already offset so 0 = the clip's own start (not the source video's). */
  start: number;
  end: number;
  text: string;
}

/** A caption line with per-word timing, used to render the "karaoke" word-highlight animation. */
export interface CaptionWordGroup {
  start: number;
  end: number;
  words: { start: number; end: number; text: string }[];
  /** 0-based word index after which to force a line break (2-line mode), instead of a plain space. */
  lineBreakAfterIndex?: number;
}

export interface TextStyle {
  font: string;
  color: string;
  background: string;
  animation?: string;
  bold?: boolean;
  italic?: boolean;
  /** Only applied to subtitles — drawtext (headline) has no native underline and no reliable way to sync a manual line to animated/dynamic text width. */
  underline?: boolean;
  align?: string;
  /** Percent, 100 = the existing auto-computed default size. */
  fontScale?: number;
  /** Everything below is only applied to subtitles (per user decision — Auto Headline keeps its current styling). */
  uppercase?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  shadowEnabled?: boolean;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  position?: string;
  positionX?: number;
  positionY?: number;
  /** Used for the "karaoke" animation's current-word highlight. */
  highlightColor?: string;
}

export interface CutClipOptions {
  input: string;
  start: number;
  end: number;
  output: string;
  sourceWidth: number;
  sourceHeight: number;
  aspectRatio: AspectRatio;
  /** Ignored when aspectRatio is "original" (nothing to reconcile — no crop is ever applied there). Defaults to "fill" (crop) when omitted. */
  fitMode?: FitMode;
  /** Only used when fitMode is "fill" — a time-varying crop window (source-pixel coordinates, from detectSpeakerCropPath) that replaces the static centered crop. Empty/omitted falls back to the existing centered crop. */
  cropKeyframes?: { time: number; x: number; y: number }[];
  effectPreset: EffectPreset;
  headlineText?: string | null;
  headlineStyle?: TextStyle;
  captionSegments?: CaptionSegment[];
  /** Only used when subtitleStyle.animation === "karaoke" — falls back to captionSegments if empty. */
  captionWordGroups?: CaptionWordGroup[];
  subtitleStyle?: TextStyle;
}

// drawtext's text_align option only exists on newer ffmpeg builds — the
// system ffmpeg some hosts fall back to (see FFMPEG_PATH above) can be old
// enough to lack it, which fails the whole filtergraph with "Option
// 'text_align' not found" rather than just ignoring the option. Probed once
// per process and cached, since FFMPEG_BIN doesn't change at runtime.
let textAlignSupported: Promise<boolean> | undefined;
function supportsTextAlign(): Promise<boolean> {
  if (!textAlignSupported) {
    textAlignSupported = execFileAsync(FFMPEG_BIN, ["-hide_banner", "-h", "filter=drawtext"])
      .then(({ stdout, stderr }) => /\btext_align\b/.test(stdout + stderr))
      .catch(() => false);
  }
  return textAlignSupported;
}

/** Reads duration + dimensions in one call — used both for billing and for building the filter graph. */
export async function probeMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const stream = data?.streams?.[0];
  const durationSeconds = Number(data?.format?.duration);
  const width = Number(stream?.width);
  const height = Number(stream?.height);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Gagal membaca durasi video.");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Gagal membaca dimensi video.");
  }

  return { durationSeconds, width, height };
}

/**
 * Mono 64kbps — a chunk (see TRANSCRIPTION_CHUNK_SECONDS) comfortably stays
 * under Whisper's 25MB/request limit at this bitrate. `range`, when given,
 * extracts just [start, start+duration) — used to pull out one chunk of a
 * long video's audio instead of the whole thing.
 */
export async function extractAudio(
  videoPath: string,
  audioPath: string,
  range?: { start: number; duration: number }
): Promise<void> {
  const args = ["-y"];
  if (range) {
    // Input-side seeking (before -i) — fast, and the same pattern cutClip
    // already relies on for frame-accurate-enough cuts elsewhere in this file.
    args.push("-ss", String(range.start), "-t", String(range.duration));
  }
  args.push("-i", videoPath, "-vn", "-acodec", "libmp3lame", "-b:a", "64k", "-ar", "16000", "-ac", "1", audioPath);
  await execFileAsync(FFMPEG_BIN, args);
}

function toEven(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

/** Windows paths need forward slashes and an escaped drive-letter colon inside an ffmpeg filter string. */
function toFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function escapeDrawtextValue(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

/** Bebas Neue/Anton only ship one real weight in Google Fonts, so all 4 of their file variants point at the same file — bold/italic toggles are simply no-ops for those two families. */
function resolveFont(value: string | undefined, bold: boolean, italic: boolean): { file: string; family: string } {
  const font = TEXT_STYLE_FONTS.find((f) => f.value === value) ?? TEXT_STYLE_FONTS[0];
  const variant = bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
  return { file: font.files[variant], family: font.family };
}

/** Accepts either a raw 6-digit hex (the free-form color picker) or a legacy preset key (old batches / template presets). */
function resolveColorHex(value: string | undefined): string {
  if (!value) return "FFFFFF";
  if (isValidHexColor(value)) return value.toUpperCase();
  return TEXT_STYLE_COLORS.find((c) => c.value === value)?.hex ?? "FFFFFF";
}

/** null = "Tanpa Latar" (no background box), otherwise the RRGGBB hex to fill it with. */
function resolveBackgroundHex(value: string | undefined): string | null {
  if (!value) return null;
  if (isValidHexColor(value)) return value.toUpperCase();
  return TEXT_STYLE_BACKGROUNDS.find((b) => b.value === value)?.hex ?? null;
}

/** drawtext/boxcolor accept 0xRRGGBB. */
function hexToDrawtextColor(hex: string): string {
  return `0x${hex}`;
}

/** ASS colours are &H{AA}{BB}{GG}{RR}& (alpha first, then reversed byte order) — 00 alpha = fully opaque. */
function hexToAssColor(hex: string): string {
  const rr = hex.slice(0, 2);
  const gg = hex.slice(2, 4);
  const bb = hex.slice(4, 6);
  return `&H00${bb}${gg}${rr}&`;
}

/** Inline \c override tags use &H{BB}{GG}{RR}& (no alpha nibble), unlike the style-block colour fields. */
function hexToAssInlineColor(hex: string): string {
  const rr = hex.slice(0, 2);
  const gg = hex.slice(2, 4);
  const bb = hex.slice(4, 6);
  return `&H${bb}${gg}${rr}&`;
}

/** drawtext doesn't auto-wrap — greedily wraps onto up to `maxLines`, overflowing the last line rather than dropping words. */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (lines.length >= maxLines - 1) {
      current = current ? `${current} ${word}` : word;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

/** ffmpeg sendcmd script: one `TIME crop@smartcrop x N, crop@smartcrop y N;` line per keyframe, driving the named crop filter's position over time. */
function buildSendcmdScript(keyframes: { time: number; x: number; y: number }[]): string {
  return keyframes
    .map((k) => `${k.time.toFixed(3)} crop@smartcrop x ${k.x}, crop@smartcrop y ${k.y};`)
    .join("\n");
}

export function computeTargetDimensions(
  aspectRatio: AspectRatio,
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number; cropWidth: number; cropHeight: number } {
  if (aspectRatio === "original") {
    // No downscale — output matches the source's native resolution exactly.
    const width = toEven(sourceWidth);
    const height = toEven(sourceHeight);
    return { width, height, cropWidth: sourceWidth, cropHeight: sourceHeight };
  }

  const targetAspect = aspectRatio === "9:16" ? 9 / 16 : 1;
  const sourceAspect = sourceWidth / sourceHeight;
  let cropWidth: number;
  let cropHeight: number;
  if (sourceAspect > targetAspect) {
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * targetAspect);
  } else {
    cropWidth = sourceWidth;
    cropHeight = Math.round(sourceWidth / targetAspect);
  }
  cropWidth = toEven(cropWidth);
  cropHeight = toEven(cropHeight);

  // The crop already lands exactly on the target aspect ratio at the
  // source's native resolution — output at that same size instead of
  // downscaling to a fixed 720-ish target.
  return { width: cropWidth, height: cropHeight, cropWidth, cropHeight };
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const ss = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${hh}:${pad(mm)}:${pad(ss)}.${pad(cs)}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

/** Where \move/\pos should anchor x/y for a given ASS numpad Alignment (1-9), matching MarginL/MarginR/MarginV=10/10/60 set in buildAssStyleFields. */
function assAnchorX(alignment: number, width: number): number {
  const column = ((alignment - 1) % 3) + 1; // 1,4,7→left · 2,5,8→center · 3,6,9→right
  if (column === 1) return 10;
  if (column === 3) return width - 10;
  return Math.round(width / 2);
}
function assAnchorY(alignment: number, height: number): number {
  const row = Math.floor((alignment - 1) / 3); // 0=bottom · 1=middle · 2=top
  if (row === 2) return 40;
  if (row === 1) return Math.round(height / 2);
  return height - 60;
}

/** "custom" position needs an explicit \pos (percent-of-frame sliders); everything else lets the Alignment+Margin fields in the style block place it, with this only used as the slide_up animation's resting point. */
function computeRestPosition(
  position: string | undefined,
  positionX: number,
  positionY: number,
  alignment: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (position === "custom") {
    return { x: Math.round((positionX / 100) * width), y: Math.round((positionY / 100) * height) };
  }
  return { x: assAnchorX(alignment, width), y: assAnchorY(alignment, height) };
}

/**
 * Per-line ASS override tag CONTENTS (no surrounding braces — the caller
 * merges this with the shadow/position tags into one {…} block) for an
 * "entrance" effect on each subtitle cue. \t transform times are relative to
 * that line's own Start time, so this plays every time a new line appears —
 * independent of the video's own PTS.
 */
function buildAssAnimationTagInner(animation: string | undefined, restX: number, restY: number): string {
  if (animation === "fade") return "\\fad(200,0)";
  if (animation === "pop") return "\\fscx130\\fscy130\\t(0,200,\\fscx100\\fscy100)";
  if (animation === "blur") return "\\blur8\\t(0,250,\\blur0)";
  if (animation === "bounce") {
    return (
      "\\fscx0\\fscy0\\t(0,150,\\fscx125\\fscy125)\\t(150,260,\\fscx90\\fscy90)" +
      "\\t(260,360,\\fscx108\\fscy108)\\t(360,450,\\fscx100\\fscy100)"
    );
  }
  if (animation === "slide_up") {
    const startY = restY + 40;
    return `\\move(${restX},${startY},${restX},${restY},0,300)`;
  }
  return "";
}

/** Merges the entrance-animation, shadow (\xshad\yshad — ASS has no separate shadow colour, it reuses OutlineColour), and custom-position tags into one per-line override block. */
function buildLinePrefix(opts: {
  animation: string | undefined;
  restX: number;
  restY: number;
  shadowEnabled: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  position: string | undefined;
}): string {
  const animTag = buildAssAnimationTagInner(opts.animation, opts.restX, opts.restY);
  const shadowTag = opts.shadowEnabled ? `\\xshad${opts.shadowOffsetX}\\yshad${opts.shadowOffsetY}` : "";
  // \move (slide_up) already positions the line — an extra \pos on top of it would conflict.
  const posTag =
    opts.position === "custom" && opts.animation !== "slide_up" ? `\\pos(${opts.restX},${opts.restY})` : "";
  const inner = `${posTag}${animTag}${shadowTag}`;
  return inner ? `{${inner}}` : "";
}

/** Splits text into cumulative "growing" chunks, one per word — used to fake a typewriter reveal via enable-gated draws/events. Whitespace (incl. \n) rides along with the word that follows it, so multi-line headline text stays correctly wrapped at every step. */
function buildTypewriterChunks(text: string): string[] {
  const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
  const chunks: string[] = [];
  let acc = "";
  for (const part of parts) {
    acc += part;
    if (!/^\s+$/.test(part)) chunks.push(acc);
  }
  return chunks.length > 0 ? chunks : [text];
}

/** Expands each caption line into a burst of short-lived events showing progressively longer prefixes — a real per-word reveal, not just an alpha/scale tag. */
function expandTypewriterEvents(segments: CaptionSegment[]): CaptionSegment[] {
  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const chunks = buildTypewriterChunks(seg.text).slice(0, 20);
    const segDuration = seg.end - seg.start;
    const revealDuration = Math.min(segDuration * 0.7, Math.max(0.3, chunks.length * 0.12));
    const perChunk = revealDuration / chunks.length;
    chunks.forEach((chunk, i) => {
      const chunkStart = seg.start + i * perChunk;
      const chunkEnd = i === chunks.length - 1 ? seg.end : seg.start + (i + 1) * perChunk;
      if (chunkEnd > chunkStart) out.push({ start: chunkStart, end: chunkEnd, text: chunk });
    });
  }
  return out;
}

/** ASS numpad Alignment (1-9): column from horizontal align, row from vertical position ("auto"/"bottom" both sit in the bottom row, matching the original behavior). "custom" is handled separately by the caller (forced to 5/middle-center as the \pos anchor). */
function computeAlignment(align: string | undefined, position: string | undefined): number {
  const column = align === "left" ? 1 : align === "right" ? 3 : 2;
  if (position === "top") return column + 6;
  if (position === "middle") return column + 3;
  return column;
}

/** BorderStyle 3 = opaque box using BackColour; BorderStyle 1 = classic outlined text (used for "Tanpa Latar" so it stays legible with no box). */
function buildAssStyleFields(
  family: string,
  primaryColourAss: string,
  bgHex: string | null,
  opts: { bold: boolean; italic: boolean; underline: boolean; alignment: number; fontsize: number; strokeColorAss: string; strokeWidth: number }
): string[] {
  const bold = opts.bold ? "-1" : "0";
  const italic = opts.italic ? "-1" : "0";
  const underline = opts.underline ? "-1" : "0";
  const alignment = String(opts.alignment);
  const fontsize = String(opts.fontsize);
  const outline = String(opts.strokeWidth);
  return bgHex
    ? [
        "Default", family, fontsize, primaryColourAss, "&H000000FF", opts.strokeColorAss, hexToAssColor(bgHex),
        bold, italic, underline, "0", "100", "100", "0", "0", "3", outline, "0", alignment, "10", "10", "60", "1",
      ]
    : [
        "Default", family, fontsize, primaryColourAss, "&H000000FF", opts.strokeColorAss, "&H00000000",
        bold, italic, underline, "0", "100", "100", "0", "0", "1", outline, "0", alignment, "10", "10", "60", "1",
      ];
}

function buildAssDocument(width: number, height: number, styleFields: string[], eventsText: string): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${styleFields.join(",")}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    eventsText,
  ].join("\n");
}

interface AssStyleOptions {
  family: string;
  primaryColourAss: string;
  bgHex: string | null;
  width: number;
  height: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: string | undefined;
  fontsize: number;
  animation?: string;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  position: string | undefined;
  positionX: number;
  positionY: number;
  uppercase: boolean;
}

/** Builds a full .ass file (not just an SRT+force_style override) so per-line animation tags are available. */
function buildAss(segments: CaptionSegment[], style: AssStyleOptions): string {
  const {
    family, primaryColourAss, bgHex, width, height, bold, italic, underline, align, fontsize, animation,
    strokeColor, strokeWidth, shadowEnabled, shadowOffsetX, shadowOffsetY, position, positionX, positionY, uppercase,
  } = style;
  const alignment = position === "custom" ? 5 : computeAlignment(align, position);
  const styleFields = buildAssStyleFields(family, primaryColourAss, bgHex, {
    bold, italic, underline, alignment, fontsize, strokeColorAss: hexToAssColor(strokeColor), strokeWidth,
  });
  const rest = computeRestPosition(position, positionX, positionY, alignment, width, height);

  const effectiveSegments = animation === "typewriter" ? expandTypewriterEvents(segments) : segments;
  const prefix = buildLinePrefix({
    animation: animation === "typewriter" ? undefined : animation,
    restX: rest.x, restY: rest.y, shadowEnabled, shadowOffsetX, shadowOffsetY, position,
  });

  const events = effectiveSegments
    .map((seg) => {
      const text = uppercase ? seg.text.toUpperCase() : seg.text;
      return `Dialogue: 0,${formatAssTime(seg.start)},${formatAssTime(seg.end)},Default,,0,0,0,,${prefix}${escapeAssText(text)}`;
    })
    .join("\n");

  return buildAssDocument(width, height, styleFields, events);
}

/**
 * Karaoke word-highlight: one event per word, each showing the FULL line
 * (reconstructed from the word tokens themselves, not the original segment
 * text, so there's no ambiguity matching a word back to its position) with
 * just that word wrapped in a highlight colour + bold + slight scale-up,
 * timed to that word's own [start,end]. Simpler and more predictable across
 * libass builds than relying on \k/\kf sweep semantics.
 */
function buildKaraokeAss(lines: CaptionWordGroup[], style: AssStyleOptions & { highlightHex: string }): string {
  const {
    family, primaryColourAss, bgHex, width, height, bold, italic, underline, align, fontsize, highlightHex,
    strokeColor, strokeWidth, shadowEnabled, shadowOffsetX, shadowOffsetY, position, positionX, positionY, uppercase,
  } = style;
  const alignment = position === "custom" ? 5 : computeAlignment(align, position);
  const styleFields = buildAssStyleFields(family, primaryColourAss, bgHex, {
    bold, italic, underline, alignment, fontsize, strokeColorAss: hexToAssColor(strokeColor), strokeWidth,
  });
  const rest = computeRestPosition(position, positionX, positionY, alignment, width, height);
  // Karaoke's own "animation" (the per-word colour sweep) is driven entirely
  // by the per-word events below, not buildAssAnimationTagInner — passing
  // `undefined` here just keeps this call symmetric with buildAss's prefix.
  const prefix = buildLinePrefix({ animation: undefined, restX: rest.x, restY: rest.y, shadowEnabled, shadowOffsetX, shadowOffsetY, position });
  const highlightInline = hexToAssInlineColor(highlightHex);
  // {\r} (reset to style defaults) clears per-character overrides like shadow
  // set by `prefix`, so words after the highlighted one need it reapplied —
  // \pos/\move themselves aren't per-character state and survive \r fine.
  const resetTag = shadowEnabled ? `{\\r\\xshad${shadowOffsetX}\\yshad${shadowOffsetY}}` : "{\\r}";

  const events: string[] = [];
  for (const line of lines) {
    const words = line.words;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const start = word.start;
      // Always the NEXT word's own start (never word.end extended further via
      // max()) — Whisper's word timestamps can slightly overlap, and using
      // max() there let this event's window bleed past where the next word's
      // own event already begins, so libass rendered both simultaneously
      // (stacked/garbled text on screen). Capping at the next word's start
      // both fills genuine silence gaps AND guarantees no overlap.
      const end = i === words.length - 1 ? line.end : (words[i + 1]?.start ?? line.end);
      if (end <= start) continue;

      // Manual join (not .map().join(" ")) so a forced 2-line break can be
      // inserted as a literal \N at line.lineBreakAfterIndex instead of a
      // plain space — a whole-string escapeAssText pass isn't used here
      // (each word is escaped individually), so \N must be added by hand.
      let text = "";
      words.forEach((w, idx) => {
        const wordText = uppercase ? w.text.toUpperCase() : w.text;
        text +=
          idx === i
            ? `{\\c${highlightInline}\\b1\\fscx112\\fscy112}${escapeAssText(wordText)}${resetTag}`
            : escapeAssText(wordText);
        if (idx < words.length - 1) {
          text += idx === line.lineBreakAfterIndex ? "\\N" : " ";
        }
      });
      events.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${prefix}${text}`);
    }
  }

  return buildAssDocument(width, height, styleFields, events.join("\n"));
}

/**
 * drawtext equivalent of computeRestPosition — headline has no ASS
 * Alignment/Margin fields to lean on, so "top"/"middle"/"bottom" resolve to
 * explicit expressions here instead. `text_w`/`text_h` are drawtext's own
 * runtime variables (the rendered text's measured size), so these stay
 * correct regardless of font/size/content. "custom" centers the text on the
 * percent-of-frame point, matching subtitle's custom-position behavior.
 */
function computeHeadlineBasePosition(
  position: string | undefined,
  positionX: number,
  positionY: number,
  align: string | undefined
): { xExpr: string; yExpr: string } {
  if (position === "custom") {
    return {
      xExpr: `w*(${positionX}/100)-text_w/2`,
      yExpr: `h*(${positionY}/100)-text_h/2`,
    };
  }
  const xExpr = align === "left" ? "20" : align === "right" ? "w-text_w-20" : "(w-text_w)/2";
  if (position === "middle") return { xExpr, yExpr: "(h-text_h)/2" };
  if (position === "bottom") return { xExpr, yExpr: "h-text_h-h*0.06" };
  // "top" and "auto" (headline's default) — the original fixed placement.
  return { xExpr, yExpr: "h*0.06" };
}

/**
 * Cuts [start,end] out of `input`, applies the chosen aspect-ratio crop, effect preset, and
 * optional headline overlay, and writes a web-ready mp4 (H.264 + AAC, faststart) to `output`.
 * Re-encodes rather than stream-copying — the filters (crop/zoom/captions/headline) require it,
 * and it also makes the `-t` cut frame-accurate instead of snapping to the nearest keyframe.
 */
export async function cutClip(options: CutClipOptions): Promise<void> {
  const { input, start, end, output, sourceWidth, sourceHeight, aspectRatio, fitMode, effectPreset } = options;
  const duration = end - start;
  if (duration <= 0) throw new Error("Rentang waktu klip tidak valid.");

  const { width, height, cropWidth, cropHeight } = computeTargetDimensions(aspectRatio, sourceWidth, sourceHeight);
  const filters: string[] = [];
  const tempFiles: string[] = [];

  if (aspectRatio === "original") {
    filters.push(`scale=${width}:${height}`);
  } else if (fitMode === "fit") {
    // Letterbox: scale down to fit ENTIRELY within the target box (no crop),
    // then pad the leftover space with black bars to reach the exact target
    // dimensions — the opposite trade-off from "fill" below (nothing of the
    // source is cut off, but bars appear where the aspect ratios don't match).
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
    );
  } else if (options.cropKeyframes && options.cropKeyframes.length > 0) {
    // Smart crop: the crop window's x/y are driven at runtime by a sendcmd
    // script instead of being fixed — sendcmd must come BEFORE the filter it
    // targets in the chain, and the crop instance needs a name (`@smartcrop`)
    // for the script to address it. Falls through to the static centered
    // crop below whenever no keyframes were found (e.g. no face detected).
    const cmdPath = path.join(path.dirname(output), `${randomUUID()}.cmds`);
    await writeFile(cmdPath, buildSendcmdScript(options.cropKeyframes), "utf-8");
    tempFiles.push(cmdPath);
    const first = options.cropKeyframes[0];
    filters.push(
      `sendcmd=f='${toFilterPath(cmdPath)}'`,
      `crop@smartcrop=${cropWidth}:${cropHeight}:${first.x}:${first.y}`,
      `scale=${width}:${height}`
    );
  } else {
    filters.push(`crop=${cropWidth}:${cropHeight}`, `scale=${width}:${height}`);
  }

  if (effectPreset === "zoom_punch") {
    const fps = 25;
    const targetZoom = 1.15;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const increment = (targetZoom - 1) / totalFrames;
    filters.push(`zoompan=z='min(zoom+${increment.toFixed(6)},${targetZoom})':d=1:s=${width}x${height}:fps=${fps}`);
  } else if (effectPreset === "zoom_out") {
    // Mirror of zoom_punch: starts already zoomed in (via the on==0 branch —
    // zoompan's `on` frame counter is 0-indexed, and its own persistent
    // `zoom` state has no other way to seed a non-1 initial value) and pulls
    // back to 1.0 over the clip's duration.
    const fps = 25;
    const startZoom = 1.15;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const decrement = (startZoom - 1) / totalFrames;
    filters.push(
      `zoompan=z='if(eq(on,0),${startZoom},max(zoom-${decrement.toFixed(6)},1))':d=1:s=${width}x${height}:fps=${fps}`
    );
  } else if (effectPreset === "cinematic_grade") {
    filters.push("eq=contrast=1.15:saturation=1.25:brightness=0.02", "vignette=PI/6");
  } else if (effectPreset === "vintage_warm") {
    filters.push("eq=contrast=1.05:saturation=0.85:brightness=0.02", "colorbalance=rs=0.15:gs=0.05:bs=-0.15", "vignette=PI/5");
  } else if (effectPreset === "black_white") {
    filters.push("eq=contrast=1.05:saturation=0");
  } else if (effectPreset === "vivid_pop") {
    filters.push("eq=contrast=1.12:saturation=1.35:brightness=0.02", "unsharp=5:5:0.8:5:5:0.0");
  }

  // Independent of effectPreset — subtitles can be combined with any visual effect (or none).
  const subtitleAnimation = options.subtitleStyle?.animation;
  const useKaraoke = subtitleAnimation === "karaoke" && (options.captionWordGroups?.length ?? 0) > 0;
  if (useKaraoke || options.captionSegments?.length) {
    const assPath = path.join(path.dirname(output), `${randomUUID()}.ass`);
    const subtitleStyle = options.subtitleStyle;
    const { family } = resolveFont(subtitleStyle?.font, !!subtitleStyle?.bold, !!subtitleStyle?.italic);
    const baseColorHex = resolveColorHex(subtitleStyle?.color);
    const primaryColourAss = hexToAssColor(baseColorHex);
    const bgHex = resolveBackgroundHex(subtitleStyle?.background);
    // Proportional to frame height (matches headline's width/26 approach) —
    // a flat "13" ASS unit against a 1280px-tall 9:16 canvas rendered as
    // barely-readable tiny text regardless of the fontScale slider.
    const fontsize = Math.round((height / 24) * ((subtitleStyle?.fontScale ?? 100) / 100));
    const commonAssStyle = {
      family,
      primaryColourAss,
      bgHex,
      width,
      height,
      bold: !!subtitleStyle?.bold,
      italic: !!subtitleStyle?.italic,
      underline: !!subtitleStyle?.underline,
      align: subtitleStyle?.align,
      fontsize,
      strokeColor: resolveColorHex(subtitleStyle?.strokeColor ?? "000000"),
      strokeWidth: subtitleStyle?.strokeWidth ?? 2,
      shadowEnabled: !!subtitleStyle?.shadowEnabled,
      shadowOffsetX: subtitleStyle?.shadowOffsetX ?? 2,
      shadowOffsetY: subtitleStyle?.shadowOffsetY ?? 2,
      position: subtitleStyle?.position,
      positionX: subtitleStyle?.positionX ?? 50,
      positionY: subtitleStyle?.positionY ?? 85,
      uppercase: !!subtitleStyle?.uppercase,
    };

    const assContent = useKaraoke
      ? buildKaraokeAss(options.captionWordGroups!, {
          ...commonAssStyle,
          highlightHex: resolveColorHex(subtitleStyle?.highlightColor ?? "10B981"),
        })
      : buildAss(options.captionSegments!, {
          ...commonAssStyle,
          animation: subtitleAnimation,
        });

    await writeFile(assPath, assContent, "utf-8");
    tempFiles.push(assPath);
    filters.push(`subtitles='${toFilterPath(assPath)}':fontsdir='${toFilterPath(FONTS_DIR)}'`);
  }

  if (options.headlineText) {
    const headlineStyle = options.headlineStyle;
    const { file: fontFile } = resolveFont(headlineStyle?.font, !!headlineStyle?.bold, !!headlineStyle?.italic);
    const fontPath = path.join(FONTS_DIR, fontFile);
    const textColor = hexToDrawtextColor(resolveColorHex(headlineStyle?.color));
    const bgHex = resolveBackgroundHex(headlineStyle?.background);

    const fontsize = Math.round((width / 26) * ((headlineStyle?.fontScale ?? 100) / 100));
    const maxCharsPerLine = Math.floor((width * 0.88) / (fontsize * 0.55));
    const wrapped = wrapText(options.headlineText.slice(0, 100), maxCharsPerLine, 3);
    const boxParams = bgHex ? `:box=1:boxcolor=${hexToDrawtextColor(bgHex)}@0.6:boxborderw=14` : "";
    // drawtext's own per-LINE alignment (distinct from the x/y expressions
    // below, which only position the text block as a whole) — without this,
    // a wrapped multi-line headline always renders each line flush-left
    // inside that block regardless of the chosen Perataan, since drawtext's
    // default text_align is left.
    const textAlign = headlineStyle?.align === "left" ? "left" : headlineStyle?.align === "right" ? "right" : "center";
    const textAlignParam = (await supportsTextAlign()) ? `:text_align=${textAlign}` : "";
    const baseDrawtextParams =
      `fontfile='${toFilterPath(fontPath)}':fontcolor=${textColor}:` +
      `line_spacing=6:borderw=2:bordercolor=black@0.5${textAlignParam}${boxParams}`;
    const { xExpr, yExpr: baseYExpr } = computeHeadlineBasePosition(
      headlineStyle?.position,
      headlineStyle?.positionX ?? 50,
      headlineStyle?.positionY ?? 6,
      headlineStyle?.align
    );

    // Entrance animations play once, over the clip's first ~0.4s — `t` is
    // already relative to this output clip's own start (verified: ffmpeg
    // rebases PTS after `-ss` input-seeking), not the source video's timeline.
    const animation = headlineStyle?.animation;

    if (animation === "typewriter") {
      // A single drawtext filter can't reveal a growing substring of its own
      // text, so this chains one drawtext per cumulative word-chunk, each
      // gated to only draw during its own time window via `enable`.
      const chunks = buildTypewriterChunks(wrapped).slice(0, 20);
      const revealDuration = Math.min(1.6, Math.max(0.4, chunks.length * 0.12));
      const perChunk = revealDuration / chunks.length;
      chunks.forEach((chunk, i) => {
        const chunkText = escapeDrawtextValue(chunk);
        const tStart = (i * perChunk).toFixed(3);
        const tEnd = i === chunks.length - 1 ? duration.toFixed(3) : ((i + 1) * perChunk).toFixed(3);
        filters.push(
          `drawtext=${baseDrawtextParams}:text='${chunkText}':fontsize=${fontsize}:` +
            `x=${xExpr}:y=${baseYExpr}:enable='between(t\\,${tStart}\\,${tEnd})'`
        );
      });
    } else {
      const text = escapeDrawtextValue(wrapped);
      let fontsizeExpr = `${fontsize}`;
      let alphaParam = "";
      let yExpr = baseYExpr;
      if (animation === "pop") {
        fontsizeExpr = `${fontsize}+max(0\\,(1-t/0.4))*${Math.round(fontsize * 0.6)}`;
      } else if (animation === "fade") {
        alphaParam = ":alpha='min(1\\,t/0.4)'";
      } else if (animation === "slide_up") {
        yExpr = `if(lt(t\\,0.4)\\,(${baseYExpr})+(h*0.18)*(1-t/0.4)\\,(${baseYExpr}))`;
      } else if (animation === "bounce") {
        fontsizeExpr = `${fontsize}*(1-exp(-6*t)*cos(12*t))`;
      }

      filters.push(
        `drawtext=${baseDrawtextParams}:text='${text}':fontsize='${fontsizeExpr}':` +
          `x=${xExpr}:y='${yExpr}'${alphaParam}`
      );
    }
  }

  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y",
      "-ss",
      String(start),
      "-i",
      input,
      "-t",
      String(duration),
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      output,
    ]);
  } finally {
    await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})));
  }
}

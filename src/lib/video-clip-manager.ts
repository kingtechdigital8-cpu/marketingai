import { mkdtemp, writeFile, rm, readFile } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withDbRetry, ensureDbConnection } from "@/lib/with-db-retry";
import { getOpenAiClient } from "@/lib/ai-provider";
import { uploadToR2, deleteFromR2, getR2PublicUrl } from "@/lib/r2";
import {
  probeMetadata,
  extractAudio,
  cutClip,
  computeTargetDimensions,
  type AspectRatio,
  type EffectPreset,
  type CaptionSegment,
  type CaptionWordGroup,
} from "@/lib/ffmpeg";
import { detectSpeakerCropPath, type CropKeyframe } from "@/lib/video-clip-reframe";
import { downloadYoutubeVideo } from "@/lib/youtube";
import { MAX_VIDEO_BYTES, WORDS_PER_LINE, TRANSCRIPTION_CHUNK_SECONDS } from "@/lib/video-clip-options";
import type { FitMode } from "@/lib/video-clip-asset-options";
import {
  markVideoClipBatchStatus,
  completeVideoClipAnalysis,
  refundVideoClipBatch,
  markGenerationProcessing,
  completeGeneration,
  refundFailedGeneration,
} from "@/lib/credit";

const RECONCILE_INTERVAL_MS = 60_000;
// Local jobs (our own ffmpeg/Whisper calls) are far faster than fal.ai's queue,
// so a much shorter staleness window than fal-job.ts's 1 hour is appropriate —
// anything stuck this long almost certainly died with the server process.
const MAX_PROCESSING_MS = 30 * 60 * 1000;
// How long an abandoned batch (moments found, but the user never confirmed
// Phase B) keeps its source video in R2 before cleanup reclaims the storage.
const SOURCE_RETENTION_MS = 48 * 60 * 60 * 1000;

// The OpenAI SDK's own default request timeout is 10 minutes — far too long
// for a single short headline/caption completion. Without this, a network
// hiccup on the AI provider's end silently stalls the whole clip (no ffmpeg
// process, no error, just an idle wait) for up to 10 minutes per call, twice
// per clip (headline + caption) — observed directly stuck this way in prod.
const HEADLINE_CAPTION_TIMEOUT_MS = 30_000;

const MIN_MOMENT_SECONDS = 60;
// The only upper bound — deliberately generous and framed to the LLM as a
// safety ceiling, not a target (see the prompt below). A user complained
// clips were getting cut off mid-point because this used to be a much
// smaller hard cap (120s) that trimToMaxDuration enforced unconditionally,
// truncating moments regardless of whether the argument actually needed more
// room to reach its conclusion — that's real content loss, not just an
// oversized clip. This ceiling now only exists to catch a truly pathological
// LLM response (e.g. picking half the video), not to police normal moments.
const HARD_MAX_MOMENT_SECONDS = 240;

export interface Moment {
  index: number;
  start: number;
  end: number;
  label: string;
  snippet: string;
}

interface RawMoment {
  start?: unknown;
  end?: unknown;
  label?: unknown;
  snippet?: unknown;
  endQuote?: unknown;
}

type QueueJob =
  | { kind: "analysis"; batchId: string }
  | { kind: "youtube-acquire"; batchId: string; youtubeUrl: string }
  | { kind: "clips"; batchId: string; items: { generationId: string; momentIndex: number }[] };

/** True if `time` lands strictly inside a segment (not exactly at a boundary already). */
function snapStartToSegment(time: number, segments: TranscriptSegment[]): number {
  const containing = segments.find((s) => s.start <= time && time < s.end);
  return containing ? containing.start : time;
}
function snapEndToSegment(time: number, segments: TranscriptSegment[]): number {
  const containing = segments.find((s) => s.start < time && time <= s.end);
  return containing ? containing.end : time;
}
/** Same idea at word granularity — the last safety net so a boundary can never land mid-word regardless of which code path produced it. Only ever extends a range, never shrinks it. */
function snapStartToWord(time: number, words: TranscriptWord[]): number {
  const containing = words.find((w) => w.start <= time && time < w.end);
  return containing ? containing.start : time;
}
function snapEndToWord(time: number, words: TranscriptWord[]): number {
  const containing = words.find((w) => w.start < time && time <= w.end);
  return containing ? containing.end : time;
}

/** Truncates on a whitespace boundary (never mid-word) instead of a raw character slice. */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

// When every transcription chunk throws (as opposed to genuinely coming back
// empty), the real cause is almost always account/quota-level rather than
// content-level — surfacing that distinction (instead of collapsing it into
// "tidak ada suara") is what makes an outage like an exhausted API key
// diagnosable straight from the batch's error message in the UI.
function describeTranscriptionError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  const code = (err as { code?: string } | null)?.code;
  const type = (err as { type?: string } | null)?.type;

  if (status === 429 && (code === "credit_balance_exhausted" || type === "insufficient_quota")) {
    return "Gagal mentranskrip audio: saldo API OpenAI (Whisper) sudah habis. Hubungi admin untuk menambah saldo/API key.";
  }
  if (status === 429) {
    return "Gagal mentranskrip audio: API Whisper sedang dibatasi (rate limit). Coba lagi beberapa saat lagi.";
  }

  const message = err instanceof Error ? err.message : String(err);
  return `Gagal mentranskrip audio video: ${message.slice(0, 200)}`;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves the moment-finder's `endQuote` (a literal quote of the closing
 * sentence it intends the moment to end on) to that segment's real end
 * timestamp. Exists because gpt-4o-mini reliably identifies the RIGHT
 * closing line in the transcript text but is unreliable at converting that
 * into an accurate numeric `end` over a long transcript — it tends to settle
 * on a duration that "feels" complete rather than actually verifying nothing
 * relevant follows, cutting the real conclusion off. Text-matching the quote
 * back to a segment sidesteps that numeric-reasoning weakness entirely.
 * Returns the LATEST matching segment (a short closing phrase can recur
 * earlier in casual speech) — null if the quote is missing/too short/unmatched.
 */
function resolveSegmentEndFromQuote(quote: string | undefined, segments: TranscriptSegment[]): number | null {
  if (!quote) return null;
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < 8) return null;
  let best: TranscriptSegment | null = null;
  for (const seg of segments) {
    const normalizedSeg = normalizeForMatch(seg.text);
    if (!normalizedSeg) continue;
    if (normalizedSeg.includes(normalizedQuote) || normalizedQuote.includes(normalizedSeg)) {
      if (!best || seg.end > best.end) best = seg;
    }
  }
  return best ? best.end : null;
}

// Distinctive Indonesian wrap-up/summary signposts — deliberately multi-word
// phrases (not a bare "jadi", which is an extremely common casual connector
// used constantly for non-concluding reasons too) to keep false positives low.
const CONCLUSION_MARKERS: RegExp[] = [
  /^jadi kalau dirangkum\b/i,
  /^kalau dirangkum\b/i,
  /^kesimpulannya\b/i,
  /^intinya\b/i,
  /^pada akhirnya\b/i,
  /^singkatnya\b/i,
  /^untuk merangkum\b/i,
  /^sebagai kesimpulan\b/i,
  /^untuk kesimpulan\b/i,
];

/**
 * Deterministic safety net for a real failure mode observed with gpt-4o-mini
 * (the configured moment-finder model): even with explicit "read ahead
 * before committing to end" prompting and the endQuote mechanism above, it
 * reliably stops right after a plausible-sounding mid-point (e.g. right
 * after naming the last item in a list) instead of continuing to the
 * explicit wrap-up sentence that follows shortly after. If a segment
 * starting with a clear conclusion marker appears within a short lookahead
 * window past the current `end`, this pulls the boundary forward to include
 * it — and keeps pulling in the immediately-following segment(s) too as long
 * as the marker segment's own text doesn't end on terminal punctuation
 * (Whisper often splits one long summary sentence, e.g. a comma-separated
 * list of points, across several segments), stopping the moment it does or a
 * real pause (>5s gap) appears, so it doesn't run on into unrelated content
 * that happens to follow immediately after the conclusion.
 */
function extendToNearbyConclusion(end: number, segments: TranscriptSegment[]): number {
  const LOOKAHEAD_SECONDS = 45;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const markerIndex = sorted.findIndex(
    (seg) =>
      seg.start >= end &&
      seg.start <= end + LOOKAHEAD_SECONDS &&
      CONCLUSION_MARKERS.some((re) => re.test(seg.text.trim()))
  );
  if (markerIndex === -1) return end;

  let newEnd = sorted[markerIndex].end;
  let text = sorted[markerIndex].text.trim();
  for (let i = markerIndex + 1; i < sorted.length && !/[.!?]$/.test(text); i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap > 5) break;
    newEnd = sorted[i].end;
    text = sorted[i].text.trim();
  }
  return newEnd;
}

/**
 * The model doesn't reliably find a matching stretch of dialogue as long as
 * MIN_MOMENT_SECONDS on its own — pads a too-short moment with surrounding
 * context (mostly by extending forward, falling back to extending backward
 * near the end of the video). Extension walks whole segments (not raw
 * seconds) so the padded boundary still lands on a natural pause instead of
 * cutting into the middle of the next/previous sentence.
 */
function expandToMinDuration(
  start: number,
  end: number,
  durationSeconds: number,
  segments: TranscriptSegment[]
): { start: number; end: number } {
  let s = start;
  let e = end;

  if (e - s < MIN_MOMENT_SECONDS) {
    const forward = segments.filter((seg) => seg.start >= e).sort((a, b) => a.start - b.start);
    for (const seg of forward) {
      e = seg.end;
      if (e - s >= MIN_MOMENT_SECONDS) break;
    }
  }
  if (e - s < MIN_MOMENT_SECONDS) {
    const backward = segments.filter((seg) => seg.end <= s).sort((a, b) => b.start - a.start);
    for (const seg of backward) {
      s = seg.start;
      if (e - s >= MIN_MOMENT_SECONDS) break;
    }
  }
  // Not enough surrounding segments to reach the minimum (e.g. near a video
  // edge with a sparse transcript) — falls back to raw-second padding; the
  // word-level snap applied by the caller afterwards still keeps this safe.
  if (e - s < MIN_MOMENT_SECONDS) {
    const needed = MIN_MOMENT_SECONDS - (e - s);
    const newEnd = Math.min(durationSeconds, e + needed);
    const remaining = MIN_MOMENT_SECONDS - (newEnd - s);
    s = remaining > 0 ? Math.max(0, s - remaining) : s;
    e = newEnd;
  }

  return { start: Math.max(0, s), end: Math.min(durationSeconds, e) };
}

/** Only trims a moment down when it blows past HARD_MAX_MOMENT_SECONDS (a pathological-response safety net, not routine policing) — and even then, at the end of the LAST whole segment that still fits, instead of a hard time cutoff that could land mid-sentence. */
function trimToMaxDuration(start: number, end: number, segments: TranscriptSegment[]): number {
  if (end - start <= HARD_MAX_MOMENT_SECONDS) return end;
  const withinRange = segments
    .filter((seg) => seg.start >= start && seg.end <= start + HARD_MAX_MOMENT_SECONDS)
    .sort((a, b) => a.end - b.end);
  if (withinRange.length > 0) return withinRange[withinRange.length - 1].end;
  return start + HARD_MAX_MOMENT_SECONDS;
}

function sanitizeMoments(
  raw: RawMoment[],
  durationSeconds: number,
  requestedCount: number,
  segments: TranscriptSegment[],
  words: TranscriptWord[]
): Moment[] {
  const cleaned = raw
    .map((m) => ({
      start: Number(m.start),
      end: Number(m.end),
      label: String(m.label ?? "").slice(0, 80) || "Momen",
      snippet: truncateAtWordBoundary(String(m.snippet ?? ""), 300),
      endQuote: typeof m.endQuote === "string" ? m.endQuote : undefined,
    }))
    .filter((m) => Number.isFinite(m.start) && Number.isFinite(m.end) && m.end > m.start)
    .map((m) => {
      const clampedStart = Math.max(0, m.start);
      // Prefer wherever endQuote's closing sentence actually lands over the
      // model's own raw `end` guess, whenever that's LATER — see
      // resolveSegmentEndFromQuote for why. Never used to shrink a range.
      const quoteEnd = resolveSegmentEndFromQuote(m.endQuote, segments);
      const rawEnd = Math.min(durationSeconds, Math.max(m.end, quoteEnd ?? 0));
      // Deterministic nudge for the "stopped just short of the actual
      // wrap-up" failure mode — see extendToNearbyConclusion.
      const clampedEnd = Math.min(durationSeconds, extendToNearbyConclusion(rawEnd, segments));
      const snappedStart = snapStartToSegment(clampedStart, segments);
      const snappedEnd = snapEndToSegment(clampedEnd, segments);
      const { start: expandedStart, end: expandedEnd } = expandToMinDuration(snappedStart, snappedEnd, durationSeconds, segments);
      const trimmedEnd = trimToMaxDuration(expandedStart, expandedEnd, segments);
      // Final safety net regardless of which path above produced these
      // bounds — never let either edge land inside a word.
      const start = snapStartToWord(expandedStart, words);
      const end = snapEndToWord(trimmedEnd, words);
      return { label: m.label, snippet: m.snippet, start, end };
    })
    // Safety net — a moment can still end up short if the whole video itself
    // is under MIN_MOMENT_SECONDS long, since expansion can't invent footage.
    .filter((m) => m.end - m.start >= MIN_MOMENT_SECONDS)
    .sort((a, b) => a.start - b.start);

  // Greedy overlap removal — keeps the earliest-starting moment of any pair
  // that overlaps, since the model was asked for non-overlapping ranges but
  // isn't guaranteed to actually deliver that.
  const nonOverlapping: typeof cleaned = [];
  for (const m of cleaned) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (last && m.start < last.end) continue;
    nonOverlapping.push(m);
  }

  return nonOverlapping.slice(0, requestedCount).map((m, index) => ({ index, ...m }));
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

interface StoredTranscript {
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}

/**
 * `VideoClipBatch.transcript` used to store a bare `TranscriptSegment[]`
 * before word-level timestamps were added for the karaoke animation — reads
 * of rows written before this change would otherwise crash Phase B for any
 * batch still sitting in MOMENTS_FOUND across the deploy.
 */
function normalizeStoredTranscript(raw: unknown): StoredTranscript {
  if (Array.isArray(raw)) return { segments: raw as TranscriptSegment[], words: [] };
  const obj = raw as Partial<StoredTranscript> | null;
  return { segments: obj?.segments ?? [], words: obj?.words ?? [] };
}

/**
 * The actual full spoken text for a moment's [start,end] range, used to feed
 * headline/social-caption generation — moment.snippet is just a short quote
 * the moment-finder LLM happened to pick, truncated to 300 chars, which can
 * miss the line that would actually make the best hook. This reconstructs
 * everything really said in the clip so the copywriting LLM has the full
 * picture to work from.
 */
function buildFullTranscriptTextForMoment(transcript: TranscriptSegment[], moment: Moment): string {
  return transcript
    .filter((seg) => seg.end > moment.start && seg.start < moment.end)
    .map((seg) => seg.text.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Builds real, speech-synced subtitles for a clip from the full-video Whisper
 * transcript — filters to segments overlapping the moment's [start,end] range
 * and re-offsets their timestamps to be relative to the clip's own start
 * (0 = clip start, not the source video's start).
 */
function buildCaptionSegmentsForMoment(transcript: TranscriptSegment[], moment: Moment): CaptionSegment[] {
  return transcript
    .filter((seg) => seg.end > moment.start && seg.start < moment.end)
    .map((seg) => ({
      start: Math.max(0, seg.start - moment.start),
      end: Math.min(moment.end - moment.start, seg.end - moment.start),
      text: seg.text.trim(),
    }))
    .filter((seg) => seg.text.length > 0 && seg.end > seg.start);
}

/**
 * Always-on resegmentation (there's no more "raw Whisper segment" mode):
 * groups per-word timestamps into short fixed-size chunks so a cue never
 * outgrows the screen — `lineCount` 1 caps each chunk at `wordsPerLine`
 * words on one line, `lineCount` 2 allows up to 2×wordsPerLine words but
 * forces an explicit break (`\n`, converted to ASS `\N` by escapeAssText)
 * after the first `wordsPerLine` words rather than relying on auto-wrap.
 * Each chunk's visible window is extended up to the NEXT chunk's start (not
 * just its own last word's end) so consecutive short captions don't
 * flicker/gap between each other.
 */
function buildChunkedCaptionsForMoment(
  words: TranscriptWord[],
  moment: Moment,
  wordsPerLine: number,
  lineCount: number
): CaptionSegment[] {
  const relevant = words
    .filter((w) => w.end > moment.start && w.start < moment.end)
    .map((w) => ({
      start: Math.max(0, w.start - moment.start),
      end: Math.min(moment.end - moment.start, w.end - moment.start),
      text: w.word.trim(),
    }))
    .filter((w) => w.text.length > 0 && w.end > w.start)
    .sort((a, b) => a.start - b.start);

  const chunkSize = wordsPerLine * lineCount;
  const out: CaptionSegment[] = [];
  for (let i = 0; i < relevant.length; i += chunkSize) {
    const chunk = relevant.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const nextChunkStart = relevant[i + chunkSize]?.start;
    const firstLine = chunk.slice(0, wordsPerLine).map((w) => w.text).join(" ");
    const secondLine = chunk.slice(wordsPerLine).map((w) => w.text).join(" ");
    out.push({
      start: chunk[0].start,
      end: nextChunkStart ?? chunk[chunk.length - 1].end,
      text: lineCount === 2 && secondLine ? `${firstLine}\n${secondLine}` : chunk.map((w) => w.text).join(" "),
    });
  }
  return out;
}

/** Same chunking, applied to karaoke's word groups instead of plain caption segments. */
function chunkWordGroups(lines: CaptionWordGroup[], wordsPerLine: number, lineCount: number): CaptionWordGroup[] {
  const chunkSize = wordsPerLine * lineCount;
  const out: CaptionWordGroup[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.words.length; i += chunkSize) {
      const chunk = line.words.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      out.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        words: chunk,
        lineBreakAfterIndex: lineCount === 2 && chunk.length > wordsPerLine ? wordsPerLine - 1 : undefined,
      });
    }
  }
  return out;
}

/**
 * Groups per-word Whisper timestamps into the same lines used for normal
 * subtitles (matching each word to the segment whose range contains it),
 * offset to be clip-relative — needed for the karaoke word-highlight
 * animation, which requires knowing each individual word's own [start,end].
 */
function buildKaraokeLinesForMoment(
  segments: TranscriptSegment[],
  words: TranscriptWord[],
  moment: Moment
): CaptionWordGroup[] {
  return segments
    .filter((seg) => seg.end > moment.start && seg.start < moment.end)
    .map((seg) => {
      const lineStart = Math.max(0, seg.start - moment.start);
      const lineEnd = Math.min(moment.end - moment.start, seg.end - moment.start);
      const lineWords = words
        .filter((w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05)
        .map((w) => ({
          start: Math.max(0, w.start - moment.start),
          end: Math.min(moment.end - moment.start, w.end - moment.start),
          text: w.word.trim(),
        }))
        .filter((w) => w.text.length > 0 && w.end > w.start);
      return { start: lineStart, end: lineEnd, words: lineWords };
    })
    .filter((line) => line.end > line.start && line.words.length > 0);
}

class VideoClipManager {
  private queue: QueueJob[] = [];
  private draining = false;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private booted = false;

  enqueueAnalysis(batchId: string) {
    this.queue.push({ kind: "analysis", batchId });
    this.drain();
  }

  enqueueYoutubeAcquisition(batchId: string, youtubeUrl: string) {
    this.queue.push({ kind: "youtube-acquire", batchId, youtubeUrl });
    this.drain();
  }

  enqueueClipBatchGeneration(batchId: string, items: { generationId: string; momentIndex: number }[]) {
    this.queue.push({ kind: "clips", batchId, items });
    this.drain();
  }

  private drain() {
    if (this.draining) return;
    this.draining = true;
    (async () => {
      let job: QueueJob | undefined;
      while ((job = this.queue.shift())) {
        try {
          if (job.kind === "analysis") await this.runAnalysis(job.batchId);
          else if (job.kind === "youtube-acquire") await this.runYoutubeAcquisition(job.batchId, job.youtubeUrl);
          else await this.runClipGeneration(job.batchId, job.items);
        } catch (err) {
          console.error("[video-clip] job failed:", err);
        }
      }
      this.draining = false;
    })();
  }

  private async runAnalysis(batchId: string) {
    const batch = await prisma.videoClipBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.status !== "PENDING" || !batch.sourceVideoKey) return;

    const tempDir = await mkdtemp(path.join(tmpdir(), "videoclip-"));
    const videoPath = path.join(tempDir, "source.mp4");

    try {
      const sourceRes = await fetch(getR2PublicUrl(batch.sourceVideoKey));
      if (!sourceRes.ok) throw new Error("Gagal mengunduh video sumber untuk dianalisis.");
      await writeFile(videoPath, Buffer.from(await sourceRes.arrayBuffer()));

      await this.analyzeLocalVideo(batch, videoPath, tempDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menganalisis video.";
      console.error(`[video-clip] analysis failed for batch ${batchId}:`, err);
      await refundVideoClipBatch({ batchId, errorMessage: message.slice(0, 500) });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Downloading a YouTube video can take a while for longer videos — this
   * runs entirely in the background (unlike the upload path, where the bytes
   * are already local by the time the POST request is handled), so a long
   * video never risks the HTTP request itself timing out.
   */
  private async runYoutubeAcquisition(batchId: string, youtubeUrl: string) {
    const batch = await prisma.videoClipBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.status !== "PENDING") return;

    const tempDir = await mkdtemp(path.join(tmpdir(), "videoclip-"));

    try {
      let videoPath: string;
      try {
        videoPath = await downloadYoutubeVideo(youtubeUrl, tempDir);
      } catch (err) {
        console.error(`[video-clip] YouTube download failed for batch ${batchId}:`, err);
        throw err instanceof Error
          ? err
          : new Error("Gagal mengunduh video dari YouTube. Coba link lain atau unggah videonya langsung.");
      }

      const stats = await readFile(videoPath).then((b) => b.byteLength);
      if (stats > MAX_VIDEO_BYTES) {
        throw new Error("Ukuran video melebihi batas 300MB.");
      }

      const ext = path.extname(videoPath).slice(1).toLowerCase() || "mp4";
      const contentType = ext === "webm" ? "video/webm" : ext === "mkv" ? "video/x-matroska" : "video/mp4";
      const key = `video-clips/${batch.userId}/sources/${batch.id}.${ext}`;
      const buffer = await readFile(videoPath);
      await uploadToR2(buffer, key, contentType);
      await withDbRetry(() => prisma.videoClipBatch.update({ where: { id: batchId }, data: { sourceVideoKey: key } }));

      await this.analyzeLocalVideo({ ...batch, sourceVideoKey: key }, videoPath, tempDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengunduh video dari YouTube.";
      console.error(`[video-clip] YouTube acquisition failed for batch ${batchId}:`, err);
      await refundVideoClipBatch({ batchId, errorMessage: message.slice(0, 500) });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Shared by both acquisition paths once a local video file is available. Caller owns tempDir cleanup. */
  private async analyzeLocalVideo(
    batch: NonNullable<Awaited<ReturnType<typeof prisma.videoClipBatch.findUnique>>>,
    videoPath: string,
    tempDir: string
  ) {
    const batchId = batch.id;

    await markVideoClipBatchStatus(batchId, "TRANSCRIBING");

    const { client: whisperClient, model: whisperModel } = await getOpenAiClient("openai-whisper");

    // Longer sources (see TRANSCRIPTION_CHUNK_SECONDS) get split into pieces
    // before transcription — a single request's audio must stay under
    // Whisper's 25MB limit, which the extraction bitrate blows past somewhere
    // past ~55 minutes. Each chunk's timestamps come back relative to ITS OWN
    // start, so they're re-offset by the chunk's start time before merging —
    // a word/sentence landing exactly on a chunk boundary can come out
    // slightly awkward, but sanitizeMoments' segment/word snapping already
    // treats transcript boundaries as approximate, so that's an acceptable
    // trade-off for supporting multi-hour sources at all.
    const chunkRanges: { start: number; duration: number }[] = [];
    if (batch.durationSeconds <= TRANSCRIPTION_CHUNK_SECONDS) {
      chunkRanges.push({ start: 0, duration: batch.durationSeconds });
    } else {
      for (let start = 0; start < batch.durationSeconds; start += TRANSCRIPTION_CHUNK_SECONDS) {
        chunkRanges.push({ start, duration: Math.min(TRANSCRIPTION_CHUNK_SECONDS, batch.durationSeconds - start) });
      }
    }

    const transcriptSegments: TranscriptSegment[] = [];
    const transcriptWords: TranscriptWord[] = [];
    const chunkErrors: unknown[] = [];
    for (let i = 0; i < chunkRanges.length; i++) {
      const { start, duration } = chunkRanges[i];
      const chunkAudioPath = path.join(tempDir, `audio-${i}.mp3`);
      try {
        await extractAudio(videoPath, chunkAudioPath, chunkRanges.length > 1 ? { start, duration } : undefined);
        const transcription = await whisperClient.audio.transcriptions.create({
          file: createReadStream(chunkAudioPath),
          model: whisperModel,
          response_format: "verbose_json",
          timestamp_granularities: ["segment", "word"],
        });
        for (const s of transcription.segments ?? []) {
          transcriptSegments.push({ start: s.start + start, end: s.end + start, text: s.text.trim() });
        }
        for (const w of transcription.words ?? []) {
          transcriptWords.push({ start: w.start + start, end: w.end + start, word: w.word });
        }
      } catch (err) {
        // A single chunk (most often a near-empty tail sliver a few seconds
        // long) can fail to decode — e.g. a source whose audio track ends
        // slightly before its video track, which a chunk boundary landing in
        // that trailing gap has nothing to transcribe. Failing the ENTIRE
        // multi-chunk job over one such sliver would make long videos far
        // more fragile than short ones ever were, so this chunk is just
        // skipped — the rest of the transcript still comes through, and the
        // length check below still catches a batch where NOTHING transcribed
        // (and distinguishes a real per-chunk failure like an exhausted API
        // key from a genuinely silent video, instead of collapsing both into
        // the same misleading "no speech" message).
        console.error(`[video-clip] chunk ${i} (${start}s-${start + duration}s) failed to transcribe, skipping:`, err);
        chunkErrors.push(err);
      } finally {
        await rm(chunkAudioPath, { force: true }).catch(() => {});
      }
    }
    if (transcriptSegments.length === 0) {
      if (chunkErrors.length > 0) {
        throw new Error(describeTranscriptionError(chunkErrors[0]));
      }
      throw new Error("Tidak ada suara/percakapan yang terdeteksi di video ini.");
    }

    await markVideoClipBatchStatus(batchId, "FINDING_MOMENTS");

    const transcriptLines = transcriptSegments
      .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${s.text.trim()}`)
      .join("\n");
    const { client: textClient, model: textModel } = await getOpenAiClient("openai-text");
    const completion = await textClient.chat.completions.create({
      model: textModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Anda menganalisis transkrip video (dengan timestamp per segmen) untuk menemukan momen yang cocok dengan " +
            "permintaan pengguna. Tugas Anda BUKAN mencari momen sependek mungkin — tugas Anda adalah menemukan rentang " +
            "yang membuat argumen/poin pembicaraan terasa TUNTAS saat ditonton berdiri sendiri, seberapapun panjangnya " +
            "itu perlu. Jawab HANYA dalam format JSON.",
        },
        {
          role: "user",
          content:
            `Transkrip video (durasi total ${batch.durationSeconds} detik):\n${transcriptLines}\n\n` +
            `Temukan hingga ${batch.requestedCount} momen berbeda (tidak boleh tumpang tindih) yang paling cocok ` +
            `dengan permintaan ini: "${batch.momentQuery}".\n\n` +
            `CARA MENENTUKAN AKHIR MOMEN (WAJIB DIIKUTI PERSIS):\n` +
            `1. Baca TERUS ke segmen-segmen berikutnya sampai Anda benar-benar menemukan kalimat PENUTUP/KESIMPULAN dari ` +
            `pembahasan itu (biasanya diawali "jadi...", "intinya...", "kesimpulannya...", "pada akhirnya...") ATAU ` +
            `topiknya jelas-jelas berganti. JANGAN berhenti membaca hanya karena sudah menemukan beberapa poin/alasan — ` +
            `banyak pembahasan punya alasan/langkah tambahan SEBELUM kalimat penutupnya benar-benar muncul. Kesalahan ` +
            `paling fatal adalah berhenti sebelum kalimat penutup itu, sehingga pembahasan terasa terpotong/menggantung.\n` +
            `2. Salin PERSIS kalimat penutup itu (atau kalimat terakhir yang relevan jika tidak ada kalimat penutup ` +
            `eksplisit) ke field "endQuote" — salin apa adanya dari transkrip, jangan diparafrase.\n` +
            `3. Field "end" harus sama dengan timestamp akhir segmen yang memuat "endQuote" tersebut.\n` +
            `4. Batasan durasi HANYA: minimal ${MIN_MOMENT_SECONDS} detik, maksimal ${HARD_MAX_MOMENT_SECONDS} detik. ` +
            `TIDAK ADA target durasi "ideal" di antara itu — momen 200 detik yang mencapai kalimat penutupnya jauh lebih ` +
            `baik daripada momen 115 detik yang terpotong sebelum kesimpulannya selesai.\n\n` +
            `Urutkan dari yang paling relevan. Jika tidak ada momen yang cocok, kembalikan array kosong.\n\n` +
            `Balas persis dalam format JSON ini:\n` +
            `{"moments": [{"start": <detik>, "end": <detik>, "label": "<judul singkat 3-6 kata>", ` +
            `"snippet": "<kutipan relevan dari transkrip>", "endQuote": "<kalimat penutup persis, lihat instruksi di atas>"}]}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("AI tidak menghasilkan hasil analisis.");
    let parsed: { moments?: RawMoment[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gagal membaca hasil analisis AI.");
    }
    const moments = sanitizeMoments(
      Array.isArray(parsed.moments) ? parsed.moments : [],
      batch.durationSeconds,
      batch.requestedCount,
      transcriptSegments,
      transcriptWords
    );

    // Kept so Phase B can build real speech-synced subtitles per clip (see
    // buildCaptionSegmentsForMoment) instead of guessing at timing — words[]
    // is the same call's per-word breakdown, used only for the karaoke
    // word-highlight animation (see buildKaraokeLinesForMoment).
    const transcript: StoredTranscript = { segments: transcriptSegments, words: transcriptWords };

    await completeVideoClipAnalysis({
      batchId,
      moments: moments as unknown as Prisma.InputJsonValue,
      transcript: transcript as unknown as Prisma.InputJsonValue,
    });
  }

  private async runClipGeneration(batchId: string, items: { generationId: string; momentIndex: number }[]) {
    const batch = await prisma.videoClipBatch.findUnique({ where: { id: batchId } });
    if (!batch || !batch.sourceVideoKey) {
      for (const item of items) {
        await refundFailedGeneration({
          generationId: item.generationId,
          errorMessage: "Video sumber tidak ditemukan.",
        });
      }
      return;
    }

    const moments = (batch.moments as unknown as Moment[]) ?? [];
    const { segments: transcript, words: transcriptWords } = normalizeStoredTranscript(batch.transcript);
    const tempDir = await mkdtemp(path.join(tmpdir(), "videoclip-"));
    const videoPath = path.join(tempDir, "source.mp4");

    try {
      const sourceRes = await fetch(getR2PublicUrl(batch.sourceVideoKey));
      if (!sourceRes.ok) throw new Error("Gagal mengunduh video sumber.");
      await writeFile(videoPath, Buffer.from(await sourceRes.arrayBuffer()));
      const { width: sourceWidth, height: sourceHeight } = await probeMetadata(videoPath);

      for (const item of items) {
        const moment = moments.find((m) => m.index === item.momentIndex);
        if (!moment) {
          await refundFailedGeneration({ generationId: item.generationId, errorMessage: "Momen tidak ditemukan." });
          continue;
        }

        const clipOutputPath = path.join(tempDir, `${item.generationId}.mp4`);
        try {
          await markGenerationProcessing(item.generationId);

          const momentFullText = buildFullTranscriptTextForMoment(transcript, moment);

          let headlineText: string | null = null;
          if (batch.headlineEnabled) {
            headlineText = await this.generateHeadline(moment, momentFullText);
          }

          let socialCaption: string | null = null;
          if (batch.socialCaptionEnabled) {
            socialCaption = await this.generateSocialCaption(moment, momentFullText);
          }

          // "two" (and any legacy/unrecognized value) falls back to 2-line
          // chunking — only the exact "one" value is capped to a single line.
          const lineCount = batch.subtitleLineMode === "one" ? 1 : 2;

          let captionSegments: CaptionSegment[] | undefined;
          let captionWordGroups: CaptionWordGroup[] | undefined;
          if (batch.subtitleEnabled) {
            if (batch.subtitleAnimation === "karaoke") {
              captionWordGroups = buildKaraokeLinesForMoment(transcript, transcriptWords, moment);
              if (captionWordGroups.length > 0) {
                captionWordGroups = chunkWordGroups(captionWordGroups, WORDS_PER_LINE, lineCount);
              }
            }
            // Karaoke falls back to the plain segment track if this batch's
            // transcript predates word-level timestamps, or the moment simply
            // has no word data (e.g. silence) to build a highlight from. Chunking
            // itself needs word-level timestamps too — legacy batches without
            // them (transcriptWords empty) fall back to raw Whisper segments.
            if (!captionWordGroups?.length) {
              captionSegments =
                transcriptWords.length > 0
                  ? buildChunkedCaptionsForMoment(transcriptWords, moment, WORDS_PER_LINE, lineCount)
                  : buildCaptionSegmentsForMoment(transcript, moment);
            }
          }

          // Only meaningful when a crop is actually happening — "fit"
          // letterboxes (nothing cropped) and "original" never crops either.
          let cropKeyframes: CropKeyframe[] | undefined;
          if (batch.smartCropEnabled && batch.fitMode !== "fit" && batch.aspectRatio !== "original") {
            const { cropWidth, cropHeight } = computeTargetDimensions(
              batch.aspectRatio as AspectRatio,
              sourceWidth,
              sourceHeight
            );
            cropKeyframes =
              (await detectSpeakerCropPath(videoPath, {
                start: moment.start,
                end: moment.end,
                sourceWidth,
                sourceHeight,
                cropWidth,
                cropHeight,
              })) ?? undefined;
          }

          await cutClip({
            input: videoPath,
            start: moment.start,
            end: moment.end,
            output: clipOutputPath,
            sourceWidth,
            sourceHeight,
            aspectRatio: batch.aspectRatio as AspectRatio,
            fitMode: batch.fitMode as FitMode,
            cropKeyframes,
            effectPreset: (batch.effectPreset as EffectPreset) ?? null,
            headlineText,
            headlineStyle: {
              font: batch.headlineFont,
              color: batch.headlineColor,
              background: batch.headlineBackground,
              animation: batch.headlineAnimation,
              bold: batch.headlineBold,
              italic: batch.headlineItalic,
              align: batch.headlineAlign,
              fontScale: batch.headlineFontScale,
              position: batch.headlinePosition,
              positionX: batch.headlinePositionX,
              positionY: batch.headlinePositionY,
            },
            captionSegments,
            captionWordGroups,
            subtitleStyle: {
              font: batch.subtitleFont,
              color: batch.subtitleColor,
              background: batch.subtitleBackground,
              animation: batch.subtitleAnimation,
              bold: batch.subtitleBold,
              italic: batch.subtitleItalic,
              underline: batch.subtitleUnderline,
              align: batch.subtitleAlign,
              fontScale: batch.subtitleFontScale,
              uppercase: batch.subtitleUppercase,
              strokeColor: batch.subtitleStrokeColor,
              strokeWidth: batch.subtitleStrokeWidth,
              shadowEnabled: batch.subtitleShadowEnabled,
              shadowOffsetX: batch.subtitleShadowOffsetX,
              shadowOffsetY: batch.subtitleShadowOffsetY,
              position: batch.subtitlePosition,
              positionX: batch.subtitlePositionX,
              positionY: batch.subtitlePositionY,
              highlightColor: batch.subtitleHighlightColor,
            },
          });

          const key = `video-clips/${batch.userId}/${batchId}/${item.generationId}.mp4`;
          const clipBuffer = await readFile(clipOutputPath);
          const clipUrl = await uploadToR2(clipBuffer, key, "video/mp4");

          await completeGeneration({ generationId: item.generationId, content: clipUrl, socialCaption });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Gagal membuat klip.";
          console.error(`[video-clip] clip ${item.generationId} failed:`, err);
          await refundFailedGeneration({ generationId: item.generationId, errorMessage: message.slice(0, 500) });
        } finally {
          await rm(clipOutputPath, { force: true }).catch(() => {});
        }
      }
    } catch (err) {
      // Whole-batch failure (e.g. couldn't even download the source) — every
      // requested item in this call gets refunded since none of them could run.
      const message = err instanceof Error ? err.message : "Gagal memproses batch klip.";
      console.error(`[video-clip] batch generation failed for ${batchId}:`, err);
      for (const item of items) {
        await refundFailedGeneration({ generationId: item.generationId, errorMessage: message.slice(0, 500) });
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** `fullText` is the moment's complete spoken transcript (see buildFullTranscriptTextForMoment) — falls back to the moment-finder's short snippet/label only if that's somehow empty (e.g. legacy batch predating this). */
  private async generateHeadline(moment: Moment, fullText: string): Promise<string | null> {
    try {
      const { client, model } = await getOpenAiClient("openai-text");
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Anda adalah copywriter short-video profesional yang ahli membuat HOOK/headline untuk TikTok, Instagram " +
              "Reels, dan YouTube Shorts. Anda akan diberi transkrip LENGKAP dari satu momen video. Buat SATU judul " +
              "headline (maksimal 8 kata, Bahasa Indonesia) dengan kriteria berikut, urut dari paling penting:\n" +
              "1. AKURAT — harus benar-benar mencerminkan poin/isi utama yang dibahas di transkrip ini. Jangan clickbait " +
              "yang menyesatkan atau tidak sesuai dengan apa yang sebenarnya dibicarakan.\n" +
              "2. HOOK YANG KUAT — pancing rasa penasaran atau emosi penonton dengan salah satu pendekatan yang paling " +
              "cocok untuk isi ini: pertanyaan menggugah, pernyataan mengejutkan/kontroversial, celah rasa penasaran " +
              "(curiosity gap, mis. \"kesalahan yang bikin ...\"), atau angka/list. Pilih pendekatan yang paling pas " +
              "dengan isi transkripnya, jangan dipaksakan.\n" +
              "3. Singkat, padat, dan mudah dibaca sekilas saat overlay di video.\n" +
              "Jawab HANYA dengan teks judulnya, tanpa tanda kutip dan tanpa penjelasan tambahan.",
          },
          { role: "user", content: fullText || moment.snippet || moment.label },
        ],
      }, { timeout: HEADLINE_CAPTION_TIMEOUT_MS });
      const headline = completion.choices[0]?.message?.content?.trim();
      return headline ? headline.slice(0, 100) : null;
    } catch (err) {
      console.error("[video-clip] headline generation failed, continuing without one:", err);
      return null;
    }
  }

  /** A ready-to-paste social caption for the clip's own post (TikTok/Reels/Shorts) — separate from the in-video headline, which is burned into the frame instead. `fullText` is the moment's complete spoken transcript. */
  private async generateSocialCaption(moment: Moment, fullText: string): Promise<string | null> {
    try {
      const { client, model } = await getOpenAiClient("openai-text");
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Anda adalah social media strategist yang ahli membuat caption short-video (TikTok/Instagram Reels/YouTube Shorts) " +
              "yang mudah masuk FYP (For You Page) sesuai pola algoritma short-video saat ini: hook yang menarik perhatian di " +
              "kalimat pertama, singkat dan padat (maksimal sekitar 150 karakter untuk teks utamanya), ajakan interaksi yang " +
              "natural (like/comment/follow/share) — bukan memaksa, boleh pakai emoji secukupnya, lalu diikuti 3-6 hashtag " +
              "relevan (campuran hashtag spesifik niche dan hashtag umum yang sedang ramai). Gunakan Bahasa Indonesia yang " +
              "santai sesuai gaya konten short-video. Jawab HANYA dengan teks caption lengkap (termasuk hashtag di baris " +
              "terpisah di akhir), tanpa penjelasan tambahan atau tanda kutip.",
          },
          {
            role: "user",
            content: `Judul momen: ${moment.label}\nTranskrip lengkap: ${fullText || moment.snippet || moment.label}`,
          },
        ],
      }, { timeout: HEADLINE_CAPTION_TIMEOUT_MS });
      const caption = completion.choices[0]?.message?.content?.trim();
      return caption ? caption.slice(0, 600) : null;
    } catch (err) {
      console.error("[video-clip] social caption generation failed, continuing without one:", err);
      return null;
    }
  }

  async bootstrap() {
    if (this.booted) return;
    this.booted = true;

    try {
      await this.reconcile();
    } catch (err) {
      console.error("[video-clip] initial reconcile failed:", err);
    }

    this.reconcileTimer = setInterval(() => {
      this.reconcile().catch((err) => console.error("[video-clip] reconcile failed:", err));
    }, RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref?.();
  }

  /** Recovers jobs orphaned by a server restart, and bounds R2 storage from abandoned uploads. */
  private async reconcile() {
    await ensureDbConnection();
    const staleCutoff = new Date(Date.now() - MAX_PROCESSING_MS);

    const staleBatches = await prisma.videoClipBatch.findMany({
      where: { status: { in: ["PENDING", "TRANSCRIBING", "FINDING_MOMENTS"] }, createdAt: { lt: staleCutoff } },
    });
    for (const batch of staleBatches) {
      await refundVideoClipBatch({ batchId: batch.id, errorMessage: "Analisis video melebihi batas waktu." });
    }

    const staleClips = await prisma.generation.findMany({
      where: { type: "VIDEO_CLIP", status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lt: staleCutoff } },
    });
    for (const clip of staleClips) {
      await refundFailedGeneration({ generationId: clip.id, errorMessage: "Pembuatan klip melebihi batas waktu." });
    }

    await this.cleanupSourceVideos();
  }

  private async cleanupSourceVideos() {
    const retentionCutoff = new Date(Date.now() - SOURCE_RETENTION_MS);
    const candidates = await prisma.videoClipBatch.findMany({
      where: {
        sourceVideoKey: { not: null },
        OR: [{ status: "FAILED" }, { status: "MOMENTS_FOUND" }],
      },
      include: { clips: { select: { status: true } } },
    });

    for (const batch of candidates) {
      if (!batch.sourceVideoKey) continue;

      const hasClips = batch.clips.length > 0;
      const allClipsTerminal = hasClips && batch.clips.every((c) => c.status === "COMPLETED" || c.status === "FAILED");
      const abandoned = !hasClips && batch.createdAt < retentionCutoff;

      if (batch.status === "FAILED" || allClipsTerminal || abandoned) {
        try {
          await deleteFromR2(batch.sourceVideoKey);
        } catch (err) {
          console.error(`[video-clip] failed to delete source for batch ${batch.id}:`, err);
          continue;
        }
        await withDbRetry(() =>
          prisma.videoClipBatch.update({ where: { id: batch.id }, data: { sourceVideoKey: null } })
        );
      }
    }
  }
}

const globalForVideoClip = globalThis as unknown as { videoClipManager?: VideoClipManager };

export const videoClipManager = globalForVideoClip.videoClipManager ?? new VideoClipManager();

if (process.env.NODE_ENV !== "production") {
  globalForVideoClip.videoClipManager = videoClipManager;
}


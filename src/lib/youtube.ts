import path from "path";
import os from "os";
import { existsSync, writeFileSync } from "fs";
import { YtDlp } from "ytdlp-nodejs";
import ffmpegBinPath from "ffmpeg-static";

// Reuses our own ffmpeg-static binary for merging separate video/audio
// streams (common above 720p on YouTube) instead of ytdlp-nodejs fetching a
// second, redundant copy of ffmpeg.
const ytdlp = new YtDlp({ ffmpegPath: ffmpegBinPath as string });

const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)/i;

/**
 * yt-dlp's `--cookies` flag only accepts a Netscape-format file, never a raw
 * "name=value; name2=value2" header string — so when the simpler
 * YOUTUBE_COOKIE_HEADER env var is used instead of a real exported file,
 * this converts it into that format on the fly. Domain is hardcoded to
 * ".youtube.com" for every cookie (not each cookie's real origin, which a
 * plain header string doesn't carry) — sufficient here since yt-dlp only
 * ever sends these on requests it makes to youtube.com itself.
 */
function buildNetscapeCookieFile(cookieHeader: string): string {
  const farFutureExpiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const lines = ["# Netscape HTTP Cookie File", "# Auto-generated from YOUTUBE_COOKIE_HEADER — do not edit directly."];

  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name || !value) continue;
    lines.push([".youtube.com", "TRUE", "/", "TRUE", String(farFutureExpiry), name, value].join("\t"));
  }

  const filePath = path.join(os.tmpdir(), "marketingai-youtube-cookies.txt");
  writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return filePath;
}

// YouTube now cuts off most yt-dlp video/audio downloads with a 403
// (PO Token / SABR chunked-streaming enforcement, confirmed to hit even
// popular, unrestricted videos — not something specific to one video or
// fixable by picking a different format/client). Cookies from a real
// logged-in session make requests trusted like a browser's and avoid this.
// Neither env var set (or the file missing) just means "not configured
// yet" — degrades to the old (occasionally-403ing) behavior rather than
// breaking the feature outright.
function getYoutubeCookiesPath(): string | undefined {
  const configuredPath = process.env.YOUTUBE_COOKIES_PATH;
  if (configuredPath && existsSync(configuredPath)) return configuredPath;

  const cookieHeader = process.env.YOUTUBE_COOKIE_HEADER;
  if (cookieHeader) return buildNetscapeCookieFile(cookieHeader);

  return undefined;
}

export function isYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERN.test(url.trim());
}

export interface YoutubeVideoInfo {
  title: string;
  durationSeconds: number;
}

/** Fetches just the metadata needed to validate the video before committing to a download. */
export async function getYoutubeInfo(url: string): Promise<YoutubeVideoInfo> {
  let info;
  try {
    info = await ytdlp.getInfoAsync<"video">(url, { cookies: getYoutubeCookiesPath() });
  } catch {
    throw new Error("Gagal membaca video YouTube. Pastikan link valid dan videonya publik.");
  }

  if ("live_status" in info && info.live_status && info.live_status !== "not_live") {
    throw new Error("Video live tidak didukung. Gunakan link video biasa (bukan siaran langsung).");
  }

  const durationSeconds = Number(info.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Gagal membaca durasi video YouTube.");
  }

  return { title: info.title || "Video YouTube", durationSeconds };
}

// YouTube's signed CDN URLs occasionally 403 for reasons that have nothing to
// do with the video itself (a stale signature, momentary rate-limiting) and
// clear up on their own within seconds — observed directly: a download that
// failed with a 403 succeeded immediately on a bare retry with no code
// changes. 429 (rate limit) and 5xx are the same class of "try again"
// failure. Everything else (private/age-restricted/unavailable/etc, already
// handled with specific messages below) won't fix itself, so retrying it
// would just waste time.
const TRANSIENT_ERROR_PATTERN = /HTTP Error 403|HTTP Error 429|HTTP Error 5\d\d/i;
const MAX_DOWNLOAD_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Downloads to `<outputDir>/source.<ext>` and returns the exact resulting path (extension picked by yt-dlp). */
export async function downloadYoutubeVideo(url: string, outputDir: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const result = await ytdlp.downloadAsync(url, {
        // "best" is a valid VideoQuality per ytdlp-nodejs's own types, but
        // its mergevideo quality map only actually defines 144p-2160p plus
        // "highest"/"lowest" — passing "best" silently builds a broken
        // "undefined+ba" format selector and yt-dlp fails with "Requested
        // format is not available". "highest" maps to "bv*" (unrestricted
        // best video stream), which is what we actually want here.
        format: { filter: "mergevideo", quality: "highest", type: "mp4" },
        output: path.join(outputDir, "source.%(ext)s"),
        cookies: getYoutubeCookiesPath(),
        // With cookies present, yt-dlp prefers a client (tv_downgraded) that
        // needs its own "n challenge" (URL descrambling) solved locally —
        // without a JS runtime it can't get a usable format at all
        // ("Only images are available for download"), even though the
        // cookies themselves are valid. process.execPath (not a hardcoded
        // path) is whichever Node binary is already running this app, so
        // this works unchanged on the production server too.
        rawArgs: ["--js-runtimes", `node:${process.execPath}`],
      });
      const filePath = result.filePaths[0];
      if (!filePath) throw new Error("Gagal mengunduh video YouTube.");
      return filePath;
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      const isTransient = TRANSIENT_ERROR_PATTERN.test(raw);
      if (!isTransient || attempt === MAX_DOWNLOAD_ATTEMPTS) break;
      console.error(`[youtube] download attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS} failed transiently, retrying:`, err);
      await sleep(attempt * 2000);
    }
  }
  // describeYoutubeDownloadError() below only keeps a translated, truncated
  // summary — logging the untranslated error here is the only place the real
  // yt-dlp stderr (the actual reason: which HTTP error, which format request,
  // etc.) survives, since callers only ever see the friendly message.
  console.error("[youtube] download failed after all attempts, raw error:", lastErr);
  throw new Error(describeYoutubeDownloadError(lastErr));
}

// yt-dlp's own stderr (surfaced via err.message, see ytdlp-nodejs's downloadAsync)
// already says exactly why a given video failed — the caller used to discard
// it behind one generic message, which made every failure look identical in
// the UI regardless of cause. This keeps that real reason, translated for
// the common cases users actually hit, so "video sumber tidak valid" style
// truncated messages don't repeat without explanation.
function describeYoutubeDownloadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/sign in to confirm|not a bot/i.test(raw)) {
    return "YouTube meminta verifikasi bot untuk video ini. Coba lagi beberapa saat lagi, atau unggah videonya langsung.";
  }
  if (/private video/i.test(raw)) {
    return "Video ini bersifat privat dan tidak bisa diunduh. Gunakan video publik atau unggah videonya langsung.";
  }
  if (/video unavailable/i.test(raw)) {
    return "Video tidak tersedia (mungkin sudah dihapus atau dibatasi di wilayah Anda). Coba link lain atau unggah videonya langsung.";
  }
  if (/age[- ]restrict/i.test(raw)) {
    return "Video ini dibatasi usia dan butuh login untuk diunduh. Gunakan video lain atau unggah videonya langsung.";
  }
  if (/members-only|join this channel/i.test(raw)) {
    return "Video ini khusus untuk member channel dan tidak bisa diunduh. Gunakan video lain atau unggah videonya langsung.";
  }
  if (/live event|premiere/i.test(raw)) {
    return "Video ini adalah siaran langsung/premiere dan belum bisa diunduh. Tunggu sampai videonya selesai tayang.";
  }
  if (/HTTP Error 403|requested format is not available/i.test(raw)) {
    return getYoutubeCookiesPath()
      ? "YouTube menolak unduhan ini meski sudah pakai cookies akun. Coba lagi beberapa saat lagi, atau unggah videonya langsung."
      : "YouTube sedang memblokir unduhan otomatis untuk video ini. Ini bukan masalah spesifik pada video Anda — coba lagi nanti, atau unggah videonya langsung.";
  }

  return `Gagal mengunduh video dari YouTube: ${raw.slice(0, 200)}`;
}

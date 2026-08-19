import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegPath as string);

// Sampling every 1.5s keeps the per-clip detection pass fast (a few seconds
// of CPU on the WASM backend) while still catching a speaker change within a
// couple of samples — this isn't real-time playback, it's a background job
// building a crop path before the clip is even rendered.
const SAMPLE_INTERVAL_SECONDS = 1.5;
// Faces are detected on a downscaled copy — the crop path only needs
// approximate face centers, not precise boxes, and downscaling is what keeps
// the WASM (CPU) detector fast enough to sample a whole clip in seconds.
const DETECT_MAX_WIDTH = 640;
const MIN_DETECTION_SCORE = 0.5;
// A candidate face must keep "winning" for this many consecutive samples
// before the crop actually switches to it — without this, one noisy frame
// (a glance, a blink misread as mouth movement) would flicker the crop back
// and forth instead of settling on whoever is actually talking.
const MIN_HOLD_SAMPLES = 2;

export interface CropKeyframe {
  /** Seconds, relative to the clip's own start (0 = first frame of the clip). */
  time: number;
  /** Crop window top-left, in SOURCE video pixel coordinates. */
  x: number;
  y: number;
}

interface FaceSample {
  centerX: number;
  centerY: number;
  boxArea: number;
  mouthOpenness: number;
}

let modelsReady: Promise<typeof import("@vladmandic/face-api/dist/face-api.node-wasm.js")> | null = null;

/** Loads the WASM backend + detection models exactly once per process (cached across every clip/batch, not just within one call). */
async function getFaceApi() {
  if (!modelsReady) {
    modelsReady = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const wasm = await import("@tensorflow/tfjs-backend-wasm");
      const faceapi = await import("@vladmandic/face-api/dist/face-api.node-wasm.js");

      const wasmDir = path.join(process.cwd(), "node_modules", "@tensorflow", "tfjs-backend-wasm", "dist") + path.sep;
      wasm.setWasmPaths(wasmDir.replace(/\\/g, "/"));
      await tf.setBackend("wasm");
      await tf.ready();

      const modelDir = path.join(process.cwd(), "node_modules", "@vladmandic", "face-api", "model");
      await faceapi.nets.tinyFaceDetector.loadFromDisk(modelDir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);

      return faceapi;
    })().catch((err) => {
      // Don't leave a rejected promise cached — a transient failure (e.g. disk
      // hiccup loading model files) shouldn't permanently disable smart crop
      // for the rest of the process's lifetime.
      modelsReady = null;
      throw err;
    });
  }
  return modelsReady;
}

/** Extracts `[start,end]` from `videoPath` as one raw RGB24 buffer sampled at SAMPLE_INTERVAL_SECONDS, downscaled to DETECT_MAX_WIDTH. */
async function sampleFrames(
  videoPath: string,
  start: number,
  duration: number,
  sourceWidth: number,
  sourceHeight: number,
  rawOutputPath: string
): Promise<{ width: number; height: number; frameCount: number }> {
  const width = Math.max(2, Math.floor(Math.min(DETECT_MAX_WIDTH, sourceWidth) / 2) * 2);
  const height = Math.max(2, Math.floor(((width * sourceHeight) / sourceWidth) / 2) * 2);

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    videoPath,
    "-vf",
    `fps=1/${SAMPLE_INTERVAL_SECONDS},scale=${width}:${height}`,
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    rawOutputPath,
  ]);

  const { stat } = await import("fs/promises");
  const bytes = (await stat(rawOutputPath)).size;
  const frameBytes = width * height * 3;
  const frameCount = frameBytes > 0 ? Math.floor(bytes / frameBytes) : 0;
  return { width, height, frameCount };
}

/** Mouth bounding-box height as a fraction of the face box height — a cheap, landmark-based proxy for "how open is the mouth right now." */
function mouthOpenness(
  mouthPoints: { x: number; y: number }[],
  faceBoxHeight: number
): number {
  if (mouthPoints.length === 0 || faceBoxHeight <= 0) return 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of mouthPoints) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return (maxY - minY) / faceBoxHeight;
}

/**
 * Builds a crop path that follows whoever appears to be speaking, using a
 * lightweight heuristic (mouth-movement between consecutive samples, not
 * real audio-visual active-speaker detection): sample faces every ~1.5s,
 * score each by how much its mouth-openness changed since the previous
 * sample it can be matched to, and hold the crop on the current winner until
 * another face out-scores it for MIN_HOLD_SAMPLES samples in a row.
 *
 * Returns null (never throws) whenever no usable signal exists — no faces
 * detected anywhere in the range, or any unexpected failure — so callers can
 * fall back to the existing static center-crop without special-casing.
 */
export async function detectSpeakerCropPath(
  videoPath: string,
  options: {
    start: number;
    end: number;
    sourceWidth: number;
    sourceHeight: number;
    cropWidth: number;
    cropHeight: number;
  }
): Promise<CropKeyframe[] | null> {
  const { start, end, sourceWidth, sourceHeight, cropWidth, cropHeight } = options;
  const duration = end - start;
  if (duration <= 0) return null;

  const { mkdtemp, rm } = await import("fs/promises");
  const { tmpdir } = await import("os");
  const tempDir = await mkdtemp(path.join(tmpdir(), "smartcrop-"));
  const rawPath = path.join(tempDir, "frames.rgb");

  try {
    const faceapi = await getFaceApi();
    // Tensors must come from face-api's own re-exported `tf` (not a separate
    // `@tensorflow/tfjs` import) — its detectAllFaces() typing only accepts
    // its own namespace's Tensor3D, even though both resolve to the same
    // runtime module.
    const tf = faceapi.tf;

    const { width: detectWidth, height: detectHeight, frameCount } = await sampleFrames(
      videoPath,
      start,
      duration,
      sourceWidth,
      sourceHeight,
      rawPath
    );
    if (frameCount === 0) return null;

    const { readFile } = await import("fs/promises");
    const raw = await readFile(rawPath);
    const frameBytes = detectWidth * detectHeight * 3;
    const scaleX = sourceWidth / detectWidth;
    const scaleY = sourceHeight / detectHeight;
    const options_ = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: MIN_DETECTION_SCORE });

    let previousFaces: FaceSample[] = [];
    let heldTarget: { centerX: number; centerY: number } | null = null;
    let pendingCandidate: { centerX: number; centerY: number; streak: number } | null = null;
    const keyframes: CropKeyframe[] = [];

    for (let i = 0; i < frameCount; i++) {
      const frameBuf = raw.subarray(i * frameBytes, (i + 1) * frameBytes);
      const tensor = tf.tidy(() => tf.tensor3d(new Uint8Array(frameBuf), [detectHeight, detectWidth, 3], "int32"));
      let detections;
      try {
        detections = await faceapi.detectAllFaces(tensor, options_).withFaceLandmarks();
      } finally {
        tensor.dispose();
      }

      const currentFaces: FaceSample[] = detections.map((d) => {
        const box = d.detection.box;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const mouth = mouthOpenness(d.landmarks.getMouth(), box.height);
        return { centerX, centerY, boxArea: box.width * box.height, mouthOpenness: mouth };
      });

      if (currentFaces.length > 0) {
        const best = pickTarget(currentFaces, previousFaces);

        if (!heldTarget) {
          heldTarget = { centerX: best.centerX, centerY: best.centerY };
          pendingCandidate = null;
          keyframes.push(toKeyframe(0, best, sourceWidth, sourceHeight, cropWidth, cropHeight, scaleX, scaleY));
        } else if (isSameTarget(best, heldTarget)) {
          // Still on the same person — refresh the held position AND push a
          // keyframe for it, so the crop actually pans with their natural
          // movement instead of freezing at wherever they were first
          // detected (the bug: this used to update `heldTarget` here without
          // ever emitting a keyframe for it — a keyframe only ever got
          // pushed on the *first* detection or a full speaker switch, so a
          // single speaker's whole clip rendered as one static crop).
          heldTarget = { centerX: best.centerX, centerY: best.centerY };
          pendingCandidate = null;
          const t = i * SAMPLE_INTERVAL_SECONDS;
          keyframes.push(toKeyframe(t, heldTarget, sourceWidth, sourceHeight, cropWidth, cropHeight, scaleX, scaleY));
        } else if (pendingCandidate && isSameTarget(best, pendingCandidate)) {
          pendingCandidate.streak += 1;
          if (pendingCandidate.streak >= MIN_HOLD_SAMPLES) {
            heldTarget = { centerX: pendingCandidate.centerX, centerY: pendingCandidate.centerY };
            pendingCandidate = null;
            const t = i * SAMPLE_INTERVAL_SECONDS;
            keyframes.push(toKeyframe(t, heldTarget, sourceWidth, sourceHeight, cropWidth, cropHeight, scaleX, scaleY));
          }
        } else {
          pendingCandidate = { centerX: best.centerX, centerY: best.centerY, streak: 1 };
        }
      }
      // No faces this sample — hold whatever the last known position was
      // (gap from occlusion/turning away), don't reset to center.

      previousFaces = currentFaces;
    }

    return keyframes.length > 0 ? keyframes : null;
  } catch (err) {
    console.error("[video-clip] smart crop detection failed, falling back to static crop:", err);
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function isSameTarget(a: { centerX: number; centerY: number }, b: { centerX: number; centerY: number }): boolean {
  // Same physical face across samples, not an exact match — a talking head
  // shifts a little between 1.5s samples even while staying "the same person."
  const dx = a.centerX - b.centerX;
  const dy = a.centerY - b.centerY;
  return Math.sqrt(dx * dx + dy * dy) < 60;
}

/** Highest mouth-movement delta since the last sample wins; falls back to largest face when nothing moved (first sample, or a static frame). */
function pickTarget(current: FaceSample[], previous: FaceSample[]): FaceSample {
  let best = current[0];
  let bestScore = -Infinity;
  for (const face of current) {
    const match = previous.reduce<FaceSample | null>((closest, p) => {
      const d = Math.hypot(p.centerX - face.centerX, p.centerY - face.centerY);
      const closestD = closest ? Math.hypot(closest.centerX - face.centerX, closest.centerY - face.centerY) : Infinity;
      return d < 80 && d < closestD ? p : closest;
    }, null);
    const movement = match ? Math.abs(face.mouthOpenness - match.mouthOpenness) : 0;
    // Movement dominates (who's actively talking); box area is only a
    // tie-breaker so a bigger-but-silent face doesn't outrank a smaller
    // person who's clearly speaking.
    const score = movement * 1000 + face.boxArea * 0.0001;
    if (score > bestScore) {
      bestScore = score;
      best = face;
    }
  }
  return best;
}

function toKeyframe(
  time: number,
  target: { centerX: number; centerY: number },
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number,
  scaleX: number,
  scaleY: number
): CropKeyframe {
  const centerX = target.centerX * scaleX;
  const centerY = target.centerY * scaleY;
  const x = Math.round(Math.min(Math.max(0, centerX - cropWidth / 2), sourceWidth - cropWidth));
  const y = Math.round(Math.min(Math.max(0, centerY - cropHeight / 2), sourceHeight - cropHeight));
  return { time, x, y };
}

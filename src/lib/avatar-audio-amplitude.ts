"use client";

/**
 * A real-loudness envelope for a reply's audio, layered on top of the
 * text-timing-driven viseme SHAPE (see tiktok-live-viseme.ts) — this only
 * scales how OPEN the mouth is at a given instant, not which shape it's in,
 * so quiet/loud syllables read differently instead of every vowel hitting
 * the exact same fixed intensity.
 *
 * Deliberately decoded OFFLINE via a throwaway fetch + decodeAudioData(),
 * never connected to any audio graph or output — NOT routed through the
 * actual <audio> element that plays the reply live. That element must keep
 * working (this overlay runs unattended in OBS during a real stream) even
 * if analysis fails outright, so a decode error here (network hiccup, or
 * the audio host not CORS-enabled) can only ever degrade to "no envelope",
 * never touch live playback.
 */
export interface AmplitudeEnvelope {
  /** RMS amplitude 0..1 per FRAME_SECONDS-wide bucket, starting at t=0, normalized against this clip's own peak. */
  frames: Float32Array;
}

const FRAME_SECONDS = 0.02; // 20ms buckets — fine enough to track syllable-level loudness, coarse enough to stay smooth

let sharedDecodeContext: AudioContext | null = null;

function getDecodeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedDecodeContext || sharedDecodeContext.state === "closed") {
    sharedDecodeContext = new Ctor();
  }
  return sharedDecodeContext;
}

export async function buildAmplitudeEnvelope(audioUrl: string): Promise<AmplitudeEnvelope | null> {
  const context = getDecodeContext();
  if (!context) return null;
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const samplesPerFrame = Math.max(1, Math.round(audioBuffer.sampleRate * FRAME_SECONDS));
    const frameCount = Math.ceil(channel.length / samplesPerFrame);
    const frames = new Float32Array(frameCount);
    let peak = 0;
    for (let f = 0; f < frameCount; f++) {
      const start = f * samplesPerFrame;
      const end = Math.min(channel.length, start + samplesPerFrame);
      let sumSquares = 0;
      for (let i = start; i < end; i++) sumSquares += channel[i] * channel[i];
      const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
      frames[f] = rms;
      if (rms > peak) peak = rms;
    }
    // Normalized against this clip's own peak so quiet vs loud TTS renders
    // both read as a fully-open mouth at their loudest syllable, rather
    // than a fixed absolute threshold that reacts differently depending on
    // the voice/provider's mastering level.
    if (peak > 0) {
      for (let f = 0; f < frames.length; f++) frames[f] = Math.min(1, frames[f] / peak);
    }
    return { frames };
  } catch {
    // Network failure, non-audio response, or decode error (e.g. the host
    // isn't CORS-enabled yet) — all fall back the same way, silently.
    return null;
  }
}

/**
 * Amplitude 0..1 at a given playback time. Returns 1 (neutral/full — the
 * pre-envelope behavior) whenever no envelope is available yet, so callers
 * degrade to the existing fixed-per-shape intensity instead of going
 * silent/closed-mouth while a reply's envelope is still decoding or
 * unavailable.
 */
export function sampleAmplitude(envelope: AmplitudeEnvelope | null, atSeconds: number): number {
  if (!envelope || envelope.frames.length === 0) return 1;
  const index = Math.min(envelope.frames.length - 1, Math.max(0, Math.floor(atSeconds / FRAME_SECONDS)));
  return envelope.frames[index];
}

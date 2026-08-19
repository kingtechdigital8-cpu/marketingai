"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { VisemeInterval } from "@/lib/tiktok-live-viseme";
import { buildAmplitudeEnvelope, type AmplitudeEnvelope } from "@/lib/avatar-audio-amplitude";
import type { AvatarEmotion, AvatarGesture } from "@/lib/tiktok-live-avatar-motion";
import { isGestureNameV2 } from "@/lib/tiktok-live-avatar-motion";
import { isAvatarClipName } from "@/lib/avatar/avatar-animation-registry";
import type { AvatarCanvasHandle } from "@/components/avatar/AvatarCanvas";
import type { Keyframe } from "@/lib/avatar-keyframe-playback";
import { cn } from "@/lib/utils";

// AvatarCanvas bundles three.js/@react-three/fiber/three-vrm — a large
// enough JS chunk that on a slow connection it can take a real, visible
// while to download BEFORE the component (and its own internal VRM-file
// loading indicator) ever mounts. Without this `loading` fallback, that gap
// renders nothing at all — the exact "looks stuck" symptom this is fixing,
// just one layer earlier than the VRM file's own download.
const AvatarCanvas = dynamic(() => import("@/components/avatar/AvatarCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black/20">
      <Loader2 className="h-6 w-6 animate-spin text-white" />
    </div>
  ),
});

interface OverlayComment {
  id: string;
  commenterName: string;
  suggestedReply: string | null;
  replyAudioUrl: string | null;
  visemeData: VisemeInterval[] | null;
  emotion: AvatarEmotion | null;
  gesture: AvatarGesture | null;
  /** AI-classified full-body Mixamo-retargeted clip name — see avatar-animation-registry.ts. Null/"none" plays nothing extra, the common case. */
  avatarClip: string | null;
  /**
   * AI-picked entry from the shared, global Animation Library (see
   * AvatarAnimation in schema.prisma) — embedded here directly by the
   * overlay route (not just an id), since this route is already this
   * stream's trust boundary. Null in the common case (no library entry
   * fit, or none exist yet).
   */
  customAnimation: { id: string; name: string; duration: number; data: unknown } | null;
  createdAt: string;
}

interface OverlayData {
  enabled: boolean;
  vrmUrl: string | null;
  gender: string | null;
  /** Saved "Edit Gesture" overrides for the built-in procedural vocabulary, keyed by slug — see AvatarCanvas's own gestureOverrides prop. */
  gestureOverrides: Record<string, { keyframes: Keyframe[] }>;
  comments: OverlayComment[];
}

const POLL_INTERVAL_MS = 3000;

/** Whether a comment has everything needed to play. */
function isReadyToPlay(c: OverlayComment): boolean {
  return Boolean(c.replyAudioUrl && c.visemeData && c.visemeData.length > 0);
}

interface AvatarOverlayPlayerProps {
  /** The account's overlayToken — same public, token-gated data source OBS points at. */
  token: string;
  className?: string;
  /** Rendered while nothing's configured yet (host virtual off, or no avatar set). Defaults to nothing. */
  emptyFallback?: ReactNode;
  /**
   * Mutes the underlying <audio> element — the VRM's lip-sync still tracks
   * audio.currentTime and animates normally either way (muting doesn't stop
   * playback or freeze currentTime), so this only silences output. Meant
   * for a dashboard preview shown alongside a real OBS instance of this
   * same overlay, so replies don't play twice out loud.
   */
  muted?: boolean;
}

/**
 * The actual overlay rendering/polling/playback logic — shared between the
 * bare OBS Browser Source page (src/app/overlay/[token]/page.tsx) and any
 * authenticated dashboard preview of the same live avatar. Polls the same
 * public, token-gated data endpoint either way; this component itself has
 * no auth of its own; access control is entirely the token's job, same
 * trust model as the overlay page.
 */
export default function AvatarOverlayPlayer({ token, className, emptyFallback, muted }: AvatarOverlayPlayerProps) {
  const [data, setData] = useState<OverlayData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const avatarCanvasRef = useRef<AvatarCanvasHandle>(null);
  const queueRef = useRef<OverlayComment[]>([]);
  const playedIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const [nowPlaying, setNowPlaying] = useState<OverlayComment | null>(null);
  const nowPlayingRef = useRef<OverlayComment | null>(null);
  const [amplitudeEnvelope, setAmplitudeEnvelope] = useState<AmplitudeEnvelope | null>(null);

  function playNextInQueue() {
    const next = queueRef.current.shift();
    if (!next) {
      setNowPlaying(null);
      nowPlayingRef.current = null;
      return;
    }
    setNowPlaying(next);
    nowPlayingRef.current = next;
  }

  useEffect(() => {
    let cancelled = false;

    function poll() {
      fetch(`/api/tiktok-live/overlay/${token}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((json: OverlayData) => {
          if (cancelled) return;
          setData(json);

          if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
            json.comments.forEach((c) => playedIdsRef.current.add(c.id));
            return;
          }

          const freshlyReady = json.comments.filter((c) => isReadyToPlay(c) && !playedIdsRef.current.has(c.id));
          if (freshlyReady.length > 0) {
            freshlyReady.forEach((c) => playedIdsRef.current.add(c.id));
            queueRef.current.push(...freshlyReady);
            if (!nowPlayingRef.current) playNextInQueue();
          }
        })
        .catch((status) => {
          if (status === 404) setNotFound(true);
        });
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  // The audio element itself drives the AvatarCanvas lip-sync loop (it reads
  // audioRef.currentTime + this comment's visemeData directly every frame),
  // nothing to sync here beyond starting playback. The AI-classified
  // full-body animation (if any) starts alongside it — same trigger, same
  // timing, so a reply's gesture and its voice begin together.
  // isAvatarClipName guards against "none"/null/a stale value from before
  // this field existed.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying?.replyAudioUrl) return;
    audio.src = nowPlaying.replyAudioUrl;
    audio.play().catch(() => {});

    // Decoded independently of the <audio> element above — see
    // avatar-audio-amplitude.ts's own doc comment for why: this must never
    // be able to affect the playback that just started, only add an
    // optional loudness-driven refinement on top once (if) it resolves.
    setAmplitudeEnvelope(null);
    let cancelled = false;
    buildAmplitudeEnvelope(nowPlaying.replyAudioUrl).then((envelope) => {
      if (!cancelled) setAmplitudeEnvelope(envelope);
    });

    if (isAvatarClipName(nowPlaying.avatarClip)) {
      avatarCanvasRef.current?.playAnimation(nowPlaying.avatarClip);
    }
    // The newer 20-name procedural gesture vocabulary (avatar-gesture-
    // engine.ts) shares the SAME `gesture` column as the older 14-name
    // AvatarGesture system (no new DB field/no schema change) — a value
    // only ever matches one of the two vocabularies, never both, so this is
    // never in conflict with the older system's own dispatch (which lives
    // inside AvatarCanvas itself, via the `gesture` prop below, unchanged).
    if (isGestureNameV2(nowPlaying.gesture)) {
      avatarCanvasRef.current?.playGesture(nowPlaying.gesture);
    }
    // Third motion option, mutually exclusive with the two above (the
    // server already enforces this — see tiktok-live-manager.ts's own
    // buildAvatarMotionRule comment — so at most one of gesture/
    // customAnimation is ever non-null on a given comment; avatarClip is no
    // longer classified for FRESH replies at all — see that same comment —
    // but a comment generated before that change may still have one saved,
    // hence isAvatarClipName's own check above still exists for backward
    // compat, not because the AI can produce a new one anymore). Runs through
    // AvatarCanvas's own useFrame-driven playback (see AvatarCustomAnimationApi),
    // not this component's poll loop, so it keeps animating correctly even
    // between polls. Non-looping: plays once alongside the reply, then
    // automatically releases back to idle when it finishes.
    const customKeyframes = (nowPlaying.customAnimation?.data as { keyframes?: Keyframe[] } | null)?.keyframes;
    if (customKeyframes && customKeyframes.length > 0) {
      avatarCanvasRef.current?.playCustomAnimation(customKeyframes, { loop: false });
    }

    return () => {
      cancelled = true;
    };
  }, [nowPlaying]);

  if (notFound) return <>{emptyFallback ?? null}</>;
  if (!data) return <>{emptyFallback ?? null}</>;
  if (!data.enabled) return <>{emptyFallback ?? null}</>;
  if (!data.vrmUrl) return <>{emptyFallback ?? null}</>;

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-lg", className)}>
      <AvatarCanvas
        ref={avatarCanvasRef}
        vrmUrl={data.vrmUrl}
        gender={data.gender}
        audioRef={audioRef}
        visemeData={nowPlaying?.visemeData ?? null}
        amplitudeEnvelope={amplitudeEnvelope}
        emotion={nowPlaying?.emotion ?? null}
        gesture={nowPlaying?.gesture ?? null}
        gestureKey={nowPlaying?.id ?? null}
        gestureOverrides={data.gestureOverrides}
        className="h-full w-full"
      />
      <audio ref={audioRef} className="hidden" muted={muted} onEnded={playNextInQueue} />
    </div>
  );
}

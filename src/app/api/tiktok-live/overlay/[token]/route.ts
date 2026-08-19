import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getR2PublicUrl } from "@/lib/r2";
import { GESTURE_NAMES_V2, gestureOverrideSlug } from "@/lib/tiktok-live-avatar-motion";

/**
 * Deliberately unauthenticated (no requireUser()) — this is meant to be
 * pasted into OBS/streaming software as a Browser Source, which has no way
 * to carry the dashboard's login session. The token itself (an unguessable
 * cuid-like random id, see host-vrm/route.ts) is what gates access, the
 * same trust model streaming-alert tools like StreamElements use for their
 * overlay URLs. Never leak whether a token doesn't exist vs. exists but has
 * virtual host off — both just render nothing.
 *
 * The VRM binary proxy (`?asset=vrm`) is handled in THIS SAME file rather
 * than a nested `[token]/vrm/route.ts`, on purpose — that nested route
 * repeatedly, reproducibly dropped out of Turbopack's dev-server route
 * manifest after a restart (confirmed directly: present in
 * `.next/dev/server/app/api/.../[token]/route/` but absent from the
 * sibling `vrm/` folder that should sit next to it — a real 404 from the
 * router itself, not from this handler's own code, application-code timing
 * notwithstanding), while the sibling `[token]/route.ts` for the exact same
 * dynamic segment was always registered fine. Root cause not fully
 * isolated (a Turbopack dev-mode quirk specific to a route.ts nested one
 * level under ANOTHER route.ts's own dynamic segment, is the leading
 * theory), but merging the two into one file eliminates the nested-route
 * shape entirely — there's nothing left for the dev server to lose track
 * of. Only affects `next dev`; `next build` compiles the full route tree
 * upfront and was never actually at risk.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const config = await prisma.tiktokLiveConfig.findUnique({ where: { overlayToken: token } });
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("asset") === "vrm") {
    return proxyVrm(config.virtualHostEnabled, config.virtualHostVrmKey);
  }

  if (!config.virtualHostEnabled || !config.virtualHostVrmKey) {
    return NextResponse.json({ enabled: false, vrmUrl: null, comments: [], gestureOverrides: {} });
  }

  const comments = await prisma.tiktokLiveComment.findMany({
    where: { configId: config.id, replyStatus: "GENERATED" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Embedded directly into this same response, not resolved via a second
  // request to a separate endpoint — the Animation Library's own admin
  // routes (src/app/api/admin/avatar-animations) require an interactive
  // ADMIN session, which an OBS Browser Source can never carry, and this
  // overlay route is ALREADY the trust boundary for this stream (see its
  // own doc comment above): replyAudioUrl/suggestedReply are exposed here
  // the exact same way, to anyone holding the token.
  const customAnimationIds = [...new Set(comments.map((c) => c.customAnimationId).filter((id): id is string => Boolean(id)))];
  const customAnimations =
    customAnimationIds.length > 0
      ? await prisma.avatarAnimation.findMany({
          where: { id: { in: customAnimationIds } },
          select: { id: true, name: true, duration: true, data: true },
        })
      : [];
  const customAnimationById = new Map(customAnimations.map((a) => [a.id, a]));

  // Whether the RUNTIME 20-gesture procedural engine (AvatarGestureEngine —
  // triggered by the `gesture` column below, and by the ?avatarDebug=1
  // panel's own gesture buttons) plays a built-in gesture's ORIGINAL
  // hardcoded motion or an admin's saved "Edit Gesture" override of it.
  // Without this, editing/saving a gesture in the Studio only ever affected
  // the Studio's own preview canvas — the live overlay (and this debug
  // panel, which shares the exact same AvatarCanvas component) kept playing
  // the old default forever, since AvatarGestureEngine has no DB awareness
  // of its own. Looked up by slug (see gestureOverrideSlug's own comment on
  // why that's a safe, collision-free mapping from a gesture name), not
  // customAnimationId — these aren't AI-picked Library entries, they're
  // overrides of a specific hardcoded gesture name.
  const gestureOverrideRows = await prisma.avatarAnimation.findMany({
    where: { slug: { in: GESTURE_NAMES_V2.map(gestureOverrideSlug) } },
    select: { slug: true, data: true },
  });
  const gestureOverrides: Record<string, { keyframes: unknown }> = {};
  gestureOverrideRows.forEach((row) => {
    const keyframes = (row.data as { keyframes?: unknown[] } | null)?.keyframes;
    if (keyframes && keyframes.length > 0) gestureOverrides[row.slug] = { keyframes };
  });

  return NextResponse.json({
    enabled: true,
    // Proxied same-origin, not the raw R2 URL — the VRM loader fetches this
    // programmatically (unlike the <img>/<audio src> tags elsewhere on this
    // page, which don't need CORS at all), and the R2 CDN has no CORS policy
    // allowing cross-origin fetches from the app's own domain.
    //
    // The `v` query param — the R2 key itself, already unique per upload/
    // template — is load-bearing, not cosmetic: without it this URL is the
    // same literal string across every avatar switch, so neither React (no
    // prop change to react to) nor the browser's HTTP cache (same URL, and
    // the proxy branch below sets a 1-hour Cache-Control) ever picks up a
    // newly-selected VRM. Changing the URL itself is what makes both notice.
    vrmUrl: `/api/tiktok-live/overlay/${token}?asset=vrm&v=${encodeURIComponent(config.virtualHostVrmKey)}`,
    // Which Mixamo idle clip AvatarCanvas retargets onto the hips/legs — see mixamo-vrm-retarget.ts.
    gender: config.virtualHostGender,
    gestureOverrides,
    comments: comments
      .map((comment) => ({
        id: comment.id,
        commenterName: comment.commenterName,
        suggestedReply: comment.suggestedReply,
        replyAudioUrl: comment.replyAudioUrl,
        visemeData: comment.visemeData,
        emotion: comment.emotion,
        gesture: comment.gesture,
        avatarClip: comment.avatarClip,
        // Null whenever this comment has no customAnimationId, or it
        // pointed at a library entry that's since been deleted (SetNull
        // already handles that at the DB level — this lookup miss is
        // mostly a defensive fallback for that same case).
        customAnimation: comment.customAnimationId ? (customAnimationById.get(comment.customAnimationId) ?? null) : null,
        createdAt: comment.createdAt,
      }))
      .reverse(),
  });
}

/**
 * Proxies the VRM file server-side instead of redirecting to the raw R2 URL —
 * GLTFLoader fetches this programmatically (unlike an <img>/<audio src> tag,
 * which needs no CORS), and the R2 CDN has no CORS policy for the app's own
 * origin. See this file's own top comment for why this lives here instead of
 * a separate nested route file.
 */
async function proxyVrm(virtualHostEnabled: boolean, virtualHostVrmKey: string | null) {
  if (!virtualHostEnabled || !virtualHostVrmKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Without a timeout, a stalled upstream (R2/CDN hiccup) leaves the
  // client's fetch pending forever with no error — the client-side loading
  // spinner then spins indefinitely with nothing to show for it. 30s is
  // generous for a file this size on a reasonable connection, but still bounded.
  let upstream: Response;
  try {
    upstream = await fetch(getR2PublicUrl(virtualHostVrmKey), { signal: AbortSignal.timeout(30_000) });
  } catch {
    return NextResponse.json({ error: "Gagal memuat file VRM (koneksi ke penyimpanan file timeout)." }, { status: 504 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Gagal memuat file VRM." }, { status: 502 });
  }

  const contentLength = upstream.headers.get("content-length");
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, max-age=3600",
      // Forwarded so the client can show real download progress instead of
      // an indeterminate spinner — GLTFLoader's onProgress callback needs
      // this to compute a percentage.
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
  });
}

"use client";

import { use, useEffect } from "react";
import AvatarOverlayPlayer from "@/components/avatar/AvatarOverlayPlayer";

/**
 * Meant to be pasted into OBS/streaming software as a Browser Source (see
 * the "URL Overlay" field on the Live TikTok config page), not visited by
 * end users — bare, no navbar/footer/app chrome, transparent background so
 * it composites over the rest of the live layout underneath it in OBS. All
 * the actual polling/playback logic lives in AvatarOverlayPlayer, shared
 * with the authenticated dashboard preview on the config page.
 */
export default function TiktokLiveOverlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent">
      {/* min(vw,vh) instead of a fixed max-width — a fixed square (the old
          max-w-md, 448px) could exceed a short/wide OBS Browser Source's
          actual configured height and get clipped to a half-body crop.
          Sizing off whichever viewport dimension is smaller guarantees the
          full square (and the full-body camera framing inside it) always
          fits, on any OBS source resolution — and is noticeably bigger than
          448px on a typical 1080p+ source. `!` forces this over the
          component's own default aspect-square/w-full base classes. */}
      <AvatarOverlayPlayer token={token} className="!h-[min(92vw,92vh)] !w-[min(92vw,92vh)]" />
    </div>
  );
}

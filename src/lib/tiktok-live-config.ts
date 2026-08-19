import type { TiktokLiveConfig } from "@prisma/client";
import { getR2PublicUrl } from "@/lib/r2";
import { getAvatarTemplateIdForVrmKey } from "@/lib/tiktok-live-avatar-templates";
import { getActiveTtsProvider } from "@/lib/tiktok-live-tts-provider";

/** Adds client-friendly derived fields — the overlay URL is built from the actual request's own origin rather than a hardcoded domain, so it's correct on localhost during dev and on whatever domain this ends up deployed to. */
export async function serializeConfig(config: TiktokLiveConfig | null, request: Request) {
  if (!config) return null;
  const origin = new URL(request.url).origin;
  return {
    ...config,
    virtualHostVrmUrl: config.virtualHostVrmKey ? getR2PublicUrl(config.virtualHostVrmKey) : null,
    // Only set when the current VRM is a shared template, not a self-uploaded
    // file — the gallery UI uses this to highlight the active card.
    virtualHostTemplateId: await getAvatarTemplateIdForVrmKey(config.virtualHostVrmKey),
    overlayUrl: config.overlayToken ? `${origin}/overlay/${config.overlayToken}` : null,
    // Read-only — which TTS backend `voice` is interpreted against, set
    // platform-wide by the admin (Pengaturan → Live TikTok), not by this user.
    activeTtsProvider: await getActiveTtsProvider(),
  };
}

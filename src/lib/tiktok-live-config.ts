import type { TiktokLiveConfig } from "@prisma/client";
import { getR2PublicUrl } from "@/lib/r2";
import { getAvatarTemplateIdForVrmKey } from "@/lib/tiktok-live-avatar-templates";
import { getActiveTtsProvider } from "@/lib/tiktok-live-tts-provider";
import { SITE_URL } from "@/lib/site";

// Used to be built from the incoming request's own URL origin instead — that
// broke behind a reverse proxy (aaPanel/Apache) that doesn't forward the
// original Host header, resolving to the backend's own address
// (localhost:3081) rather than the public domain. SITE_URL (from
// NEXT_PUBLIC_APP_URL) is already the canonical URL used everywhere else on
// the site (metadataBase, sitemap, canonical tags) and doesn't depend on
// proxy header forwarding at all.
/** Adds client-friendly derived fields, including the overlay URL. */
export async function serializeConfig(config: TiktokLiveConfig | null) {
  if (!config) return null;
  return {
    ...config,
    virtualHostVrmUrl: config.virtualHostVrmKey ? getR2PublicUrl(config.virtualHostVrmKey) : null,
    // Only set when the current VRM is a shared template, not a self-uploaded
    // file — the gallery UI uses this to highlight the active card.
    virtualHostTemplateId: await getAvatarTemplateIdForVrmKey(config.virtualHostVrmKey),
    overlayUrl: config.overlayToken ? `${SITE_URL}/overlay/${config.overlayToken}` : null,
    // Read-only — which TTS backend `voice` is interpreted against, set
    // platform-wide by the admin (Pengaturan → Live TikTok), not by this user.
    activeTtsProvider: await getActiveTtsProvider(),
  };
}

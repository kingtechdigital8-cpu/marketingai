// Single source of truth for site-wide SEO constants — metadataBase,
// canonical URLs, sitemap.xml, robots.txt, and JSON-LD all read from here
// instead of hardcoding the domain/name/description in five different
// places. NEXT_PUBLIC_APP_URL isn't set to a real production domain yet
// (see .env) — swap that one env var once the site is actually deployed and
// everything downstream (metadataBase, canonical links, sitemap, robots
// sitemap reference, JSON-LD) updates automatically.
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const SITE_NAME = "MarketingAI";
export const SITE_TITLE = "MarketingAI: Solusi Marketing Bertenaga AI";
export const SITE_DESCRIPTION =
  "SEO otomatis, generator gambar dan video iklan, Live TikTok AI dengan avatar 3D, dan Auto Clip untuk konten pendek. Semua dibuat AI dalam satu platform.";
export const SITE_KEYWORDS = [
  "AI marketing Indonesia",
  "SEO otomatis AI",
  "generator gambar iklan AI",
  "generator video iklan AI",
  "Live TikTok AI",
  "auto clip video AI",
  "tools marketing AI",
];

// Static (pre-rendered once via a one-off sharp script, see git history —
// not generated per-request) rather than a Next.js opengraph-image.tsx route:
// ImageResponse's build-time rendering hits a sharp/libvips "colourspace"
// crash in this environment. Next.js metadata merging replaces a parent
// route's whole `openGraph`/`twitter` object rather than deep-merging field
// by field, so every page that sets its own openGraph/twitter block needs to
// list this explicitly — it won't fall back to the root layout's copy.
export const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: SITE_TITLE };

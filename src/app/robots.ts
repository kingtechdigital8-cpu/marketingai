import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Blocks crawl of every authenticated app/admin page and API route — none of
// it is content meant to rank, and letting crawlers hit auth-gated pages
// just wastes crawl budget on pages that'll redirect to /login anyway.
// /login and /register are deliberately NOT listed here: they're kept
// crawlable so Google can actually fetch them and see the `noindex` meta tag
// (see (auth)/layout.tsx) — disallowing here would hide that tag from view
// instead of reinforcing it, which Google explicitly advises against.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/seo",
        "/ads",
        "/assets",
        "/credits",
        "/settings",
        "/auto-clip",
        "/live-tiktok",
        "/overlay",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { TOOLS_CONTENT } from "@/lib/tools-content";

// The /fitur/[slug] routes are generated from TOOLS_CONTENT (same source
// generateStaticParams uses), so a new tool automatically gets a sitemap
// entry with zero extra work — nothing here to keep in sync by hand.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/harga`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];

  const toolRoutes: MetadataRoute.Sitemap = TOOLS_CONTENT.map((tool) => ({
    url: `${SITE_URL}/fitur/${tool.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...toolRoutes];
}

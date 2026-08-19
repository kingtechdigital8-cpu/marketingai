import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/with-db-retry";

export interface ShowcaseMedia {
  image: string | null;
  video: string | null;
  clip: string | null;
}

const EMPTY_MEDIA: ShowcaseMedia = { image: null, video: null, clip: null };

/**
 * Real example media for the public marketing pages (hero carousel + the
 * Auto Clip showcase section) — pulled ONLY from admin-owned generation
 * history, per explicit instruction, never other users' content, so nothing
 * gets shown publicly without the account owner's control. Each field falls
 * back to null when nothing's been generated yet; callers render their
 * existing abstract mockup in that case instead of a broken/empty media tag.
 *
 * Also falls back to null-for-everything on ANY database error (including
 * exhausting withDbRetry's own retries) rather than throwing — this is
 * decorative example content on the PUBLIC homepage, which previously had
 * zero DB dependency; a transient connection hiccup here must never be able
 * to take the whole marketing page down.
 */
export async function getShowcaseMedia(): Promise<ShowcaseMedia> {
  try {
    const adminScope = { role: "ADMIN" as const };

    const [image, video, clip] = await withDbRetry(() =>
      Promise.all([
        prisma.generation.findFirst({
          where: { type: "IMAGE_GENERATION", status: "COMPLETED", content: { not: null }, user: adminScope },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        }),
        prisma.generation.findFirst({
          where: { type: "VIDEO_GENERATION", status: "COMPLETED", content: { not: null }, user: adminScope },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        }),
        prisma.generation.findFirst({
          where: { type: "VIDEO_CLIP", status: "COMPLETED", content: { not: null }, user: adminScope },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        }),
      ])
    );

    return { image: image?.content ?? null, video: video?.content ?? null, clip: clip?.content ?? null };
  } catch (err) {
    console.error("[marketing] failed to load showcase media, falling back to placeholders:", err);
    return EMPTY_MEDIA;
  }
}

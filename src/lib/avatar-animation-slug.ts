import { prisma } from "@/lib/prisma";

/** Lowercase, hyphenated, alnum-only — collisions resolved by uniqueAnimationSlug() appending -2/-3/etc. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "animasi";
}

/**
 * Appends -2/-3/... until the slug is free GLOBALLY, across every admin —
 * AvatarAnimation is a shared Animation Library (see its own schema
 * comment), not scoped per-creator, and its `slug` column carries the
 * database's only uniqueness constraint now (no more `userId` in the key).
 * `excludeId` lets a rename check against every OTHER animation without
 * colliding with itself.
 */
export async function uniqueAnimationSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = await prisma.avatarAnimation.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

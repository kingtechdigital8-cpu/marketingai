export interface ShowcaseMedia {
  image: string | null;
  video: string | null;
  clip: string | null;
}

/**
 * Real example media for the public marketing pages (hero carousel + the
 * Auto Clip showcase section) — hardcoded to specific R2/CDN URLs rather
 * than queried live from the database. Was previously dynamic (latest
 * completed generation owned by an ADMIN-role user), but that meant a
 * freshly-deployed environment with no admin generation history yet (e.g.
 * a brand-new production database) showed blank placeholders instead of
 * real examples — hardcoding known-good URLs sidesteps that entirely and
 * drops the DB dependency from the public homepage.  Update these paths
 * whenever a better example is generated.
 */
const SHOWCASE_MEDIA: ShowcaseMedia = {
  image: "https://cdn.kreasi.site/images/cmr6fe2830000nqo4grfoyi67/b872bd9f-f24d-46e4-96a2-172bab79f09a.png",
  video: "https://cdn.kreasi.site/videos/cmr6fe2830000nqo4grfoyi67/b076b3fc-03df-44a9-8a17-785b70ad2cac.mp4",
  clip: "https://cdn.kreasi.site/video-clips/cmr6fe2830000nqo4grfoyi67/cmsbh4vif0007nq3omfsw39dp/cmsbh9ghe000nnq3opg76d2qh.mp4",
};

export async function getShowcaseMedia(): Promise<ShowcaseMedia> {
  return SHOWCASE_MEDIA;
}

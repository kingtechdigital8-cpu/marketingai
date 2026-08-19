export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { tiktokLiveManager } = await import("@/lib/tiktok-live-manager");
  await tiktokLiveManager.bootstrap();

  const { videoClipManager } = await import("@/lib/video-clip-manager");
  await videoClipManager.bootstrap();
}

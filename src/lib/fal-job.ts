import { randomUUID } from "crypto";
import type { Generation } from "@prisma/client";
import { checkFalJobStatus, getFalJobResult } from "@/lib/fal";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { completeGeneration, markGenerationProcessing, refundFailedGeneration } from "@/lib/credit";

// fal.ai's queue can retry transient failures (e.g. "failed to acquire runner"
// when its GPU pool is briefly full) in the background for a long time before
// either succeeding or truly giving up — observed taking ~30 minutes to
// recover on its own. We tolerate that, but still give up eventually so a
// genuinely dead job doesn't stay "processing" forever.
const MAX_PROCESSING_MS = 60 * 60 * 1000;

/**
 * Shared by any generation type backed by an async fal.ai queue job (video
 * generation, voice-changer lipsync, ...). Advances the generation's status
 * by checking fal.ai once, downloading+re-uploading the result to our own
 * R2 bucket on completion. Safe to call repeatedly (idempotent no-op once
 * the generation is already finalized).
 */
export async function refreshPendingFalGeneration(generation: Generation, keyPrefix: string): Promise<Generation> {
  if (generation.status !== "PENDING" && generation.status !== "PROCESSING") return generation;

  const input = generation.input as {
    falStatusUrl?: string;
    falResponseUrl?: string;
    falProviderSlug?: string;
  };
  if (!input?.falStatusUrl || !input?.falResponseUrl || !input?.falProviderSlug) return generation;

  let jobStatus;
  try {
    jobStatus = await checkFalJobStatus({ statusUrl: input.falStatusUrl, providerSlug: input.falProviderSlug });
  } catch (err) {
    // Transient (network blip, fal.ai hiccup) — leave PENDING/PROCESSING and let the next poll retry.
    console.error("Fal job status check failed:", err);
    return generation;
  }

  if (jobStatus.state === "IN_QUEUE" || jobStatus.state === "IN_PROGRESS") {
    if (Date.now() - generation.createdAt.getTime() > MAX_PROCESSING_MS) {
      return refundFailedGeneration({
        generationId: generation.id,
        errorMessage: "fal.ai tidak kunjung menyelesaikan permintaan ini setelah 1 jam. Coba lagi.",
      });
    }
    await markGenerationProcessing(generation.id);
    return { ...generation, status: "PROCESSING" };
  }

  if (jobStatus.state === "COMPLETED") {
    try {
      const { videoUrl } = await getFalJobResult({
        responseUrl: input.falResponseUrl,
        providerSlug: input.falProviderSlug,
      });
      const key = `${keyPrefix}/${generation.userId}/${randomUUID()}.mp4`;
      const r2Url = await downloadAndUploadToR2(videoUrl, key, "video/mp4");
      return completeGeneration({ generationId: generation.id, content: r2Url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengambil hasil dari fal.ai.";
      console.error("Fal job result fetch failed:", err);

      // A 4xx from fal.ai's result endpoint (e.g. a validation error like "audio
      // too short") is a genuine, permanent rejection — retrying hits the exact
      // same error forever, so refund immediately. Anything else (network blip
      // fetching the video, R2 throttling, fal.ai 5xx) is more likely transient,
      // so give it the same grace window as a still-processing job before
      // finally giving up.
      const isPermanentValidationError = /\(4\d\d\)/.test(message);
      if (!isPermanentValidationError && Date.now() - generation.createdAt.getTime() < MAX_PROCESSING_MS) {
        return generation;
      }
      return refundFailedGeneration({ generationId: generation.id, errorMessage: message });
    }
  }

  return refundFailedGeneration({ generationId: generation.id, errorMessage: jobStatus.message });
}

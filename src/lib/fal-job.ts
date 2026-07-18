import { randomUUID } from "crypto";
import type { Generation } from "@prisma/client";
import { checkFalJobStatus, getFalJobResult } from "@/lib/fal";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { completeGeneration, markGenerationProcessing, refundFailedGeneration } from "@/lib/credit";

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

  try {
    const jobStatus = await checkFalJobStatus({ statusUrl: input.falStatusUrl, providerSlug: input.falProviderSlug });

    if (jobStatus.state === "IN_QUEUE" || jobStatus.state === "IN_PROGRESS") {
      await markGenerationProcessing(generation.id);
      return { ...generation, status: "PROCESSING" };
    }
    if (jobStatus.state === "COMPLETED") {
      const { videoUrl } = await getFalJobResult({
        responseUrl: input.falResponseUrl,
        providerSlug: input.falProviderSlug,
      });
      const key = `${keyPrefix}/${generation.userId}/${randomUUID()}.mp4`;
      const r2Url = await downloadAndUploadToR2(videoUrl, key, "video/mp4");
      return completeGeneration({ generationId: generation.id, content: r2Url });
    }
    return refundFailedGeneration({ generationId: generation.id, errorMessage: jobStatus.message });
  } catch (err) {
    console.error("Fal job status refresh failed:", err);
    return generation;
  }
}

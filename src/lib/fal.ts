import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError, ProviderBillingError } from "@/lib/errors";

export const FAL_VIDEO_SLUG = "falai-video";
export const FAL_LIPSYNC_SLUG = "falai-lipsync";

const PROVIDER_LABELS: Record<string, string> = {
  [FAL_VIDEO_SLUG]: "fal.ai (Video)",
  [FAL_LIPSYNC_SLUG]: "fal.ai (Voice Changer)",
};

const DEFAULT_MODELS: Record<string, string> = {
  [FAL_VIDEO_SLUG]: "fal-ai/kling-video/v3/standard/image-to-video",
  [FAL_LIPSYNC_SLUG]: "fal-ai/sync-lipsync/v2",
};

const QUEUE_BASE = "https://queue.fal.run";

async function extractErrorDetail(res: Response): Promise<{ detail: string; isBilling: boolean }> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.detail === "string") detail = parsed.detail;
  } catch {
    // body wasn't JSON, use the raw text
  }
  const isBilling = res.status === 403 && /balance|locked|quota/i.test(detail);
  return { detail: detail.slice(0, 300), isBilling };
}

async function throwForFailedResponse(res: Response, action: string): Promise<never> {
  const { detail, isBilling } = await extractErrorDetail(res);
  if (isBilling) {
    throw new ProviderBillingError(
      `Akun fal.ai kehabisan saldo/kuota. Silakan top up di fal.ai/dashboard/billing. (${detail})`
    );
  }
  throw new Error(`fal.ai ${action} gagal (${res.status}): ${detail}`);
}

async function getFalProvider(slug: string) {
  const provider = await prisma.aiProvider.findUnique({ where: { slug } });
  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new ProviderNotConfiguredError(
      `Provider AI "${PROVIDER_LABELS[slug] ?? slug}" belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Provider AI.`
    );
  }
  return { apiKey: provider.apiKey, model: provider.model || DEFAULT_MODELS[slug] };
}

export interface FalJobHandle {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  providerSlug: string;
}

async function submitFalJob(providerSlug: string, body: Record<string, unknown>): Promise<FalJobHandle> {
  const { apiKey, model } = await getFalProvider(providerSlug);

  const res = await fetch(`${QUEUE_BASE}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwForFailedResponse(res, "submit");
  }

  const data = await res.json();
  if (!data.request_id || !data.status_url || !data.response_url) {
    throw new Error("fal.ai tidak mengembalikan request_id/status_url/response_url.");
  }

  return {
    requestId: data.request_id as string,
    statusUrl: data.status_url as string,
    responseUrl: data.response_url as string,
    providerSlug,
  };
}

export async function submitVideoJob({
  prompt,
  imageUrl,
  duration,
}: {
  prompt: string;
  imageUrl: string;
  duration: "5" | "10";
}): Promise<FalJobHandle> {
  return submitFalJob(FAL_VIDEO_SLUG, {
    prompt,
    start_image_url: imageUrl,
    duration,
    generate_audio: true,
  });
}

export async function submitLipsyncJob({
  videoUrl,
  audioUrl,
}: {
  videoUrl: string;
  audioUrl: string;
}): Promise<FalJobHandle> {
  return submitFalJob(FAL_LIPSYNC_SLUG, {
    video_url: videoUrl,
    audio_url: audioUrl,
  });
}

export type FalJobStatus =
  | { state: "IN_QUEUE" }
  | { state: "IN_PROGRESS" }
  | { state: "COMPLETED" }
  | { state: "ERROR"; message: string };

export async function checkFalJobStatus({
  statusUrl,
  providerSlug,
}: {
  statusUrl: string;
  providerSlug: string;
}): Promise<FalJobStatus> {
  const { apiKey } = await getFalProvider(providerSlug);

  const res = await fetch(statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!res.ok) {
    const { detail, isBilling } = await extractErrorDetail(res);
    return {
      state: "ERROR",
      message: isBilling
        ? `Akun fal.ai kehabisan saldo/kuota. Silakan top up di fal.ai/dashboard/billing. (${detail})`
        : `fal.ai status gagal (${res.status}): ${detail}`,
    };
  }

  const data = await res.json();
  if (data.status === "COMPLETED") {
    if (data.error) return { state: "ERROR", message: String(data.error) };
    return { state: "COMPLETED" };
  }
  if (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") {
    return { state: data.status };
  }
  return { state: "ERROR", message: `Status tidak dikenal dari fal.ai: ${data.status}` };
}

export async function getFalJobResult({
  responseUrl,
  providerSlug,
}: {
  responseUrl: string;
  providerSlug: string;
}): Promise<{ videoUrl: string }> {
  const { apiKey } = await getFalProvider(providerSlug);

  const res = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!res.ok) {
    await throwForFailedResponse(res, "result");
  }

  const data = await res.json();
  const videoUrl = data?.video?.url;
  if (!videoUrl) {
    throw new Error("fal.ai tidak mengembalikan URL video.");
  }

  return { videoUrl };
}

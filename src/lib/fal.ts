import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";

const FAL_SLUG = "falai-video";
const QUEUE_BASE = "https://queue.fal.run";

async function getFalProvider() {
  const provider = await prisma.aiProvider.findUnique({ where: { slug: FAL_SLUG } });
  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new ProviderNotConfiguredError(
      'Provider AI "fal.ai (Video)" belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Provider AI.'
    );
  }
  return { apiKey: provider.apiKey, model: provider.model || "fal-ai/kling-video/v2.1/standard/image-to-video" };
}

export async function submitVideoJob({
  prompt,
  imageUrl,
  duration,
}: {
  prompt: string;
  imageUrl: string;
  duration: "5" | "10";
}): Promise<{ requestId: string; model: string }> {
  const { apiKey, model } = await getFalProvider();

  const res = await fetch(`${QUEUE_BASE}/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      duration,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fal.ai submit gagal (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!data.request_id) {
    throw new Error("fal.ai tidak mengembalikan request_id.");
  }

  return { requestId: data.request_id as string, model };
}

export type FalJobStatus =
  | { state: "IN_QUEUE" }
  | { state: "IN_PROGRESS" }
  | { state: "COMPLETED" }
  | { state: "ERROR"; message: string };

export async function checkVideoJobStatus({
  model,
  requestId,
}: {
  model: string;
  requestId: string;
}): Promise<FalJobStatus> {
  const { apiKey } = await getFalProvider();

  const res = await fetch(`${QUEUE_BASE}/${model}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { state: "ERROR", message: `fal.ai status gagal (${res.status}): ${body.slice(0, 300)}` };
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

export async function getVideoJobResult({
  model,
  requestId,
}: {
  model: string;
  requestId: string;
}): Promise<{ videoUrl: string }> {
  const { apiKey } = await getFalProvider();

  const res = await fetch(`${QUEUE_BASE}/${model}/requests/${requestId}`, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fal.ai result gagal (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const videoUrl = data?.video?.url;
  if (!videoUrl) {
    throw new Error("fal.ai tidak mengembalikan URL video.");
  }

  return { videoUrl };
}

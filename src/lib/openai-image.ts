import sharp from "sharp";
import OpenAI, { toFile } from "openai";
import { getOpenAiClient } from "@/lib/ai-provider";
import { ContentPolicyViolationError } from "@/lib/errors";

type BaseImageSize = "1024x1024" | "1024x1536" | "1536x1024";

const BASE_SIZES: { size: BaseImageSize; ratio: number }[] = [
  { size: "1024x1024", ratio: 1 },
  { size: "1024x1536", ratio: 1024 / 1536 },
  { size: "1536x1024", ratio: 1536 / 1024 },
];

function closestBaseSize(width: number, height: number): BaseImageSize {
  const ratio = width / height;
  return BASE_SIZES.reduce((best, candidate) => {
    const bestDiff = Math.abs(Math.log(ratio / best.ratio));
    const candidateDiff = Math.abs(Math.log(ratio / candidate.ratio));
    return candidateDiff < bestDiff ? candidate : best;
  }, BASE_SIZES[0]).size;
}

function rethrowIfModerationBlocked(err: unknown): never {
  if (err instanceof OpenAI.APIError && err.code === "moderation_blocked") {
    throw new ContentPolicyViolationError(
      "Deskripsi atau gambar referensi melanggar kebijakan konten AI (terdeteksi unsur yang dilarang, mis. konten seksual/kekerasan). Silakan ubah deskripsi atau gambar Anda."
    );
  }
  throw err;
}

async function resizeToOutput(b64: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(b64, "base64"))
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

export async function generateImage({
  prompt,
  width,
  height,
}: {
  prompt: string;
  width: number;
  height: number;
}): Promise<Buffer> {
  const { client, model } = await getOpenAiClient("openai-image");
  const baseSize = closestBaseSize(width, height);

  let response;
  try {
    response = await client.images.generate({
      model,
      prompt,
      size: baseSize,
      n: 1,
    });
  } catch (err) {
    rethrowIfModerationBlocked(err);
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Provider AI tidak mengembalikan data gambar.");
  }

  return resizeToOutput(b64, width, height);
}

export async function editImage({
  prompt,
  width,
  height,
  referenceImage,
  referenceImageType,
}: {
  prompt: string;
  width: number;
  height: number;
  referenceImage: Buffer;
  referenceImageType: string;
}): Promise<Buffer> {
  const { client, model } = await getOpenAiClient("openai-image");
  const baseSize = closestBaseSize(width, height);

  let response;
  try {
    response = await client.images.edit({
      model,
      prompt,
      image: await toFile(referenceImage, "reference.png", { type: referenceImageType }),
      size: baseSize,
      n: 1,
    });
  } catch (err) {
    rethrowIfModerationBlocked(err);
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Provider AI tidak mengembalikan data gambar.");
  }

  return resizeToOutput(b64, width, height);
}

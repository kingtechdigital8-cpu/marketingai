import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { submitVideoJob } from "@/lib/fal";
import { uploadToR2 } from "@/lib/r2";
import { ProviderNotConfiguredError, ProviderBillingError } from "@/lib/errors";
import { reserveCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { getProviderCost, roundCreditCost } from "@/lib/provider-cost";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_DURATIONS = new Set(["5", "10"]);

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });
  }

  const prompt = typeof form.get("prompt") === "string" ? (form.get("prompt") as string).trim() : "";
  const durationRaw = form.get("duration");
  const duration = typeof durationRaw === "string" && ALLOWED_DURATIONS.has(durationRaw)
    ? (durationRaw as "5" | "10")
    : "5";
  const referenceImage = form.get("referenceImage");

  if (!prompt) {
    return NextResponse.json({ error: "Deskripsi video wajib diisi." }, { status: 400 });
  }
  if (!(referenceImage instanceof File) || referenceImage.size === 0) {
    return NextResponse.json(
      { error: "Gambar produk/objek/karakter wajib diunggah sebagai titik awal video." },
      { status: 400 }
    );
  }
  if (!ALLOWED_REFERENCE_TYPES.has(referenceImage.type)) {
    return NextResponse.json(
      { error: "Gambar harus berformat PNG, JPG, atau WEBP." },
      { status: 400 }
    );
  }
  if (referenceImage.size > MAX_REFERENCE_IMAGE_BYTES) {
    return NextResponse.json({ error: "Ukuran gambar maksimal 10MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await referenceImage.arrayBuffer());
    const ext = referenceImage.type === "image/png" ? "png" : referenceImage.type === "image/webp" ? "webp" : "jpg";
    const imageKey = `videos/${session.user.id}/${randomUUID()}-source.${ext}`;
    const imageUrl = await uploadToR2(buffer, imageKey, referenceImage.type);

    const job = await submitVideoJob({ prompt, imageUrl, duration });
    const cost = roundCreditCost(await getProviderCost("falai-video"));

    await ensureDbConnection();
    const result = await reserveCreditsForGeneration({
      userId: session.user.id,
      type: "VIDEO_GENERATION",
      title: prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
      input: {
        prompt,
        duration,
        referenceImageUrl: imageUrl,
        falRequestId: job.requestId,
        falStatusUrl: job.statusUrl,
        falResponseUrl: job.responseUrl,
        falProviderSlug: job.providerSlug,
      },
      cost,
    });

    return NextResponse.json({
      generationId: result.generation.id,
      status: result.generation.status,
      creditBalance: result.creditBalance,
    });
  } catch (err) {
    if (err instanceof ProviderBillingError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsufficientCreditError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("Video job submission failed:", err);
    return NextResponse.json({ error: "Gagal memulai pembuatan video. Coba lagi." }, { status: 502 });
  }
}

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { generateImage, editImage } from "@/lib/openai-image";
import { uploadImageToR2 } from "@/lib/r2";
import { ProviderNotConfiguredError, ContentPolicyViolationError } from "@/lib/errors";
import { chargeCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MIN_DIMENSION = 256;
const MAX_DIMENSION = 2048;
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;
const ALLOWED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Data permintaan tidak valid." }, { status: 400 });
  }

  const prompt = typeof form.get("prompt") === "string" ? (form.get("prompt") as string).trim() : "";
  const styleRaw = form.get("style");
  const style = typeof styleRaw === "string" && styleRaw.trim() ? styleRaw.trim() : null;
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const referenceFiles = form.getAll("referenceImages").filter((f): f is File => f instanceof File && f.size > 0);
  const hasReference = referenceFiles.length > 0;

  if (!prompt) {
    return NextResponse.json({ error: "Deskripsi gambar wajib diisi." }, { status: 400 });
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    return NextResponse.json(
      { error: `Ukuran harus antara ${MIN_DIMENSION}-${MAX_DIMENSION} piksel.` },
      { status: 400 }
    );
  }
  if (referenceFiles.length > MAX_REFERENCE_IMAGES) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_REFERENCE_IMAGES} gambar referensi.` },
      { status: 400 }
    );
  }
  for (const file of referenceFiles) {
    if (!ALLOWED_REFERENCE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Gambar referensi harus berformat PNG, JPG, atau WEBP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      return NextResponse.json({ error: "Ukuran setiap gambar referensi maksimal 10MB." }, { status: 400 });
    }
  }

  try {
    const fullPrompt = style ? `${prompt}. Gaya visual: ${style}.` : prompt;
    const buffer = hasReference
      ? await editImage({
          prompt: fullPrompt,
          width,
          height,
          referenceImages: await Promise.all(
            referenceFiles.map(async (file) => ({
              buffer: Buffer.from(await file.arrayBuffer()),
              type: file.type,
            }))
          ),
        })
      : await generateImage({ prompt: fullPrompt, width, height });

    const key = `images/${session.user.id}/${randomUUID()}.png`;
    const imageUrl = await uploadImageToR2(buffer, key, "image/png");

    await ensureDbConnection();
    const result = await chargeCreditsForGeneration({
      userId: session.user.id,
      type: "IMAGE_GENERATION",
      title: prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
      input: { prompt, style, width, height, referenceImageCount: referenceFiles.length },
      content: imageUrl,
      cost: CREDIT_COSTS.IMAGE_GENERATION,
    });

    return NextResponse.json({
      image: imageUrl,
      creditBalance: result.creditBalance,
      generationId: result.generation.id,
    });
  } catch (err) {
    if (err instanceof ContentPolicyViolationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsufficientCreditError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("Image generation failed:", err);
    return NextResponse.json({ error: "Gagal menghasilkan gambar. Coba lagi." }, { status: 502 });
  }
}

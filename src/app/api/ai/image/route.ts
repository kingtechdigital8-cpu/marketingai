import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { generateImage } from "@/lib/openai-image";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { chargeCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MIN_DIMENSION = 256;
const MAX_DIMENSION = 2048;

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const style = typeof body?.style === "string" && body.style.trim() ? body.style.trim() : null;
  const width = Number(body?.width);
  const height = Number(body?.height);

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

  try {
    const fullPrompt = style ? `${prompt}. Gaya visual: ${style}.` : prompt;
    const image = await generateImage({ prompt: fullPrompt, width, height });

    await ensureDbConnection();
    const result = await chargeCreditsForGeneration({
      userId: session.user.id,
      type: "IMAGE_GENERATION",
      title: prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
      input: { prompt, style, width, height },
      content: image,
      cost: CREDIT_COSTS.IMAGE_GENERATION,
    });

    return NextResponse.json({
      image,
      creditBalance: result.creditBalance,
      generationId: result.generation.id,
    });
  } catch (err) {
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

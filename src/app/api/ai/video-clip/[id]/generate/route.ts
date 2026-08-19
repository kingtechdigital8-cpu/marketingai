import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { reserveCreditsForGeneration, InsufficientCreditError } from "@/lib/credit";
import { getProviderCost, roundCreditCost } from "@/lib/provider-cost";
import { ensureDbConnection } from "@/lib/with-db-retry";
import { videoClipManager, type Moment } from "@/lib/video-clip-manager";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const batch = await prisma.videoClipBatch.findUnique({ where: { id } });
  if (!batch || batch.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }
  if (batch.status !== "MOMENTS_FOUND") {
    return NextResponse.json({ error: "Batch ini belum siap atau sudah diproses." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const selectedIndexes: number[] = Array.isArray(body?.selectedIndexes)
    ? body.selectedIndexes.filter((n: unknown) => typeof n === "number")
    : [];
  if (selectedIndexes.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu momen." }, { status: 400 });
  }

  const moments = (batch.moments as unknown as Moment[]) ?? [];
  const validIndexes = selectedIndexes.filter((idx) => moments.some((m) => m.index === idx));
  if (validIndexes.length === 0) {
    return NextResponse.json({ error: "Momen yang dipilih tidak valid." }, { status: 400 });
  }

  const perClipCost = roundCreditCost(
    (await getProviderCost("video-clip-processing")) +
      (batch.headlineEnabled ? await getProviderCost("openai-text") : 0) +
      (batch.socialCaptionEnabled ? await getProviderCost("openai-text") : 0)
  );

  await ensureDbConnection();

  const items: { generationId: string; momentIndex: number }[] = [];
  let creditBalance: number | null = null;
  let ranOutOfCredit = false;

  try {
    for (const idx of validIndexes) {
      const moment = moments.find((m) => m.index === idx)!;
      try {
        const result = await reserveCreditsForGeneration({
          userId: session.user.id,
          type: "VIDEO_CLIP",
          title: moment.label || `Klip dari ${batch.sourceLabel}`,
          input: { batchId: batch.id, momentIndex: idx, start: moment.start, end: moment.end },
          cost: perClipCost,
        });
        await prisma.generation.update({
          where: { id: result.generation.id },
          data: { videoClipBatchId: batch.id },
        });
        items.push({ generationId: result.generation.id, momentIndex: idx });
        creditBalance = result.creditBalance;
      } catch (err) {
        if (err instanceof InsufficientCreditError) {
          ranOutOfCredit = true;
          break;
        }
        throw err;
      }
    }
  } catch (err) {
    console.error("Video clip generation submission failed:", err);
    if (items.length === 0) {
      return NextResponse.json({ error: "Gagal memulai pembuatan klip. Coba lagi." }, { status: 502 });
    }
  }

  if (items.length > 0) {
    videoClipManager.enqueueClipBatchGeneration(batch.id, items);
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Kredit Anda tidak cukup untuk membuat klip." }, { status: 402 });
  }

  return NextResponse.json({
    generationIds: items.map((i) => i.generationId),
    creditBalance,
    partial: ranOutOfCredit || items.length < validIndexes.length,
  });
}

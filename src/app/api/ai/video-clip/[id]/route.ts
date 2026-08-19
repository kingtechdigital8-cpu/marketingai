import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { withDbRetry } from "@/lib/with-db-retry";

// This is the one endpoint hammered every 4s by the auto-clip page's status
// poll for as long as a batch runs — including the whole stretch a
// background job (YouTube download, transcription, moment-finding) is
// hogging the single-connection pool (see DATABASE_URL's connection_limit=1).
// It's an easy place for a transient P1001-class connection hiccup to show
// up, so — same mitigation already used by the sibling routes that write to
// the batch (generate/route.ts, video-clip-manager.ts) — retry with backoff
// instead of surfacing a bare 500/404 for what's usually a passing blip.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const batch = await withDbRetry(() =>
    prisma.videoClipBatch.findUnique({
      where: { id },
      include: {
        clips: {
          select: {
            id: true,
            title: true,
            status: true,
            content: true,
            socialCaption: true,
            errorMessage: true,
            creditCost: true,
            createdAt: true,
          },
        },
      },
    })
  );

  if (!batch || batch.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({
    batch: {
      id: batch.id,
      sourceLabel: batch.sourceLabel,
      momentQuery: batch.momentQuery,
      requestedCount: batch.requestedCount,
      aspectRatio: batch.aspectRatio,
      headlineEnabled: batch.headlineEnabled,
      subtitleEnabled: batch.subtitleEnabled,
      effectPreset: batch.effectPreset,
      durationSeconds: batch.durationSeconds,
      status: batch.status,
      moments: batch.moments,
      analysisCreditCost: batch.analysisCreditCost,
      errorMessage: batch.errorMessage,
      createdAt: batch.createdAt,
      clips: batch.clips,
    },
  });
}

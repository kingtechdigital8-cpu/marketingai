import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { checkVideoJobStatus, getVideoJobResult } from "@/lib/fal";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { completeGeneration, markGenerationProcessing, refundFailedGeneration } from "@/lib/credit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  let generation = await prisma.generation.findUnique({ where: { id } });

  if (!generation || generation.userId !== session.user.id || generation.type !== "VIDEO_GENERATION") {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  if (generation.status === "PENDING" || generation.status === "PROCESSING") {
    const input = generation.input as { falRequestId?: string; falModel?: string };
    if (input?.falRequestId && input?.falModel) {
      try {
        const jobStatus = await checkVideoJobStatus({ model: input.falModel, requestId: input.falRequestId });

        if (jobStatus.state === "IN_QUEUE" || jobStatus.state === "IN_PROGRESS") {
          await markGenerationProcessing(id);
          generation = { ...generation, status: "PROCESSING" };
        } else if (jobStatus.state === "COMPLETED") {
          const { videoUrl } = await getVideoJobResult({ model: input.falModel, requestId: input.falRequestId });
          const key = `videos/${session.user.id}/${randomUUID()}.mp4`;
          const r2Url = await downloadAndUploadToR2(videoUrl, key, "video/mp4");
          generation = await completeGeneration({ generationId: id, content: r2Url });
        } else {
          generation = await refundFailedGeneration({ generationId: id, errorMessage: jobStatus.message });
        }
      } catch (err) {
        console.error("Video status refresh failed:", err);
        // Leave generation as-is; the client will retry on the next poll.
      }
    }
  }

  return NextResponse.json({
    generation: {
      id: generation.id,
      title: generation.title,
      status: generation.status,
      content: generation.content,
      errorMessage: generation.errorMessage,
      creditCost: generation.creditCost,
      createdAt: generation.createdAt,
    },
  });
}

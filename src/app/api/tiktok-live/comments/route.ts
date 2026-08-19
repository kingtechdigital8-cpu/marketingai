import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const comments = await prisma.tiktokLiveComment.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    comments: comments.map((comment) => ({
      id: comment.id,
      configId: comment.configId,
      userId: comment.userId,
      commenterName: comment.commenterName,
      commentText: comment.commentText,
      suggestedReply: comment.suggestedReply,
      replyAudioUrl: comment.replyAudioUrl,
      replyStatus: comment.replyStatus,
      replyError: comment.replyError,
      creditCost: comment.creditCost,
      createdAt: comment.createdAt,
    })),
  });
}

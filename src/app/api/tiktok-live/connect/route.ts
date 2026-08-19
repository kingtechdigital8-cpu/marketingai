import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { tiktokLiveManager } from "@/lib/tiktok-live-manager";

export async function POST() {
  const { session, error } = await requireUser();
  if (error) return error;

  await tiktokLiveManager.connectNow(session.user.id);

  const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({ config });
}

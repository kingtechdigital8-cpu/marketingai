import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { tiktokLiveManager } from "@/lib/tiktok-live-manager";
import { ensureDbConnection } from "@/lib/with-db-retry";
import { AI_PURPOSES, AI_TONES } from "@/lib/tiktok-live-persona";
import { serializeConfig } from "@/lib/tiktok-live-config";

const MAX_AI_CONTEXT_LENGTH = 1000;
const MAX_VOICE_ID_LENGTH = 100;
const MAX_BUSINESS_NAME_LENGTH = 100;
const MAX_BUSINESS_INFO_LENGTH = 1000;
const MAX_CALL_TO_ACTION_LENGTH = 300;
const MAX_AVOID_TOPICS_LENGTH = 300;

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const config = await prisma.tiktokLiveConfig.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({ config: await serializeConfig(config) });
}

export async function PUT(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const tiktokUsername = typeof body?.tiktokUsername === "string" ? body.tiktokUsername.trim().replace(/^@/, "") : "";
  const autoReply = Boolean(body?.autoReply);
  const autoGreetJoins = Boolean(body?.autoGreetJoins);
  const autoReplyLikes = Boolean(body?.autoReplyLikes);
  const autoReplyGifts = Boolean(body?.autoReplyGifts);
  const autoReplyFollows = Boolean(body?.autoReplyFollows);
  const enabled = Boolean(body?.enabled);
  // An ElevenLabs voice_id or a Google Chirp3 HD voice name, depending on
  // whichever provider the admin currently has active (getActiveTtsProvider)
  // — validated by actually calling that provider's API at reply time, not
  // against a fixed local set (both catalogs can change).
  const voice = typeof body?.voice === "string" ? body.voice.trim().slice(0, MAX_VOICE_ID_LENGTH) : "";
  const aiContext = typeof body?.aiContext === "string" ? body.aiContext.trim().slice(0, MAX_AI_CONTEXT_LENGTH) : "";

  const aiPurposeRaw = typeof body?.aiPurpose === "string" ? body.aiPurpose : "";
  const aiPurpose = AI_PURPOSES.some((p) => p.value === aiPurposeRaw) ? aiPurposeRaw : "";
  const aiToneRaw = typeof body?.aiTone === "string" ? body.aiTone : "";
  const aiTone = AI_TONES.some((t) => t.value === aiToneRaw) ? aiToneRaw : "";
  const businessName =
    typeof body?.businessName === "string" ? body.businessName.trim().slice(0, MAX_BUSINESS_NAME_LENGTH) : "";
  const businessInfo =
    typeof body?.businessInfo === "string" ? body.businessInfo.trim().slice(0, MAX_BUSINESS_INFO_LENGTH) : "";
  const callToAction =
    typeof body?.callToAction === "string" ? body.callToAction.trim().slice(0, MAX_CALL_TO_ACTION_LENGTH) : "";
  const avoidTopics =
    typeof body?.avoidTopics === "string" ? body.avoidTopics.trim().slice(0, MAX_AVOID_TOPICS_LENGTH) : "";
  const virtualHostEnabled = Boolean(body?.virtualHostEnabled);
  const virtualHostGender = body?.virtualHostGender === "male" ? "male" : "female";

  if (enabled && !tiktokUsername) {
    return NextResponse.json({ error: "Username TikTok wajib diisi." }, { status: 400 });
  }

  await ensureDbConnection();
  const config = await prisma.tiktokLiveConfig.upsert({
    where: { userId: session.user.id },
    update: {
      tiktokUsername,
      autoReply,
      autoGreetJoins,
      autoReplyLikes,
      autoReplyGifts,
      autoReplyFollows,
      aiPurpose: aiPurpose || null,
      businessName: businessName || null,
      businessInfo: businessInfo || null,
      aiTone: aiTone || null,
      callToAction: callToAction || null,
      avoidTopics: avoidTopics || null,
      aiContext: aiContext || null,
      voice,
      enabled,
      status: enabled ? "CONNECTING" : "STOPPED",
      lastError: null,
      virtualHostEnabled,
      virtualHostGender,
    },
    create: {
      userId: session.user.id,
      tiktokUsername,
      autoReply,
      autoGreetJoins,
      autoReplyLikes,
      autoReplyGifts,
      autoReplyFollows,
      aiPurpose: aiPurpose || null,
      businessName: businessName || null,
      businessInfo: businessInfo || null,
      aiTone: aiTone || null,
      callToAction: callToAction || null,
      avoidTopics: avoidTopics || null,
      aiContext: aiContext || null,
      voice,
      enabled,
      status: enabled ? "CONNECTING" : "STOPPED",
      virtualHostEnabled,
      virtualHostGender,
    },
  });

  tiktokLiveManager.applyConfig(session.user.id).catch((err) => console.error("[tiktok-live] applyConfig failed:", err));

  return NextResponse.json({ config: await serializeConfig(config) });
}

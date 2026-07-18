import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getProviderCosts, roundCreditCost } from "@/lib/provider-cost";

// Best-effort estimates for display before submitting — the exact charge is
// always computed server-side at generation time from the calls actually made.
const TYPICAL_KEYWORD_IDEAS = 10;
const TYPICAL_UNIQUENESS_CHECKS = 5;
const DEFAULT_VIDEO_SECONDS = 5; // matches the video/voice-changer tools' default duration option

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;

  const costs = await getProviderCosts([
    "openai-text",
    "openai-image",
    "openai-tts",
    "falai-video",
    "falai-lipsync",
    "serper-search",
  ]);

  return NextResponse.json({
    SEO_KEYWORDS: roundCreditCost(costs["openai-text"] + TYPICAL_KEYWORD_IDEAS * costs["serper-search"]),
    SEO_META: roundCreditCost(costs["openai-text"]),
    SEO_ARTICLE: roundCreditCost(costs["openai-text"] + TYPICAL_UNIQUENESS_CHECKS * costs["serper-search"]),
    IMAGE_GENERATION: roundCreditCost(costs["openai-image"]),
    VIDEO_GENERATION: roundCreditCost(costs["falai-video"] * DEFAULT_VIDEO_SECONDS),
    VOICE_DUB: roundCreditCost(costs["falai-lipsync"] * DEFAULT_VIDEO_SECONDS + costs["openai-tts"]),
  });
}

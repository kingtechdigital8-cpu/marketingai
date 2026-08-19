import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getProviderCosts, roundCreditCost } from "@/lib/provider-cost";

// Best-effort estimates for display before submitting — the exact charge is
// always computed server-side at generation time from the calls actually made.
const TYPICAL_KEYWORD_IDEAS = 10;
const TYPICAL_UNIQUENESS_CHECKS = 5;
const DEFAULT_VIDEO_SECONDS = 5; // matches the video/voice-changer tools' default duration option
const TYPICAL_REPLY_CHARS = 200; // elevenlabs-tts is billed per character actually generated
const TYPICAL_CLIP_SOURCE_SECONDS = 5 * 60; // openai-whisper is billed per second of actual source video duration

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;

  const costs = await getProviderCosts([
    "openai-text",
    "openai-image",
    "openai-tts",
    "falai-video",
    "falai-lipsync",
    "elevenlabs-tts",
    "serper-search",
    "openai-whisper",
    "video-clip-processing",
  ]);

  return NextResponse.json({
    SEO_KEYWORDS: roundCreditCost(costs["openai-text"] + TYPICAL_KEYWORD_IDEAS * costs["serper-search"]),
    SEO_META: roundCreditCost(costs["openai-text"]),
    SEO_ARTICLE: roundCreditCost(costs["openai-text"] + TYPICAL_UNIQUENESS_CHECKS * costs["serper-search"]),
    IMAGE_GENERATION: roundCreditCost(costs["openai-image"]),
    VIDEO_GENERATION: roundCreditCost(costs["falai-video"] * DEFAULT_VIDEO_SECONDS),
    VOICE_DUB: roundCreditCost(costs["falai-lipsync"] * DEFAULT_VIDEO_SECONDS + costs["openai-tts"]),
    TIKTOK_LIVE_REPLY: roundCreditCost(costs["openai-text"] + costs["elevenlabs-tts"] * TYPICAL_REPLY_CHARS),
    VIDEO_CLIP_ANALYSIS: roundCreditCost(
      costs["openai-whisper"] * TYPICAL_CLIP_SOURCE_SECONDS + costs["openai-text"]
    ),
    // Component costs (not pre-combined tiers) — headline and social caption
    // are independent toggles, so the client sums whichever addons are on.
    // Deliberately UNROUNDED: the actual charge in generate/route.ts sums the
    // raw provider costs of whichever addons are active and rounds ONCE —
    // rounding each component here first (e.g. ceil(0.6)=1, ceil(0.3)=1, so
    // "2") would overstate the real combined charge (ceil(0.6+0.3)=1).
    VIDEO_CLIP_PER_CLIP_BASE: costs["video-clip-processing"],
    VIDEO_CLIP_HEADLINE_ADDON: costs["openai-text"],
    VIDEO_CLIP_CAPTION_ADDON: costs["openai-text"],
  });
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { serializeAvatarTemplates } from "@/lib/tiktok-live-avatar-templates";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  return NextResponse.json({ templates: await serializeAvatarTemplates() });
}

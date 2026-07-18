import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.category === "string") data.category = body.category.trim();
  if (typeof body.model === "string") data.model = body.model;
  if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl;
  if (typeof body.apiKey === "string") data.apiKey = body.apiKey;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (body.baseCost !== undefined && Number.isFinite(Number(body.baseCost))) data.baseCost = Number(body.baseCost);
  if (body.markupPercent !== undefined && Number.isFinite(Number(body.markupPercent)))
    data.markupPercent = Number(body.markupPercent);

  const provider = await prisma.aiProvider.update({ where: { id }, data });
  return NextResponse.json({ provider });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.aiProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

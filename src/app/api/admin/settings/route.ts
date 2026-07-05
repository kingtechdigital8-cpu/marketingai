import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const ALLOWED_KEYS = ["site.title", "site.description", "site.contactEmail", "site.maintenanceMode"];

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.setting.findMany({ where: { key: { in: ALLOWED_KEYS } } });
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const entries = Object.entries(body).filter(([key]) => ALLOWED_KEYS.includes(key));

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  return NextResponse.json({ ok: true });
}

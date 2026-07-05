import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";

  if (!name || !slug || !category) {
    return NextResponse.json({ error: "Nama, slug, dan kategori wajib diisi." }, { status: 400 });
  }

  const existing = await prisma.aiProvider.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug sudah digunakan." }, { status: 409 });
  }

  const provider = await prisma.aiProvider.create({
    data: {
      name,
      slug,
      category,
      model: typeof body?.model === "string" ? body.model : null,
      baseUrl: typeof body?.baseUrl === "string" ? body.baseUrl : null,
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : null,
      enabled: Boolean(body?.enabled),
    },
  });

  return NextResponse.json({ provider }, { status: 201 });
}

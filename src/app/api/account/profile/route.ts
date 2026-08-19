import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function PATCH(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Nama tidak boleh kosong." }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "Nama maksimal 100 karakter." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
    select: { name: true },
  });

  return NextResponse.json({ name: updated.name });
}

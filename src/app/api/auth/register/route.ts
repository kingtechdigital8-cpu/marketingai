import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const WELCOME_CREDIT_BONUS = 20;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Nama, email, dan kata sandi wajib diisi." }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Kata sandi minimal 8 karakter." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "USER",
        creditBalance: WELCOME_CREDIT_BONUS,
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: user.id,
        amount: WELCOME_CREDIT_BONUS,
        type: "BONUS",
        description: "Bonus kredit pendaftaran akun baru",
      },
    });
  });

  return NextResponse.json({ ok: true });
}

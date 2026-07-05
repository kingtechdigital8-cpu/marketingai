import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Belum masuk." }, { status: 401 }) } as const;
  }
  return { session } as const;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Belum masuk." }, { status: 401 }) } as const;
  }
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Akses ditolak." }, { status: 403 }) } as const;
  }
  return { session } as const;
}

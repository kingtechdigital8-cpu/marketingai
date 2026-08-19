import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/with-db-retry";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Belum masuk." }, { status: 401 }) } as const;
  }
  // A fresh, per-request DB check (not just trusting the JWT's role/claims,
  // which only refresh on next login) — an admin suspending a user takes
  // effect on this user's very next request, not just their next login.
  // Every protected API route already funnels through requireUser() or
  // requireAdmin() (confirmed — nothing else in src/app/api calls auth()
  // directly), so this one check covers the whole app — including the
  // known-flaky local P1001-class connection hiccups (see with-db-retry.ts),
  // which is why this is worth retrying rather than letting every protected
  // route 500 on a transient blip.
  const dbUser = await withDbRetry(() => prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } }));
  if (!dbUser || dbUser.status === "SUSPENDED") {
    return { error: NextResponse.json({ error: "Akun Anda telah dinonaktifkan. Hubungi admin." }, { status: 403 }) } as const;
  }
  return { session } as const;
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result.error) return result;
  if (result.session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Akses ditolak." }, { status: 403 }) } as const;
  }
  return result;
}

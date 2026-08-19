import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      creditBalance: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { generations: true, creditTransactions: true, topupTransactions: true } },
      generations: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, status: true, title: true, creditCost: true, createdAt: true },
      },
      topupTransactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, amountIdr: true, credits: true, status: true, channel: true, createdAt: true },
      },
      creditTransactions: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, amount: true, type: true, description: true, createdAt: true },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
  }

  const topupSuccessSum = await prisma.topupTransaction.aggregate({
    where: { userId: id, status: "SUCCESS" },
    _sum: { amountIdr: true, credits: true },
  });

  const { _count, ...rest } = user;
  return NextResponse.json({
    user: {
      ...rest,
      generationsCount: _count.generations,
      creditTransactionsCount: _count.creditTransactions,
      topupTransactionsCount: _count.topupTransactions,
      totalTopupIdr: topupSuccessSum._sum.amountIdr ?? 0,
      totalTopupCredits: topupSuccessSum._sum.credits ?? 0,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
  }

  const nextRole = body.role === "USER" || body.role === "ADMIN" ? body.role : undefined;
  const nextStatus = body.status === "ACTIVE" || body.status === "SUSPENDED" ? body.status : undefined;

  // Self-service role/status changes are blocked outright here (not just
  // when they'd cause a lockout) — an admin who wants their own role/status
  // changed asks another admin, standard admin-panel practice, simpler than
  // reasoning about every self-lockout edge case.
  if ((nextRole !== undefined || nextStatus !== undefined) && id === session.user.id) {
    return NextResponse.json({ error: "Tidak dapat mengubah role/status akun Anda sendiri." }, { status: 400 });
  }

  const demotingLastAdmin = nextRole === "USER" && target.role === "ADMIN";
  const suspendingLastAdmin = nextStatus === "SUSPENDED" && target.role === "ADMIN" && target.status === "ACTIVE";
  if (demotingLastAdmin || suspendingLastAdmin) {
    const otherActiveAdmins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE", id: { not: id } } });
    if (otherActiveAdmins === 0) {
      return NextResponse.json({ error: "Tidak dapat mengubah admin terakhir yang aktif." }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (nextRole !== undefined) data.role = nextRole;
  if (nextStatus !== undefined) data.status = nextStatus;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan untuk disimpan." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, status: true, creditBalance: true },
  });
  return NextResponse.json({ user: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "Tidak dapat menghapus akun Anda sendiri." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", id: { not: id } } });
    if (otherAdmins === 0) {
      return NextResponse.json({ error: "Tidak dapat menghapus admin terakhir." }, { status: 400 });
    }
  }

  // Cascades — every relation on User (generations, creditTransactions,
  // topupTransactions, tiktokLiveConfig, videoClipBatches, videoClipAssets)
  // is onDelete: Cascade except avatarAnimations (onDelete: SetNull, since
  // that's a shared Global Animation Library, not per-user data — see its
  // own schema comment). Permanent and unrecoverable, hence the strict
  // type-to-confirm step on the client before this is ever called.
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

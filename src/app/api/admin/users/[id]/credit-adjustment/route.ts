import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/** Manual balance change from the user management page — see CreditTransactionType.ADJUSTMENT's own schema comment. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: "Jumlah kredit harus berupa angka bulat dan tidak nol." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Alasan penyesuaian wajib diisi." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      const nextBalance = user.creditBalance + amount;
      if (nextBalance < 0) {
        throw new Error("INSUFFICIENT");
      }
      await tx.creditTransaction.create({
        data: { userId: id, amount, type: "ADJUSTMENT", description: `Penyesuaian oleh admin: ${reason}` },
      });
      return tx.user.update({ where: { id }, data: { creditBalance: nextBalance } });
    });
    return NextResponse.json({ creditBalance: result.creditBalance });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return NextResponse.json({ error: "Saldo kredit tidak boleh menjadi negatif." }, { status: 400 });
    }
    return NextResponse.json({ error: "Gagal menyesuaikan kredit." }, { status: 500 });
  }
}

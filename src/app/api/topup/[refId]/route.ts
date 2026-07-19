import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { checkOrderStatus, isSuccessStatus } from "@/lib/tokopay";
import { completeTopup } from "@/lib/credit";

export async function GET(_request: Request, { params }: { params: Promise<{ refId: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { refId } = await params;
  let topup = await prisma.topupTransaction.findUnique({ where: { refId } });

  if (!topup || topup.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  // Local/dev servers usually aren't reachable by Tokopay's webhook, so actively
  // re-check with Tokopay here too — this is what actually completes a topup
  // when the callback never arrives, not just a read of our own last-known state.
  if (topup.status === "PENDING") {
    try {
      const remote = await checkOrderStatus(refId);
      if (isSuccessStatus(remote.status)) {
        topup = await completeTopup(refId);
      }
    } catch (err) {
      console.error("Topup status re-check failed:", err);
    }
  }

  return NextResponse.json({
    refId: topup.refId,
    status: topup.status,
    amountIdr: topup.amountIdr,
    credits: topup.credits,
    payUrl: topup.payUrl,
    qrString: topup.qrString,
  });
}

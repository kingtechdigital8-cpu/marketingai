import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { checkOrderStatus, isSuccessStatus } from "@/lib/tokopay";
import { completeTopup, expireStaleTopup } from "@/lib/credit";

export async function GET(_request: Request, { params }: { params: Promise<{ refId: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { refId } = await params;
  let topup = await prisma.topupTransaction.findUnique({ where: { refId } });

  if (!topup || topup.userId !== session.user.id) {
    return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  if (topup.status === "PENDING") {
    // Always verify with Tokopay BEFORE expiring — a late webhook or a slow
    // payment near the expiry window must never be discarded just because our
    // local clock says it's stale. Local/dev servers usually aren't reachable
    // by Tokopay's webhook too, so this is also what actually completes a
    // topup when the callback never arrives, not just a read of our own state.
    try {
      const remote = await checkOrderStatus(refId);
      if (isSuccessStatus(remote.status)) {
        topup = await completeTopup(refId);
      }
    } catch (err) {
      console.error("Topup status re-check failed:", err);
    }

    if (topup.status === "PENDING") {
      const expired = await expireStaleTopup(refId);
      if (expired.count > 0) {
        topup = await prisma.topupTransaction.findUniqueOrThrow({ where: { refId } });
      }
    }
  }

  return NextResponse.json({
    refId: topup.refId,
    status: topup.status,
    amountIdr: topup.amountIdr,
    credits: topup.credits,
    payUrl: topup.payUrl,
    qrString: topup.qrString,
    qrLink: topup.qrLink,
    paymentGuide: topup.paymentGuide,
    vaNumber: topup.vaNumber,
    channel: topup.channel,
  });
}

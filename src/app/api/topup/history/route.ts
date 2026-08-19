import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { completeTopup, expireStaleTopup, findStaleTopupRefIds } from "@/lib/credit";
import { checkOrderStatus, isSuccessStatus } from "@/lib/tokopay";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  // Verify with Tokopay before expiring each stale-looking pending topup — a
  // late webhook or a payment made right at the edge of the window must not
  // be discarded just because the list happened to be viewed at that moment.
  const staleRefIds = await findStaleTopupRefIds(session.user.id);
  for (const refId of staleRefIds) {
    let completed = false;
    try {
      const remote = await checkOrderStatus(refId);
      if (isSuccessStatus(remote.status)) {
        await completeTopup(refId);
        completed = true;
      }
    } catch (err) {
      console.error("Topup remote re-check failed during history load:", err);
    }
    if (!completed) await expireStaleTopup(refId);
  }

  const topups = await prisma.topupTransaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      refId: true,
      amountIdr: true,
      credits: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ topups });
}

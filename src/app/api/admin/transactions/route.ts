import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/**
 * Read-only monitoring list (see this route's own admin page — "Pemantauan
 * seluruh transaksi top-up kredit via Tokopay", no admin-driven mutation:
 * status only ever changes via the Tokopay webhook). Capped at the most
 * recent 1000 rather than truly unbounded — this table only grows, unlike
 * users/providers — with search/filter/sort still happening client-side
 * against that window, same pattern as the rest of the admin panel. Omits
 * the large payment-detail text fields (payUrl/qrString/qrLink/
 * paymentGuide) from the list payload; see [id]/route.ts for those.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const transactions = await prisma.topupTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      refId: true,
      trxId: true,
      amountIdr: true,
      credits: true,
      channel: true,
      status: true,
      vaNumber: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ transactions });
}

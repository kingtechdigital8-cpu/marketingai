import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { createOrder } from "@/lib/tokopay";
import { idrToCredits, getCreditIdrValue } from "@/lib/exchange-rate";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MIN_TOPUP_IDR = 10000;

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const amountIdr = Number(body?.amountIdr);

  if (!Number.isFinite(amountIdr) || amountIdr < MIN_TOPUP_IDR) {
    return NextResponse.json(
      { error: `Nominal top up minimal Rp${MIN_TOPUP_IDR.toLocaleString("id-ID")}.` },
      { status: 400 }
    );
  }

  try {
    const credits = await idrToCredits(amountIdr);
    if (credits < 1) {
      return NextResponse.json({ error: "Nominal terlalu kecil untuk dikonversi ke kredit." }, { status: 400 });
    }

    const refId = `topup-${randomUUID()}`;
    const order = await createOrder({ refId, amountIdr });

    const { usdIdrRate } = await getCreditIdrValue();

    await ensureDbConnection();
    const topup = await prisma.topupTransaction.create({
      data: {
        userId: session.user.id,
        refId,
        trxId: order.trxId,
        amountIdr,
        credits,
        channel: "QRIS",
        status: "PENDING",
        payUrl: order.payUrl,
        qrString: order.qrString,
        qrLink: order.qrLink,
        paymentGuide: order.paymentGuide,
      },
    });

    return NextResponse.json({
      refId: topup.refId,
      payUrl: topup.payUrl,
      qrString: topup.qrString,
      qrLink: topup.qrLink,
      paymentGuide: topup.paymentGuide,
      amountIdr: topup.amountIdr,
      credits: topup.credits,
      usdIdrRate,
    });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Topup order creation failed:", err);
    return NextResponse.json({ error: "Gagal membuat pesanan top up. Coba lagi." }, { status: 502 });
  }
}

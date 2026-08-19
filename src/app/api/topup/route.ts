import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { createOrder, isAllowedChannel } from "@/lib/tokopay";
import { idrToCredits, getCreditIdrValue } from "@/lib/exchange-rate";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { ensureDbConnection } from "@/lib/with-db-retry";

const MIN_TOPUP_IDR = 100000;

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const amountIdr = Number(body?.amountIdr);
  const channel = typeof body?.channel === "string" ? body.channel : "";

  if (!Number.isFinite(amountIdr) || amountIdr < MIN_TOPUP_IDR) {
    return NextResponse.json(
      { error: `Nominal top up minimal Rp${MIN_TOPUP_IDR.toLocaleString("id-ID")}.` },
      { status: 400 }
    );
  }
  if (!isAllowedChannel(channel)) {
    return NextResponse.json({ error: "Pilih metode pembayaran terlebih dahulu." }, { status: 400 });
  }

  try {
    const credits = await idrToCredits(amountIdr);
    if (credits < 1) {
      return NextResponse.json({ error: "Nominal terlalu kecil untuk dikonversi ke kredit." }, { status: 400 });
    }

    const refId = `topup-${randomUUID()}`;
    const order = await createOrder({ refId, amountIdr, channel });

    const { usdIdrRate } = await getCreditIdrValue();

    await ensureDbConnection();
    const topup = await prisma.topupTransaction.create({
      data: {
        userId: session.user.id,
        refId,
        trxId: order.trxId,
        amountIdr,
        credits,
        channel,
        status: "PENDING",
        payUrl: order.payUrl,
        qrString: order.qrString,
        qrLink: order.qrLink,
        paymentGuide: order.paymentGuide,
        vaNumber: order.vaNumber,
      },
    });

    return NextResponse.json({
      refId: topup.refId,
      payUrl: topup.payUrl,
      qrString: topup.qrString,
      qrLink: topup.qrLink,
      paymentGuide: topup.paymentGuide,
      vaNumber: topup.vaNumber,
      channel: topup.channel,
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

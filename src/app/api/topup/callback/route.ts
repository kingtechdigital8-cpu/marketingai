import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signTokopay, isSuccessStatus } from "@/lib/tokopay";
import { completeTopup } from "@/lib/credit";
import { ensureDbConnection } from "@/lib/with-db-retry";

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries(form.entries());
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  const refId = typeof body.reff_id === "string" ? body.reff_id : "";
  const status = typeof body.status === "string" ? body.status : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  if (!refId || !signature) {
    return NextResponse.json({ status: false, error: "Payload tidak lengkap." }, { status: 400 });
  }

  const merchantSetting = await prisma.setting.findMany({
    where: { key: { in: ["tokopay.merchant_id", "tokopay.secret_key"] } },
  });
  const settings = Object.fromEntries(merchantSetting.map((row) => [row.key, row.value]));
  const merchantId = settings["tokopay.merchant_id"];
  const secretKey = settings["tokopay.secret_key"];

  if (!merchantId || !secretKey) {
    return NextResponse.json({ status: false, error: "Payment gateway belum dikonfigurasi." }, { status: 503 });
  }

  const expectedSignature = signTokopay(merchantId, secretKey, refId);
  if (signature !== expectedSignature) {
    console.error("Tokopay callback signature mismatch for refId:", refId);
    return NextResponse.json({ status: false, error: "Signature tidak valid." }, { status: 401 });
  }

  if (!isSuccessStatus(status)) {
    // Not a success/completed callback (e.g. an intermediate status) — acknowledge, no credit granted.
    return NextResponse.json({ status: true });
  }

  try {
    await ensureDbConnection();
    await completeTopup(refId);
    return NextResponse.json({ status: true });
  } catch (err) {
    console.error("Topup callback processing failed:", err);
    return NextResponse.json({ status: false, error: "Gagal memproses callback." }, { status: 500 });
  }
}

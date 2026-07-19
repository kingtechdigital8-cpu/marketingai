import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ProviderNotConfiguredError } from "@/lib/errors";

const API_BASE = "https://api.tokopay.id/v1";
const SETTING_KEYS = ["tokopay.merchant_id", "tokopay.secret_key", "tokopay.channel", "tokopay.enabled"];

interface TokopayConfig {
  merchantId: string;
  secretKey: string;
  channel: string;
}

async function getTokopayConfig(): Promise<TokopayConfig> {
  const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const merchantId = settings["tokopay.merchant_id"];
  const secretKey = settings["tokopay.secret_key"];
  const channel = settings["tokopay.channel"] || "QRIS";
  const enabled = settings["tokopay.enabled"] === "true";

  if (!enabled || !merchantId || !secretKey) {
    throw new ProviderNotConfiguredError(
      "Payment gateway Tokopay belum dikonfigurasi atau nonaktif. Hubungi admin untuk mengaktifkannya di Pengaturan."
    );
  }

  return { merchantId, secretKey, channel };
}

export function signTokopay(merchantId: string, secretKey: string, refId: string): string {
  return createHash("md5").update(`${merchantId}:${secretKey}:${refId}`).digest("hex");
}

export interface TokopayOrder {
  trxId: string;
  payUrl: string;
  qrString: string | null;
  totalBayar: number;
}

export async function createOrder({
  refId,
  amountIdr,
  customerName,
  customerEmail,
  customerPhone,
}: {
  refId: string;
  amountIdr: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}): Promise<TokopayOrder> {
  const { merchantId, secretKey, channel } = await getTokopayConfig();

  const body = new URLSearchParams({
    merchant_id: merchantId,
    kode_channel: channel,
    reff_id: refId,
    amount: String(amountIdr),
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    expired_ts: String(Math.floor(Date.now() / 1000) + 30 * 60),
    signature: signTokopay(merchantId, secretKey, refId),
  });

  const res = await fetch(`${API_BASE}/order`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "Success" || !data.data) {
    throw new Error(`Tokopay gagal membuat order: ${data?.error_msg || data?.status || res.status}`);
  }

  return {
    trxId: data.data.trx_id,
    payUrl: data.data.pay_url,
    qrString: data.data.qr_string ?? null,
    totalBayar: data.data.total_bayar,
  };
}

export async function checkOrderStatus(refId: string): Promise<{ status: string; trxId: string | null }> {
  const { merchantId, secretKey } = await getTokopayConfig();

  const params = new URLSearchParams({
    merchant_id: merchantId,
    secret: secretKey,
    ref_id: refId,
  });

  const res = await fetch(`${API_BASE}/check-order?${params.toString()}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== 1 || !data.data) {
    throw new Error(`Tokopay gagal cek status order: ${data?.message || res.status}`);
  }

  return { status: data.data.status, trxId: data.data.trx_id ?? null };
}

export function isSuccessStatus(status: string): boolean {
  return status === "Success" || status === "Completed";
}

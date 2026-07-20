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
  qrLink: string | null;
  paymentGuide: string | null;
  totalBayar: number;
}

export async function createOrder({
  refId,
  amountIdr,
}: {
  refId: string;
  amountIdr: number;
}): Promise<TokopayOrder> {
  const { merchantId, secretKey, channel } = await getTokopayConfig();

  // Tokopay's "simple order" endpoint — a plain GET with query params, no JSON
  // body. The "advanced" JSON-body endpoint kept rejecting well-formed JSON
  // with a generic "JSON not valid" error regardless of encoding tried, so
  // this is the reliable path.
  const params = new URLSearchParams({
    merchant: merchantId,
    secret: secretKey,
    ref_id: refId,
    nominal: String(amountIdr),
    metode: channel,
  });

  const res = await fetch(`${API_BASE}/order?${params.toString()}`);
  const rawText = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    // not JSON — rawText itself is the diagnostic
  }

  if (!res.ok || !data || data.status !== "Success" || !data.data) {
    console.error("Tokopay create-order raw response:", res.status, rawText);
    throw new Error(
      `Tokopay gagal membuat order: ${(data?.error_msg as string) || (data?.status as string) || rawText.slice(0, 200) || res.status}`
    );
  }

  const orderData = data.data as Record<string, unknown>;
  return {
    trxId: orderData.trx_id as string,
    payUrl: orderData.pay_url as string,
    qrString: (orderData.qr_string as string) ?? null,
    qrLink: (orderData.qr_link as string) ?? null,
    paymentGuide: (orderData.panduan_pembayaran as string) || null,
    totalBayar: orderData.total_bayar as number,
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

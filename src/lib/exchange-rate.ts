import { prisma } from "@/lib/prisma";
import { CREDIT_USD_VALUE } from "@/lib/pricing-constants";

const SETTING_KEY = "exchange_rate.usd_idr";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — real-time enough for pricing, avoids hammering the API
const API_URL = "https://open.er-api.com/v6/latest/USD";

interface CachedRate {
  rate: number;
  fetchedAt: string;
}

function parseCache(value: string): CachedRate | null {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.rate === "number" && Number.isFinite(parsed.rate) && typeof parsed?.fetchedAt === "string") {
      return parsed;
    }
  } catch {
    // not valid cached JSON
  }
  return null;
}

async function fetchLiveRate(): Promise<number> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Gagal mengambil kurs USD/IDR dari API (${res.status}).`);
  }
  const data = await res.json();
  const rate = data?.rates?.IDR;
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("Respons API kurs USD/IDR tidak valid.");
  }
  return rate;
}

/** Live USD->IDR rate, cached in the Setting table for an hour to avoid refetching on every request. */
export async function getUsdToIdrRate(): Promise<{ rate: number; fetchedAt: string }> {
  const cached = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const parsedCache = cached ? parseCache(cached.value) : null;

  if (parsedCache && Date.now() - new Date(parsedCache.fetchedAt).getTime() < CACHE_TTL_MS) {
    return parsedCache;
  }

  try {
    const rate = await fetchLiveRate();
    const fetchedAt = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify({ rate, fetchedAt }) },
      create: { key: SETTING_KEY, value: JSON.stringify({ rate, fetchedAt }) },
    });
    return { rate, fetchedAt };
  } catch (err) {
    // A failed live fetch shouldn't break a top-up flow if we have any cached rate, even a stale one.
    if (parsedCache) return parsedCache;
    throw err;
  }
}

/** How many Rupiah 1 credit costs right now, given the live USD/IDR rate. */
export async function getCreditIdrValue(): Promise<{ idrPerCredit: number; usdIdrRate: number; fetchedAt: string }> {
  const { rate, fetchedAt } = await getUsdToIdrRate();
  return { idrPerCredit: rate * CREDIT_USD_VALUE, usdIdrRate: rate, fetchedAt };
}

/** Converts a Rupiah amount into whole credits at the live rate (rounds down — never grant more than paid for). */
export async function idrToCredits(idrAmount: number): Promise<number> {
  const { idrPerCredit } = await getCreditIdrValue();
  return Math.floor(idrAmount / idrPerCredit);
}

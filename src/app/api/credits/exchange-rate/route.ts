import { NextResponse } from "next/server";
import { getCreditIdrValue } from "@/lib/exchange-rate";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idrParam = searchParams.get("idr");

  try {
    const { idrPerCredit, usdIdrRate, fetchedAt } = await getCreditIdrValue();

    const idrAmount = idrParam !== null ? Number(idrParam) : null;
    const credits =
      idrAmount !== null && Number.isFinite(idrAmount) && idrAmount > 0
        ? Math.floor(idrAmount / idrPerCredit)
        : null;

    return NextResponse.json({ usdIdrRate, idrPerCredit, fetchedAt, credits });
  } catch (err) {
    console.error("Exchange rate fetch failed:", err);
    return NextResponse.json({ error: "Gagal mengambil kurs saat ini. Coba lagi." }, { status: 502 });
  }
}

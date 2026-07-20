"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Coins, RefreshCw, CheckCircle2, History, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { cn } from "@/lib/utils";

type TopupStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

interface TopupHistoryItem {
  id: string;
  refId: string;
  amountIdr: number;
  credits: number;
  status: TopupStatus;
  createdAt: string;
}

interface ActiveTopup {
  refId: string;
  payUrl: string;
  qrLink: string | null;
  paymentGuide: string | null;
  amountIdr: number;
  credits: number;
  status: TopupStatus;
}

const PRESETS_IDR = [50000, 100000, 250000, 500000];

const STATUS_BADGE: Record<TopupStatus, { label: string; variant: "neutral" | "success" | "danger" | "warning" }> = {
  PENDING: { label: "Menunggu Pembayaran", variant: "warning" },
  SUCCESS: { label: "Berhasil", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
  EXPIRED: { label: "Kedaluwarsa", variant: "neutral" },
};

function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default function CreditsPage() {
  const { data: session, update } = useSession();
  const [amountIdr, setAmountIdr] = useState<number>(PRESETS_IDR[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [previewCredits, setPreviewCredits] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTopup, setActiveTopup] = useState<ActiveTopup | null>(null);

  const [history, setHistory] = useState<TopupHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const effectiveAmount = customAmount ? Number(customAmount) : amountIdr;

  function loadHistory() {
    fetch("/api/topup/history")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setHistory(data.topups ?? []);
        setHistoryError(false);
      })
      .catch(() => {
        setHistory([]);
        setHistoryError(true);
      });
  }

  useEffect(loadHistory, []);

  const amountIsValid = Number.isFinite(effectiveAmount) && effectiveAmount >= 10000;

  useEffect(() => {
    if (!amountIsValid) return;
    let cancelled = false;
    fetch(`/api/credits/exchange-rate?idr=${effectiveAmount}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.credits != null) setPreviewCredits(data.credits);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveAmount, amountIsValid]);

  const displayedPreviewCredits = amountIsValid ? previewCredits : null;

  useEffect(() => {
    if (!activeTopup || activeTopup.status !== "PENDING") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/topup/${activeTopup.refId}`);
      const data = await res.json().catch(() => null);
      if (data?.status && data.status !== activeTopup.status) {
        setActiveTopup((current) => (current ? { ...current, status: data.status } : current));
        if (data.status === "SUCCESS") {
          const balanceRes = await fetch("/api/credits/balance");
          const balanceData = await balanceRes.json().catch(() => null);
          if (balanceData) await update({ creditBalance: balanceData.creditBalance });
          loadHistory();
        }
      }
    }, 4000);
    return () => clearInterval(id);
  }, [activeTopup, update]);

  async function handleSubmit() {
    setError(null);
    if (!Number.isFinite(effectiveAmount) || effectiveAmount < 10000) {
      setError("Nominal top up minimal Rp10.000.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountIdr: effectiveAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat pesanan top up.");
        return;
      }
      setActiveTopup({
        refId: data.refId,
        payUrl: data.payUrl,
        qrLink: data.qrLink ?? null,
        paymentGuide: data.paymentGuide ?? null,
        amountIdr: data.amountIdr,
        credits: data.credits,
        status: "PENDING",
      });
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resumeTopup(refId: string) {
    const res = await fetch(`/api/topup/${refId}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return;
    setActiveTopup({
      refId: data.refId,
      payUrl: data.payUrl,
      qrLink: data.qrLink ?? null,
      paymentGuide: data.paymentGuide ?? null,
      amountIdr: data.amountIdr,
      credits: data.credits,
      status: data.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Kredit Saya</h1>
          <p className="text-sm text-muted">Top up kredit dan lihat riwayat transaksi Anda.</p>
        </div>
        <Badge variant="brand" className="text-sm">
          <Coins className="h-4 w-4" />
          {(session?.user.creditBalance ?? 0).toLocaleString("id-ID")} kredit
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Up Kredit</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PRESETS_IDR.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmountIdr(preset);
                    setCustomAmount("");
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-center transition-colors",
                    !customAmount && amountIdr === preset
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-foreground hover:border-border-strong"
                  )}
                >
                  <p className="text-sm font-bold">{formatIdr(preset)}</p>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Atau masukkan nominal sendiri (Rp)</label>
              <input
                type="number"
                min={10000}
                step={1000}
                placeholder="mis. 75000"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              />
            </div>

            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Total Bayar</span>
                <span className="font-semibold text-foreground">{formatIdr(effectiveAmount || 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted">Kredit Diterima</span>
                <span className="font-semibold text-brand">
                  {displayedPreviewCredits !== null ? `${displayedPreviewCredits.toLocaleString("id-ID")} kredit` : "-"}
                </span>
              </div>
            </div>

            {error && <ErrorNotice message={error} />}

            {activeTopup ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                {activeTopup.status === "SUCCESS" ? (
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="text-sm font-medium">
                      Pembayaran berhasil! {activeTopup.credits.toLocaleString("id-ID")} kredit telah ditambahkan.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-warning">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <p className="text-sm font-medium">Menunggu pembayaran...</p>
                    </div>
                    {activeTopup.qrLink ? (
                      <div className="flex flex-col items-center gap-2 self-center">
                        {/* eslint-disable-next-line @next/next/no-img-element -- external payment provider QR image URL */}
                        <img
                          src={activeTopup.qrLink}
                          alt="Kode QRIS pembayaran"
                          className="h-56 w-56 rounded-lg border border-border bg-white p-2"
                        />
                        <p className="text-xs text-muted">
                          Scan kode QRIS di atas pakai aplikasi e-wallet atau m-banking Anda.
                        </p>
                      </div>
                    ) : activeTopup.payUrl ? (
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-xs text-muted">
                          Kode QR tidak tersedia untuk transaksi ini. Selesaikan pembayaran lewat tautan berikut.
                        </p>
                        <a
                          href={activeTopup.payUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Buka Halaman Pembayaran
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        Halaman ini otomatis update begitu pembayaran diterima.
                      </p>
                    )}
                    {activeTopup.paymentGuide && (
                      <div
                        className="flex flex-col gap-1 text-xs text-muted [&_p]:leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: activeTopup.paymentGuide }}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!effectiveAmount}>
                <Coins className="h-4 w-4" />
                Top Up Sekarang
              </Button>
            )}

            <p className="text-xs text-muted">Pembayaran diproses aman &amp; terenkripsi.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-brand" />
              Riwayat Top Up
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!history ? (
              <div className="flex flex-col gap-2 p-5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.06]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.06]" />
              </div>
            ) : historyError ? (
              <div className="p-5">
                <ErrorNotice message="Gagal memuat riwayat." />
              </div>
            ) : history.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={History} title="Belum ada riwayat" />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Nominal</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 text-foreground">{formatIdr(item.amountIdr)}</td>
                      <td className="px-5 py-3 text-muted">{item.credits.toLocaleString("id-ID")}</td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {item.status === "PENDING" && (
                          <button
                            onClick={() => resumeTopup(item.refId)}
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            Lanjutkan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

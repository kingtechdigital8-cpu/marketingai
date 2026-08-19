"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Info, ArrowRight, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonVariants } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { PageHeader } from "@/components/ui/PageHeader";

interface AiProvider {
  id: string;
  name: string;
  category: string;
  model: string | null;
  enabled: boolean;
  baseCost: number;
  markupPercent: number;
}

interface CreditCosts {
  SEO_KEYWORDS: number;
  SEO_META: number;
  SEO_ARTICLE: number;
  IMAGE_GENERATION: number;
  VIDEO_GENERATION: number;
  VOICE_DUB: number;
  TIKTOK_LIVE_REPLY: number;
  VIDEO_CLIP_ANALYSIS: number;
  VIDEO_CLIP_PER_CLIP_BASE: number;
  VIDEO_CLIP_HEADLINE_ADDON: number;
  VIDEO_CLIP_CAPTION_ADDON: number;
}

interface ExchangeRate {
  usdIdrRate: number;
  idrPerCredit: number;
  fetchedAt: string;
}

const FEATURES: { key: keyof CreditCosts; label: string; note: string }[] = [
  { key: "SEO_KEYWORDS", label: "Riset Kata Kunci SEO", note: "OpenAI Teks + ~10x Serper Search (estimasi ide kata kunci)" },
  { key: "SEO_META", label: "Meta Deskripsi SEO", note: "OpenAI Teks" },
  { key: "SEO_ARTICLE", label: "Artikel SEO", note: "OpenAI Teks + ~5x Serper Search (cek keunikan konten)" },
  { key: "IMAGE_GENERATION", label: "Generate Gambar Iklan", note: "OpenAI Gambar" },
  { key: "VIDEO_GENERATION", label: "Generate Video Iklan", note: "fal.ai Video × 5 detik (durasi default)" },
  { key: "VOICE_DUB", label: "Voice Changer", note: "fal.ai Lipsync × 5 detik + OpenAI Text-to-Speech" },
  { key: "TIKTOK_LIVE_REPLY", label: "Balasan Live TikTok", note: "OpenAI Teks + ElevenLabs TTS (~200 karakter)" },
  { key: "VIDEO_CLIP_ANALYSIS", label: "Auto Clip — Analisis Video", note: "OpenAI Whisper × 5 menit + OpenAI Teks" },
  { key: "VIDEO_CLIP_PER_CLIP_BASE", label: "Auto Clip — per Klip Dihasilkan", note: "Proses video (ffmpeg + bandwidth penyimpanan)" },
  { key: "VIDEO_CLIP_HEADLINE_ADDON", label: "Auto Clip — Tambahan Headline", note: "OpenAI Teks (opsional per klip)" },
  { key: "VIDEO_CLIP_CAPTION_ADDON", label: "Auto Clip — Tambahan Caption Sosial", note: "OpenAI Teks (opsional per klip)" },
];

function formatIdr(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function AdminCreditPricingPage() {
  const [providers, setProviders] = useState<AiProvider[] | null>(null);
  const [costs, setCosts] = useState<CreditCosts | null>(null);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/ai-providers").then((r) => r.json()),
      fetch("/api/credit-costs").then((r) => r.json()),
      fetch("/api/credits/exchange-rate").then((r) => r.json()),
    ])
      .then(([providersData, costsData, rateData]) => {
        setProviders(providersData.providers ?? []);
        setCosts(costsData);
        setRate(rateData);
      })
      .catch(() => setLoadError(true));
  }, []);

  const loaded = providers && costs && rate;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Harga Kredit"
        description="Ringkasan biaya kredit setiap fitur AI, dihitung otomatis dari biaya dasar dan markup provider."
        icon={Coins}
        actions={
          <Link href="/admin/ai-providers" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Bot className="h-3.5 w-3.5" />
            Kelola Provider
          </Link>
        }
      />

      {loadError && <ErrorNotice message="Gagal memuat data harga kredit. Coba muat ulang halaman." />}

      {!loaded ? (
        !loadError && <p className="text-sm text-muted">Memuat...</p>
      ) : (
        <>
          <Card className="border-brand/20 bg-brand-soft/40">
            <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Info className="h-4 w-4 text-brand" />
                <span>
                  1 kredit = <span className="font-semibold">$0.05 USD</span> ≈{" "}
                  <span className="font-semibold">{formatIdr(rate.idrPerCredit)}</span> pada kurs saat ini
                </span>
              </div>
              <span className="text-xs text-muted">
                Kurs USD/IDR: {rate.usdIdrRate.toLocaleString("id-ID", { maximumFractionDigits: 0 })} · diperbarui{" "}
                {new Date(rate.fetchedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-brand" />
                Biaya per Fitur
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fitur</th>
                    <th className="px-5 py-3 font-medium">Estimasi Kredit</th>
                    <th className="px-5 py-3 font-medium">Estimasi Rp</th>
                    <th className="px-5 py-3 font-medium">Komponen Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f) => {
                    const creditCost = costs[f.key];
                    return (
                      <tr key={f.key} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 font-medium text-foreground">{f.label}</td>
                        <td className="px-5 py-3">
                          <Badge variant="brand">{creditCost < 1 ? creditCost.toFixed(2) : Math.ceil(creditCost)} kredit</Badge>
                        </td>
                        <td className="px-5 py-3 text-muted">{formatIdr(creditCost * rate.idrPerCredit)}</td>
                        <td className="px-5 py-3 text-xs text-muted">{f.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-border px-5 py-3 text-xs text-muted">
                Estimasi berdasarkan pemakaian tipikal (lihat kolom Komponen Biaya) — biaya sebenarnya yang dipotong dari
                pengguna dihitung tepat saat proses generate berjalan, berdasarkan panggilan API yang benar-benar terjadi.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand" />
                Biaya Dasar per Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Provider</th>
                    <th className="px-5 py-3 font-medium">Model</th>
                    <th className="px-5 py-3 font-medium">Biaya Dasar</th>
                    <th className="px-5 py-3 font-medium">Markup</th>
                    <th className="px-5 py-3 font-medium">Harga Jual</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                      <td className="px-5 py-3 text-muted">{p.model || "-"}</td>
                      <td className="px-5 py-3 text-muted">{p.baseCost} kredit</td>
                      <td className="px-5 py-3 text-muted">{p.markupPercent}%</td>
                      <td className="px-5 py-3 font-medium text-foreground">
                        {Math.ceil(p.baseCost * (1 + p.markupPercent / 100))} kredit
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={p.enabled ? "success" : "neutral"}>{p.enabled ? "Aktif" : "Nonaktif"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-xs text-muted">Ubah biaya dasar, markup, atau aktifkan/nonaktifkan provider di halaman Provider AI.</p>
                <Link href="/admin/ai-providers" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  Buka Provider AI
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

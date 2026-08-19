import Link from "next/link";
import type { Metadata } from "next";
import { Coins, ShieldCheck, RefreshCcw, Wallet, Sparkles, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { OG_IMAGE } from "@/lib/site";

const title = "Harga & Sistem Kredit";
const description =
  "Satu saldo kredit untuk semua fitur AI MarketingAI: Live TikTok, Auto Clip, SEO, gambar, dan video. Tidak ada paket terpisah, tidak ada langganan bulanan.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["harga MarketingAI", "sistem kredit AI", "biaya tools AI marketing", "top up kredit AI"],
  alternates: { canonical: "/harga" },
  openGraph: { title, description, url: "/harga", type: "website", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
};

const howItWorks = [
  {
    icon: Wallet,
    title: "Top Up Saldo Kredit",
    description: "Isi saldo kredit lewat QRIS atau e-wallet via Tokopay, langsung masuk ke akun Anda.",
  },
  {
    icon: Sparkles,
    title: "Pakai untuk Fitur Apapun",
    description: "Satu saldo yang sama berlaku untuk semua fitur: Live TikTok, Auto Clip, SEO, gambar, dan video.",
  },
  {
    icon: RefreshCcw,
    title: "Aman Kalau Gagal",
    description: "Kalau proses generate gagal di tengah jalan, kredit yang sudah terpotong otomatis dikembalikan.",
  },
];

export default function HargaPage() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
      <div className="glow-orb left-1/2 top-0 h-64 w-96 -translate-x-1/2 opacity-30" />
      <Reveal>
        <span className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          <Coins className="h-3.5 w-3.5" />
          Sistem Kredit
        </span>
        <h1 className="text-3xl font-bold sm:text-4xl">Bayar Sesuai Pemakaian</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Satu saldo kredit untuk semua fitur: Live TikTok, Auto Clip, SEO, gambar, dan video. Tidak ada paket
          terpisah, tidak ada langganan bulanan. Top-up mudah lewat QRIS &amp; e-wallet.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Transaksi aman &amp; tercatat rapi
          </span>
          <span className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-brand" />
            Kredit gagal generate otomatis dikembalikan
          </span>
        </div>
        <div className="mt-6">
          <Link href="/register" className={buttonVariants({ size: "lg", className: "group" })}>
            Coba Gratis Sekarang
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>

      <div className="mt-20 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {howItWorks.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.08}>
            <Card className="h-full">
              <CardContent className="flex h-full flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <h2 className="text-base font-semibold">{item.title}</h2>
                <p className="text-sm text-muted">{item.description}</p>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

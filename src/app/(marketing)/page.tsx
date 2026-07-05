import Link from "next/link";
import {
  Search,
  Image as ImageIcon,
  Video,
  Shapes,
  Camera,
  Coins,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";

const features = [
  {
    icon: Search,
    title: "SEO Otomatis",
    description: "Riset kata kunci, meta description, dan artikel SEO dibuat AI dalam hitungan detik.",
  },
  {
    icon: ImageIcon,
    title: "Gambar",
    description: "Hasilkan visual iklan, banner, dan gambar promosi untuk berbagai platform media sosial.",
  },
  {
    icon: Video,
    title: "Video",
    description: "Buat video promosi produk profesional tanpa perlu tim produksi.",
  },
  {
    icon: Shapes,
    title: "Logo",
    description: "Ciptakan identitas merek dengan logo yang dihasilkan AI sesuai gaya bisnis Anda.",
  },
  {
    icon: Camera,
    title: "Foto Produk",
    description: "Percantik dan hasilkan foto produk berkualitas studio dari foto biasa.",
  },
];

const steps = [
  { title: "Daftar & Isi Kredit", description: "Buat akun dan top-up kredit lewat QRIS/e-wallet via Tokopay." },
  { title: "Pilih Fitur AI", description: "Pilih kebutuhan: SEO, gambar, video, logo, atau foto produk." },
  { title: "Unduh Hasil", description: "Hasil generate tersimpan rapi di galeri aset, siap dipakai kapan saja." },
];

const stack = ["OpenAI", "Cloudflare R2", "Tokopay", "MySQL"];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="glow-orb animate-float-slow -top-32 left-1/4 h-80 w-80 opacity-60" />
        <div
          className="glow-orb animate-float-slow -top-10 right-1/4 h-72 w-72 opacity-40"
          style={{ animationDelay: "2s" }}
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-24 text-center sm:px-6 sm:pt-32">
          <Reveal>
            <span className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              Terintegrasi AI Profesional
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              <span className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                Satu Platform untuk
              </span>
              <br />
              <span className="bg-gradient-to-r from-brand via-emerald-300 to-white bg-clip-text text-transparent">
                Semua Kebutuhan Marketing
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
              SEO, gambar &amp; video, logo, hingga foto produk — semua dibuat dengan bantuan AI,
              cepat, stabil, dan siap pakai.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className={buttonVariants({ size: "lg", className: "group" })}>
                Mulai Sekarang
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#fitur" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Lihat Fitur
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mx-auto mt-16 flex max-w-lg flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-border pt-8">
              {stack.map((name) => (
                <span key={name} className="text-sm font-medium tracking-wide text-muted/70">
                  {name}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="fitur" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Semua Kebutuhan Marketing dalam Satu Tempat</h2>
            <p className="mt-3 text-muted">Ditenagai model AI terbaik untuk hasil yang stabil dan profesional.</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.06}>
              <Card className="group h-full transition-all duration-300 hover:border-brand/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                <CardContent className="flex h-full flex-col gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-300 group-hover:scale-110">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted">{feature.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-border bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold sm:text-4xl">Cara Kerja</h2>
            </div>
          </Reveal>
          <div className="relative grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent sm:block" />
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.1} className="relative text-center">
                <div className="relative mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-background text-sm font-bold text-brand shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                  {index + 1}
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="harga" className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
        <div className="glow-orb left-1/2 top-0 h-64 w-96 -translate-x-1/2 opacity-30" />
        <Reveal>
          <span className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            <Coins className="h-3.5 w-3.5" />
            Sistem Kredit
          </span>
          <h2 className="text-3xl font-bold sm:text-4xl">Bayar Sesuai Pemakaian</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Top-up kredit sekali, gunakan untuk fitur apa saja. Pembayaran mudah lewat QRIS &amp; e-wallet.
          </p>
          <div className="mt-9 flex items-center justify-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Transaksi aman &amp; tercatat rapi
          </div>
          <div className="mt-6">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Coba Gratis Sekarang
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}

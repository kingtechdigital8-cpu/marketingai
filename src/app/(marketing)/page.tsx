import Link from "next/link";
import type { Metadata } from "next";
import {
  Search,
  Radio,
  Scissors,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  RefreshCcw,
  Wand2,
  Video as VideoIcon,
  Image as ImageIcon,
  Mic,
  UserRound,
  Smile,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { ServiceShowcaseVisual } from "@/components/marketing/ServiceShowcaseVisual";
import { HeroShowcaseCarousel } from "@/components/marketing/HeroShowcaseCarousel";
import { getShowcaseMedia } from "@/lib/marketing-showcase-media";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  // No top-level `title` here deliberately — SITE_TITLE already includes
  // "MarketingAI", and the root layout's title.template ("%s | MarketingAI")
  // would wrap ANY string given here, doubling the brand name in the <title>
  // tag. Omitting it falls through to the root's untemplated title.default
  // (the same SITE_TITLE string), which is exactly what the homepage wants.
  // openGraph.title/twitter.title aren't run through that template, so they
  // set SITE_TITLE directly with no such conflict.
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/", type: "website", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [OG_IMAGE.url] },
};

// Declared once, on the homepage — Organization/WebSite schema describes the
// SITE as a whole, not a specific page, so it doesn't belong on every route
// the way the per-tool SoftwareApplication/FAQPage schema in
// fitur/[slug]/page.tsx does.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.ico`,
    },
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "id-ID",
    },
  ],
};

// Two-tier presentation, per explicit instruction: Live TikTok AI and Auto
// Clip are the flagship differentiators, so they get the full showcase
// treatment (badge + heading + highlight checklist + CTA + a living mockup
// from ServiceShowcaseVisual) one-by-one below. SEO/Gambar/Video are real
// but secondary tools — presented compactly further down under "Fitur
// Tambahan" instead of competing for the same visual weight. This is
// presentation copy, not the SEO article content in TOOLS_CONTENT
// (src/lib/tools-content.ts), so it's kept separate and free to be
// punchier/shorter for a landing page skim.
interface ServiceHighlight {
  icon: LucideIcon;
  text: string;
}

interface ServiceSection {
  slug: string;
  icon: LucideIcon;
  badgeLabel: string;
  heading: string;
  description: string;
  highlights: ServiceHighlight[];
  ctaLabel: string;
}

const PRIMARY_SERVICES: ServiceSection[] = [
  {
    slug: "live-tiktok-ai",
    icon: Radio,
    badgeLabel: "Real-time",
    heading: "Live TikTok AI: Avatar 3D Interaktif Balas Live Anda Otomatis",
    description:
      "Live jalan terus meski Anda sedang sibuk packing pesanan atau istirahat. Avatar 3D interaktif tampil menjawab komentar penonton secara real-time, lengkap gerak bibir & ekspresi mengikuti suara AI, jadi interaksi tetap terasa hidup tanpa Anda harus standby di depan kamera.",
    highlights: [
      {
        icon: UserRound,
        text: "Live tetap terasa ada host aktif meski Anda sedang sibuk, avatar 3D bisa dari galeri atau avatar VRM sendiri",
      },
      {
        icon: Smile,
        text: "Penonton merasa dijawab host sungguhan, bukan bot teks, sebab gerak bibir & ekspresi bikin interaksi terasa hidup",
      },
      { icon: Radio, text: "Tidak ada komentar yang terlewat walau live sedang ramai, semua pertanyaan terbaca tanpa jeda" },
      { icon: Mic, text: "Hemat waktu balas satu-satu karena AI menyusun dan membacakan jawaban otomatis dengan suara natural" },
      {
        icon: Sparkles,
        text: "Gaya bicara & gestur bisa disesuaikan persona brand Anda, tetap terasa personal meski berjalan otomatis",
      },
    ],
    ctaLabel: "Coba Live TikTok AI",
  },
  {
    slug: "auto-clip",
    icon: Scissors,
    badgeLabel: "Fitur Andalan",
    heading: "Auto Clip: Video Panjang Jadi Konten Pendek Otomatis",
    description: "Cukup unggah video atau tempel link YouTube, jelaskan momen yang dicari, AI yang urus sisanya.",
    highlights: [
      { icon: Wand2, text: "AI mencari momen terbaik otomatis, bukan asal potong di tengah pembicaraan" },
      { icon: Sparkles, text: "Headline hook dibuat AI sesuai isi klip, posisi & gaya bisa diatur bebas" },
      { icon: CheckCircle2, text: "Caption otomatis dengan 8 pilihan animasi, termasuk mode karaoke per kata" },
      { icon: RefreshCcw, text: "Crop otomatis mengikuti wajah yang sedang bicara, tanpa biaya tambahan" },
      { icon: VideoIcon, text: "Dukung unggah langsung atau link YouTube, durasi sumber sampai 2 jam" },
      { icon: ImageIcon, text: "Output vertikal 9:16 untuk Reels/TikTok/Shorts, atau format kotak 1:1" },
    ],
    ctaLabel: "Coba Auto Clip",
  },
];

// Compact cards, not full showcase sections — SEO/Gambar/Video are real
// tools but secondary to the two flagship features above, per explicit
// instruction.
interface AdditionalService {
  slug: string;
  icon: LucideIcon;
  name: string;
  description: string;
}

const ADDITIONAL_SERVICES: AdditionalService[] = [
  {
    slug: "seo-otomatis",
    icon: Search,
    name: "SEO Otomatis",
    description: "Riset kata kunci, data kompetitor, meta description, dan artikel SEO dibuat AI.",
  },
  {
    slug: "generator-gambar",
    icon: ImageIcon,
    name: "Generator Gambar",
    description: "Visual iklan, banner, dan gambar promosi langsung dari deskripsi teks.",
  },
  {
    slug: "generator-video",
    icon: VideoIcon,
    name: "Generator Video",
    description: "Video iklan produk dari gambar dan Voice Changer dalam satu tools.",
  },
];

// The actual AI models behind each feature (see AiProvider.model in the
// database), not the hosting/infra/payment vendors that serve them — a
// visitor recognizes "GPT-4o" or "Kling AI" as a trust signal, not "fal.ai"
// (just the API aggregator Kling happens to be served through) or "Cloudflare
// R2"/"Tokopay" (storage and payments, unrelated to generation quality).
const providers = ["GPT-4o", "GPT Image 1", "Whisper", "Kling AI", "ElevenLabs", "Chirp 3 HD"];

export default async function LandingPage() {
  const media = await getShowcaseMedia();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />

      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="glow-orb -top-32 left-[8%] h-96 w-96 opacity-40" />
        <div className="glow-orb -top-16 right-[4%] h-72 w-72 opacity-25" style={{ animationDelay: "2s" }} />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pb-24 pt-24 sm:px-6 sm:pt-28 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32">
          <div>
            <Reveal>
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                <span className="h-px w-8 bg-gradient-to-r from-brand to-transparent" />
                Creative &middot; Automation &middot; Growth
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
                <span className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
                  Satu Platform untuk
                </span>
                <br />
                <span className="bg-gradient-to-r from-brand via-emerald-300 to-brand bg-clip-text text-transparent">
                  Semua Kebutuhan Marketing
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.1}>
              <p className="mt-6 max-w-lg text-lg text-muted">
                Live TikTok AI dengan avatar 3D interaktif, Auto Clip untuk konten pendek, plus SEO, gambar, dan video
                iklan. Semua dibuat AI, cepat, stabil, dan siap pakai.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="mt-10 flex flex-col items-start gap-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/register" className={buttonVariants({ size: "lg", className: "group" })}>
                    Mulai Sekarang
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a href="#fitur" className={buttonVariants({ variant: "outline", size: "lg" })}>
                    Lihat Fitur
                  </a>
                </div>
                <p className="text-xs text-muted">Gratis coba dengan kredit awal, tanpa kartu kredit.</p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <HeroShowcaseCarousel media={media} />
          </Reveal>
        </div>
      </section>

      {PRIMARY_SERVICES.map((service, index) => {
        const reversed = index % 2 === 1;
        return (
          <section
            key={service.slug}
            id={index === 0 ? "fitur" : undefined}
            className={cn("relative overflow-hidden py-20", reversed && "border-y border-border bg-surface/40")}
          >
            <div
              className={cn(
                "glow-orb h-72 w-72 opacity-25",
                reversed ? "-bottom-24 right-0" : "-bottom-24 left-0"
              )}
            />
            <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
              <Reveal className={reversed ? "lg:order-2" : undefined}>
                <Badge variant="brand" className="mb-4">
                  <service.icon className="h-3 w-3" />
                  {service.badgeLabel}
                </Badge>
                <h3 className="text-3xl font-bold sm:text-4xl">{service.heading}</h3>
                <p className="mt-4 text-muted">{service.description}</p>
                <ul className="mt-7 flex flex-col gap-4">
                  {service.highlights.map((item, i) => (
                    <Reveal key={item.text} delay={0.05 + i * 0.05} y={12}>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                          <item.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-sm text-foreground/90">{item.text}</span>
                      </li>
                    </Reveal>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link href="/register" className={buttonVariants({ className: "group" })}>
                    {service.ctaLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.1} className={reversed ? "lg:order-1" : undefined}>
                <ServiceShowcaseVisual slug={service.slug} mediaUrl={service.slug === "auto-clip" ? media.clip : undefined} />
              </Reveal>
            </div>
          </section>
        );
      })}

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Fitur Tambahan</h2>
            <p className="mt-3 text-muted">Dilengkapi juga dengan tools AI lain untuk kebutuhan marketing sehari-hari.</p>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ADDITIONAL_SERVICES.map((service, index) => (
            <Reveal key={service.slug} delay={index * 0.08}>
              <Link href={`/fitur/${service.slug}`}>
                <Card className="group h-full transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                  <CardContent className="flex h-full flex-col gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-300 group-hover:scale-110">
                      <service.icon className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-base font-semibold">{service.name}</h3>
                    <p className="text-sm text-muted">{service.description}</p>
                    <span className="mt-auto flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      Pelajari lebih lanjut
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/40 py-14">
        <Reveal>
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-muted">
            Ditenagai teknologi terpercaya
          </p>
        </Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden px-4 sm:px-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface/40 to-transparent sm:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface/40 to-transparent sm:w-32" />
          <div className="animate-marquee flex w-max items-center gap-14">
            {[...providers, ...providers].map((name, i) => (
              <span key={`${name}-${i}`} className="whitespace-nowrap text-lg font-semibold tracking-wide text-muted/70">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}

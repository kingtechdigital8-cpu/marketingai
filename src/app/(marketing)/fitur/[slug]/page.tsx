import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { TOOLS_CONTENT, getToolBySlug } from "@/lib/tools-content";
import { OG_IMAGE } from "@/lib/site";

export function generateStaticParams() {
  return TOOLS_CONTENT.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return {};

  // Root layout's metadata.title.template ("%s | MarketingAI") appends the
  // brand suffix automatically — setting it here too would double it up.
  const title = tool.seoTitle;
  const url = `/fitur/${tool.slug}`;
  return {
    title,
    description: tool.metaDescription,
    keywords: tool.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: tool.metaDescription,
      type: "website",
      url,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool.metaDescription,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function ToolArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) notFound();

  const otherTools = TOOLS_CONTENT.filter((t) => t.slug !== tool.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `${tool.name} - MarketingAI`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: tool.metaDescription,
      },
      {
        "@type": "FAQPage",
        mainEntity: tool.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="glow-orb animate-float-slow -top-32 left-1/3 h-80 w-80 opacity-50" />

        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-1.5 text-xs text-muted">
            <Link href="/" className="hover:text-foreground">
              Beranda
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/#fitur" className="hover:text-foreground">
              Fitur
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{tool.name}</span>
          </nav>

          <Reveal>
            <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <tool.icon className="h-6 w-6" />
            </span>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{tool.name}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{tool.tagline}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={buttonVariants({ size: "lg", className: "group" })}>
                Coba {tool.name}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/harga" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Lihat Sistem Kredit
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <Reveal>
          <article className="prose-invert flex flex-col gap-4 text-base leading-relaxed text-foreground/90">
            {tool.intro.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </article>
        </Reveal>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 className="mb-8 text-2xl font-bold sm:text-3xl">Yang Bisa Dilakukan {tool.name}</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tool.highlights.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06}>
              <Card className="h-full transition-all duration-300 hover:border-brand/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                  </div>
                  <p className="text-sm text-muted">{item.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/40 py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Reveal>
            <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">Cara Pakai {tool.name}</h2>
          </Reveal>
          <div className="relative grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent sm:block" />
            {tool.steps.map((step, index) => (
              <Reveal key={step} delay={index * 0.1} className="relative text-center">
                <div className="relative mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-background text-sm font-bold text-brand shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                  {index + 1}
                </div>
                <p className="text-sm text-muted">{step}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">Pertanyaan Umum</h2>
        </Reveal>
        <Reveal delay={0.05}>
          <FaqAccordion items={tool.faqs} />
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 className="mb-8 text-2xl font-bold sm:text-3xl">Fitur Lainnya</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {otherTools.map((other, index) => (
            <Reveal key={other.slug} delay={index * 0.05}>
              <Link href={`/fitur/${other.slug}`} className="group block h-full">
                <Card className="h-full transition-all duration-300 hover:-translate-y-1 hover:border-brand/40">
                  <CardContent className="flex h-full flex-col gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-300 group-hover:scale-110">
                      <other.icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold">{other.name}</h3>
                    <p className="text-xs text-muted">{other.tagline}</p>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <div className="glow-orb left-1/2 top-0 h-64 w-96 -translate-x-1/2 opacity-25" />
        <Reveal>
          <h2 className="text-3xl font-bold sm:text-4xl">Mulai Pakai {tool.name} Sekarang</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">
            Daftar gratis, isi kredit lewat QRIS/e-wallet, dan langsung coba fiturnya.
          </p>
          <div className="mt-8">
            <Link href="/register" className={buttonVariants({ size: "lg", className: "group" })}>
              Daftar Gratis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}

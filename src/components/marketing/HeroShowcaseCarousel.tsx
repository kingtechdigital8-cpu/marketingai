"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  Play,
  Radio,
  Image as ImageIcon,
  Video as VideoIcon,
  Scissors,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { ShowcaseMedia } from "@/lib/marketing-showcase-media";

// Replaces the old single-card hero visual — a globe backdrop (purely
// decorative, evokes "works for any live/marketing audience" without a real
// map asset) behind a 3D coverflow carousel cycling through a compact mockup
// per service. Ordered to match the site's flagship-first priority (see
// PRIMARY_SERVICES in page.tsx) — Live TikTok AI and Auto Clip lead.
const SLIDES: { slug: string; name: string; icon: LucideIcon }[] = [
  { slug: "live-tiktok-ai", name: "Live TikTok AI", icon: Radio },
  { slug: "auto-clip", name: "Auto Clip", icon: Scissors },
  { slug: "seo-otomatis", name: "SEO Otomatis", icon: Search },
  { slug: "generator-gambar", name: "Generator Gambar", icon: ImageIcon },
  { slug: "generator-video", name: "Generator Video", icon: VideoIcon },
];

const WAVEFORM_HEIGHTS = [35, 65, 100, 50, 80, 40, 90, 55, 70, 30];

function CardFrame({ children }: { children: ReactNode }) {
  return <div className="relative h-80 w-full overflow-hidden rounded-xl bg-black/30">{children}</div>;
}

function SeoCardVisual() {
  return (
    <CardFrame>
      <div className="absolute left-4 right-4 top-4 flex items-center gap-2 rounded-lg border border-border-strong bg-black/40 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="animate-typing-caption text-xs text-foreground/80">jasa cuci sofa jakarta</span>
      </div>
      <div className="absolute bottom-5 left-4 right-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Badge variant="brand" className="h-5 px-2 py-0 text-[10px]">
            #1
          </Badge>
          <div className="h-2 flex-1 rounded-full bg-brand-soft">
            <div className="animate-bar-pulse h-full w-full rounded-full bg-brand" />
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-40">
          <span className="w-6 text-[10px] text-muted">#2</span>
          <div className="h-2 w-2/3 rounded-full bg-white/15" />
        </div>
      </div>
    </CardFrame>
  );
}

function GambarCardVisual({ mediaUrl }: { mediaUrl?: string | null }) {
  return (
    <CardFrame>
      <div className="absolute inset-4 overflow-hidden rounded-lg border border-border-strong bg-black/30">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external R2 CDN URL, domain not known at build time for next/image
          <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-brand/25 via-transparent to-emerald-300/15" />
        )}
        <div className="animate-scan-sweep absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-brand/40 to-transparent" />
      </div>
      <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-brand">
        <Sparkles className="h-3 w-3" />
        AI
      </span>
    </CardFrame>
  );
}

function VideoCardVisual({ mediaUrl }: { mediaUrl?: string | null }) {
  if (mediaUrl) {
    // The real generated video is already visibly playing (autoplay/loop) —
    // a play button + waveform on top of it would just be redundant clutter,
    // so those only exist for the abstract fallback below.
    return (
      <CardFrame>
        <video
          src={mediaUrl}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      </CardFrame>
    );
  }

  return (
    <CardFrame>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand text-[#04120c] shadow-[0_0_25px_rgba(16,185,129,0.4)]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
          <Play fill="currentColor" className="relative h-6 w-6 translate-x-[2px]" />
        </span>
        <div className="flex h-12 items-end justify-center gap-[4px]">
          {WAVEFORM_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className="animate-wave-pulse w-[4px] rounded-full bg-brand/70"
              style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }}
            />
          ))}
        </div>
      </div>
    </CardFrame>
  );
}

function AutoClipCardVisual({ mediaUrl }: { mediaUrl?: string | null }) {
  return (
    <CardFrame>
      <div className="absolute left-1/2 top-1/2 aspect-[9/16] h-[96%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border-strong bg-gradient-to-b from-brand-soft via-background to-surface-2">
        {mediaUrl ? (
          <>
            <video
              src={mediaUrl}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-black/30" />
          </>
        ) : null}
        {/* Real clips already have their own headline/caption burned into the video, so these placeholder labels only show for the abstract fallback (no real media yet) — otherwise they'd duplicate and clash with what's actually in the frame. */}
        {!mediaUrl && (
          <>
            <div className="absolute left-1/2 top-3 w-[82%] -translate-x-1/2 rounded-md border border-white/10 bg-black/50 px-1.5 py-1.5 text-center">
              <span className="whitespace-nowrap text-[10px] font-bold leading-tight text-white">Tips Naik Omzet</span>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <span className="animate-typing-caption whitespace-nowrap rounded bg-brand px-2 py-1 text-[9px] font-semibold text-[#04120c]">
                caption on
              </span>
            </div>
          </>
        )}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-danger px-1.5 py-0.5 text-[8px] font-bold text-white">
          <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
          REC
        </span>
      </div>
    </CardFrame>
  );
}

function LiveTiktokCardVisual() {
  return (
    <CardFrame>
      <span className="absolute left-3.5 top-3.5 flex items-center gap-1 rounded-full bg-danger px-2 py-1 text-[10px] font-bold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        LIVE
      </span>
      <div className="absolute inset-x-0 top-16 flex justify-center">
        <div className="relative">
          <span className="absolute -inset-4 rounded-full bg-brand/25 blur-md" />
          <div className="relative h-14 w-14 rounded-full border border-brand/50 bg-gradient-to-br from-brand-soft via-brand/40 to-brand/60">
            <span className="absolute left-1/2 top-[64%] h-[3px] w-3 -translate-x-1/2 animate-pulse rounded-full bg-[#04120c]/70" />
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 left-3.5 right-3.5 flex justify-center">
        <div className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/15 px-3 py-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0s" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0.15s" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </CardFrame>
  );
}

function SlideVisual({ slug, media }: { slug: string; media?: ShowcaseMedia }) {
  switch (slug) {
    case "seo-otomatis":
      return <SeoCardVisual />;
    case "generator-gambar":
      return <GambarCardVisual mediaUrl={media?.image} />;
    case "generator-video":
      return <VideoCardVisual mediaUrl={media?.video} />;
    case "auto-clip":
      return <AutoClipCardVisual mediaUrl={media?.clip} />;
    case "live-tiktok-ai":
      return <LiveTiktokCardVisual />;
    default:
      return null;
  }
}

/** A slow-spinning wireframe globe, purely decorative — no map asset, just gradient-shaded meridian/parallel ellipses. */
function HeroGlobe() {
  const radius = 180;
  const meridianAngles = [0, 26, 52, 78, 104, 130, 156];
  const parallelOffsets = [-130, -75, -25, 25, 75, 130];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 400"
      className="animate-float-slow pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-80"
    >
      <defs>
        <radialGradient id="hero-globe-fill" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="rgba(16,185,129,0.16)" />
          <stop offset="55%" stopColor="rgba(16,185,129,0.05)" />
          <stop offset="100%" stopColor="rgba(16,185,129,0)" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r={radius} fill="url(#hero-globe-fill)" stroke="rgba(16,185,129,0.28)" strokeWidth="1" />
      {parallelOffsets.map((dy) => (
        <ellipse
          key={dy}
          cx="200"
          cy={200 + dy}
          rx={radius}
          ry={Math.max(6, radius - Math.abs(dy) * 1.15)}
          fill="none"
          stroke="rgba(16,185,129,0.16)"
          strokeWidth="0.75"
        />
      ))}
      {meridianAngles.map((angle) => (
        <ellipse
          key={angle}
          cx="200"
          cy="200"
          rx={Math.max(2, radius * Math.abs(Math.cos((angle * Math.PI) / 180)))}
          ry={radius}
          fill="none"
          stroke="rgba(16,185,129,0.16)"
          strokeWidth="0.75"
        />
      ))}
    </svg>
  );
}

export function HeroShowcaseCarousel({ media }: { media?: ShowcaseMedia }) {
  const [index, setIndex] = useState(0);

  function goPrev() {
    setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  }
  function goNext() {
    setIndex((i) => (i + 1) % SLIDES.length);
  }

  return (
    <div className="relative flex flex-col items-center">
      <HeroGlobe />

      <div
        className="relative flex h-[460px] w-full items-center justify-center overflow-hidden"
        style={{ perspective: "1600px" }}
      >
        {/*
          All slides stay permanently mounted (never unmount/remount) —
          only their animate target changes, so any jump size (arrow = ±1,
          a direct dot click = any distance) always animates smoothly via a
          single retargeted spring. This deliberately avoids AnimatePresence:
          when a dot click moves the active slide by more than one step, its
          enter/exit choreography mishandles the multi-slide reshuffle (two
          slides "moving" plus one entering/exiting in the same update) and
          leaves a stale slide frozen on top of the new active one at full
          opacity — confirmed via computed styles, not just visually.
        */}
        {SLIDES.map((slide, i) => {
          let offset = i - index;
          const half = SLIDES.length / 2;
          if (offset > half) offset -= SLIDES.length;
          if (offset < -half) offset += SLIDES.length;
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          const isVisible = distance <= 1;

          return (
            <motion.button
              key={slide.slug}
              type="button"
              aria-label={`Lihat ${slide.name}`}
              aria-current={isActive}
              onClick={() => setIndex(i)}
              animate={{
                x: offset * 185,
                scale: isActive ? 1 : 0.8,
                opacity: isVisible ? (isActive ? 1 : 0.5) : 0,
                rotateY: offset * -18,
                zIndex: 10 - distance,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              style={{ pointerEvents: isVisible ? "auto" : "none" }}
              className="absolute w-72 cursor-pointer text-left"
            >
              <div
                className={cn(
                  "overflow-hidden rounded-2xl border bg-surface/80 p-4 shadow-[0_25px_60px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-colors",
                  isActive ? "border-brand/40" : "border-border-strong"
                )}
              >
                <SlideVisual slug={slide.slug} media={media} />
                <div className="mt-4 flex items-center gap-2.5 px-0.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <slide.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/90">{slide.name}</span>
                </div>
              </div>
            </motion.button>
          );
        })}

        <button
          type="button"
          onClick={goPrev}
          aria-label="Sebelumnya"
          className="absolute left-0 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface/90 text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Selanjutnya"
          className="absolute right-0 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface/90 text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-colors hover:border-brand/40 hover:text-brand"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.slug}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Ke ${slide.name}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-5 bg-brand" : "w-1.5 bg-white/20 hover:bg-white/35"
            )}
          />
        ))}
      </div>
    </div>
  );
}

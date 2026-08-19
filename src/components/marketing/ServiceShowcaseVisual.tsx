import { Sparkles, Play, Radio, Smile } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

// Purely decorative per-service mockups for the homepage's full showcase
// sections (one per TOOLS_CONTENT tool, each its own section like the
// original Auto Clip one) — no real screenshots/binary assets, everything is
// CSS/SVG built from the site's existing black+emerald design tokens and
// animation keyframes (see globals.css), so each service reads as its own
// living product shot instead of a static icon.
interface ServiceShowcaseVisualProps {
  slug: string;
  /** A real rendered clip from the admin's own generation history (see marketing-showcase-media.ts) — shown as the phone's actual screen content when available, so Auto Clip's mockup isn't just an abstract placeholder. Null/omitted falls back to the gradient placeholder. */
  mediaUrl?: string | null;
}

const WAVEFORM_HEIGHTS = [35, 65, 100, 50, 80, 40, 90, 55, 70, 30, 60, 85];

function SeoShowcaseVisual() {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="animate-float-slow relative overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-b from-surface-2 via-background to-surface-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="glow-orb left-1/2 top-0 h-40 w-40 -translate-x-1/2 opacity-40" />
        <div className="relative flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-danger/70" />
          <span className="h-2 w-2 rounded-full bg-warning/70" />
          <span className="h-2 w-2 rounded-full bg-brand/70" />
          <div className="ml-3 flex-1 overflow-hidden rounded-full bg-black/40 px-3 py-1 text-[10px] text-muted">
            google.com/search?q=
            <span className="animate-typing-caption inline-block align-bottom text-foreground/80">jasa+cuci+sofa+jakarta</span>
          </div>
        </div>
        <div className="relative flex flex-col gap-2.5 p-4">
          <div className="rounded-lg border border-brand/30 bg-brand/10 p-3">
            <div className="flex items-center gap-2">
              <Badge variant="brand" className="h-4 px-1.5 py-0 text-[9px]">
                #1
              </Badge>
              <span className="text-[9px] text-muted">Hasil teratas</span>
            </div>
            <div className="mt-2 h-2 w-3/4 rounded bg-brand/60" />
            <div className="mt-1.5 h-1.5 w-full rounded bg-white/10" />
            <div className="mt-1 h-1.5 w-5/6 rounded bg-white/10" />
          </div>
          <div className="rounded-lg border border-border p-3 opacity-50">
            <div className="h-2 w-2/3 rounded bg-white/20" />
            <div className="mt-1.5 h-1.5 w-full rounded bg-white/10" />
          </div>
          <div className="rounded-lg border border-border p-3 opacity-30">
            <div className="h-2 w-1/2 rounded bg-white/20" />
            <div className="mt-1.5 h-1.5 w-4/5 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GambarShowcaseVisual() {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="animate-float-slow relative overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-b from-surface-2 via-background to-surface-2 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="glow-orb left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-40" />
        <div className="relative mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground/80">Hasil Generate</span>
          <span className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-brand backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Merender...
          </span>
        </div>
        <div className="relative grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border-strong bg-black/30">
              <div
                className="absolute inset-0 bg-gradient-to-tr from-brand/30 via-transparent to-emerald-300/20"
                style={{ opacity: 0.35 + i * 0.15 }}
              />
              {i === 0 && (
                <div className="animate-scan-sweep absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-brand/50 to-transparent" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoShowcaseVisual() {
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="animate-float-slow relative overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-b from-surface-2 via-background to-surface-2 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="glow-orb left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-30" />
        <div className="relative flex flex-col items-center gap-6">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand text-[#04120c] shadow-[0_0_30px_rgba(16,185,129,0.45)]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
            <Play fill="currentColor" className="relative h-6 w-6 translate-x-[2px]" />
          </span>
          <div className="flex h-16 items-end justify-center gap-[4px]">
            {WAVEFORM_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="animate-wave-pulse w-[4px] rounded-full bg-brand/70"
                style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }}
              />
            ))}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="animate-bar-pulse h-full w-2/3 rounded-full bg-brand" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoClipShowcaseVisual({ mediaUrl }: { mediaUrl?: string | null }) {
  return (
    <div className="mx-auto flex max-w-[280px] justify-center">
      <div className="animate-float-slow relative aspect-[9/16] w-full overflow-hidden rounded-[2rem] border border-border-strong bg-gradient-to-b from-surface-2 via-background to-surface-2 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-soft via-background to-surface-2">
          {mediaUrl ? (
            <video
              src={mediaUrl}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <div className="glow-orb left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 opacity-50" />
          )}
          {mediaUrl && <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />}
          <div className="absolute left-1/2 top-4 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/40" />

          {/* The real clip already has its own burned-in headline/caption baked into the video itself — these placeholder labels would just duplicate and clash with it, so they only show for the abstract fallback (no real media yet). */}
          {!mediaUrl && (
            <>
              <div className="absolute left-1/2 top-[22%] w-[85%] -translate-x-1/2 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-center backdrop-blur">
                <span className="text-[13px] font-bold leading-tight text-white">3 Cara Cepat Naikkan Omzet 📈</span>
              </div>

              <div className="absolute bottom-8 left-1/2 w-[80%] -translate-x-1/2 text-center">
                <span className="animate-typing-caption rounded bg-brand px-2 py-1 text-[12px] font-semibold text-[#04120c]">
                  auto caption aktif
                </span>
              </div>
            </>
          )}

          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            REC
          </span>
        </div>
      </div>
    </div>
  );
}

function LiveTiktokShowcaseVisual() {
  return (
    <div className="mx-auto flex max-w-[280px] justify-center">
      <div className="animate-float-slow relative aspect-[9/16] w-full overflow-hidden rounded-[2rem] border border-border-strong bg-gradient-to-b from-surface-2 via-background to-surface-2 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-soft via-background to-surface-2">
          <div className="glow-orb left-1/2 top-1/4 h-40 w-40 -translate-x-1/2 opacity-40" />
          <div className="absolute left-1/2 top-4 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/40" />

          <span className="absolute left-3 top-8 flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          <span className="absolute right-3 top-8 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
            1.2K
          </span>

          {/* The actual product this feature shows off: a real interactive 3D VRM avatar (customizable per-user, from the gallery or an uploaded file) that speaks replies out loud with live lip-sync — not a canned animation. A shaded bust + eyes/mouth + an explicit "lip-sync aktif" tag stand in for the live 3D render here. */}
          <div className="absolute inset-x-0 top-[22%] flex flex-col items-center">
            <div className="relative">
              <span className="absolute -inset-4 rounded-full bg-brand/25 blur-lg" />
              <span
                className="absolute -inset-4 animate-ping rounded-full bg-brand/20"
                style={{ animationDuration: "2.2s" }}
              />
              <div className="relative h-12 w-12 rounded-full border border-brand/50 bg-gradient-to-br from-brand-soft via-brand/40 to-brand/60 shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.35),inset_3px_3px_8px_rgba(255,255,255,0.18)]">
                <span className="absolute left-[27%] top-[42%] h-1 w-1 rounded-full bg-[#04120c]/70" />
                <span className="absolute right-[27%] top-[42%] h-1 w-1 rounded-full bg-[#04120c]/70" />
                <span className="absolute left-1/2 top-[64%] h-[3px] w-2.5 -translate-x-1/2 animate-pulse rounded-full bg-[#04120c]/70" />
              </div>
            </div>
            <div className="relative -mt-1 h-20 w-28 rounded-t-[3rem] border border-b-0 border-brand/40 bg-gradient-to-b from-brand/35 via-brand/10 to-transparent" />
            <span className="relative -mt-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[8px] font-semibold text-brand backdrop-blur">
              <Smile className="h-2.5 w-2.5" />
              lip-sync aktif
            </span>
          </div>

          <div className="absolute bottom-6 left-3 right-14 flex flex-col items-start gap-1.5">
            <div className="w-fit rounded-lg bg-black/40 px-2 py-1 text-[10px] text-foreground/80 backdrop-blur">
              <span className="font-semibold text-brand">nadia_x</span> real testi ga nih kak?
            </div>
            <div className="w-fit rounded-lg bg-black/40 px-2 py-1 text-[10px] text-foreground/80 backdrop-blur">
              <span className="font-semibold text-brand">rizky.99</span> mantap harganya berapa?
            </div>
            <div className="flex w-fit items-center gap-1 rounded-lg border border-brand/30 bg-brand/15 px-2.5 py-2 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0s" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0.15s" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>

          <span className="absolute bottom-6 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/40" />
            <Radio className="relative h-4 w-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function ServiceShowcaseVisual({ slug, mediaUrl }: ServiceShowcaseVisualProps) {
  switch (slug) {
    case "seo-otomatis":
      return <SeoShowcaseVisual />;
    case "generator-gambar":
      return <GambarShowcaseVisual />;
    case "generator-video":
      return <VideoShowcaseVisual />;
    case "auto-clip":
      return <AutoClipShowcaseVisual mediaUrl={mediaUrl} />;
    case "live-tiktok-ai":
      return <LiveTiktokShowcaseVisual />;
    default:
      return null;
  }
}

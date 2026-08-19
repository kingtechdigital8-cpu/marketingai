import Link from "next/link";
import { FooterWordmark } from "@/components/marketing/FooterWordmark";

const productLinks = [
  { label: "SEO Otomatis", href: "/seo" },
  { label: "Generator Gambar", href: "/ads/image" },
  { label: "Generator Video", href: "/ads/video" },
  { label: "Auto Clip", href: "/auto-clip" },
  { label: "Live TikTok AI", href: "/live-tiktok" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <span className="text-lg font-bold text-brand">MarketingAI</span>
            <p className="mt-3 text-sm text-muted">
              Satu platform AI untuk SEO, gambar, video, live TikTok, hingga konten pendek otomatis.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Produk</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} MarketingAI. Semua hak dilindungi.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-foreground">Kebijakan Privasi</a>
            <a href="#" className="hover:text-foreground">Syarat Layanan</a>
          </div>
        </div>
      </div>
      <FooterWordmark text="MarketingAI" />
    </footer>
  );
}

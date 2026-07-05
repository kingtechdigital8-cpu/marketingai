import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

const links = [
  { label: "Fitur", href: "#fitur" },
  { label: "Harga", href: "#harga" },
];

export function MarketingNavbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold text-brand">
          MarketingAI
        </Link>
        <nav className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-muted hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Masuk
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            Coba Gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

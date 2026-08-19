"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const links = [
  { label: "Fitur", href: "/" },
  { label: "Harga", href: "/harga" },
];

/** Shared by the desktop pill nav and the mobile dropdown — branches between a plain <a> (in-page hash) and next/link (a real route) since they need different navigation behavior. */
function NavLink({
  href,
  label,
  active,
  hovered,
  onHover,
  onClick,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  hovered: boolean;
  onHover?: () => void;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {hovered && (
        <motion.span
          layoutId="nav-hover-pill"
          className="absolute inset-0 rounded-full bg-white/[.07]"
          transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
        />
      )}
      <span className="relative">{label}</span>
    </>
  );
  const sharedClassName = cn(
    "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
    active ? "text-foreground" : "text-muted hover:text-foreground",
    className
  );

  if (href.startsWith("#")) {
    return (
      <a href={href} onMouseEnter={onHover} onClick={onClick} className={sharedClassName}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} onMouseEnter={onHover} onClick={onClick} className={sharedClassName}>
      {content}
    </Link>
  );
}

export function MarketingNavbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
      <div className="relative mx-auto max-w-6xl">
        <div
          className={cn(
            "flex h-16 items-center justify-between rounded-2xl border px-3 backdrop-blur-xl transition-all duration-300 sm:px-4",
            scrolled
              ? "border-border-strong bg-surface/90 shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
              : "border-border/70 bg-surface/50 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
          )}
        >
          <Link href="/" className="group flex items-center gap-2.5 pl-1">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-emerald-700 text-sm font-extrabold text-[#04120c] shadow-[0_2px_14px_rgba(16,185,129,0.4)] transition-transform duration-300 group-hover:scale-105">
              M
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.85)]" />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-foreground">
              Marketing<span className="text-brand">AI</span>
            </span>
          </Link>

          <nav
            className="relative hidden items-center gap-1 sm:flex"
            onMouseLeave={() => setHoveredHref(null)}
          >
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={!link.href.startsWith("#") && pathname === link.href}
                hovered={hoveredHref === link.href}
                onHover={() => setHoveredHref(link.href)}
              />
            ))}
          </nav>

          <div className="hidden items-center gap-1.5 sm:flex">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Masuk
            </Link>
            <Link href="/register" className={buttonVariants({ size: "sm", className: "pl-4 pr-3.5" })}>
              Coba Gratis
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-white/[.06] sm:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-2xl border border-border-strong bg-surface/95 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:hidden"
            >
              <nav className="flex flex-col gap-1">
                {links.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    active={!link.href.startsWith("#") && pathname === link.href}
                    hovered={false}
                    onClick={() => setMobileOpen(false)}
                    className="w-full !rounded-lg px-3.5 py-2.5 text-left hover:bg-white/[.06]"
                  />
                ))}
              </nav>
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className={buttonVariants({ variant: "outline", className: "w-full" })}
                >
                  Masuk
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className={buttonVariants({ className: "w-full" })}
                >
                  Coba Gratis
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

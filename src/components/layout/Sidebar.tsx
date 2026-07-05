"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon, X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarProps {
  brandLabel: string;
  brandBadge?: string;
  items: SidebarNavItem[];
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ brandLabel, brandBadge, items, open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-brand">{brandLabel}</span>
            {brandBadge && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                {brandBadge}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-muted lg:hidden" aria-label="Tutup menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-brand" : "text-muted hover:bg-white/[.05] hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-brand-soft"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative h-4 w-4 shrink-0" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type LucideIcon, ChevronsLeft, Plus, Sparkles, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface SidebarNavGroup {
  label: string;
  items: SidebarNavItem[];
}

interface SidebarUser {
  name: string;
  email?: string;
}

interface SidebarProps {
  brandBadge?: string;
  groups: SidebarNavGroup[];
  utilityItems?: SidebarNavItem[];
  creditBalance?: number;
  totalPurchasedCredits?: number;
  user?: SidebarUser;
  open: boolean;
  onClose: () => void;
}

const COLLAPSE_KEY = "marketingai-sidebar-collapsed";

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: SidebarNavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-foreground" : "text-muted hover:bg-white/[.04] hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute inset-0 rounded-md bg-brand-hover/[0.08]" />
      )}
      {active && <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-brand-hover" />}
      <Icon className={cn("relative h-4 w-4 shrink-0", active ? "text-brand-hover" : "text-muted group-hover:text-foreground")} />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({
  brandBadge,
  groups,
  utilityItems,
  creditBalance,
  totalPurchasedCredits,
  user,
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Reading persisted UI state on mount (not deriving from props/state) is
  // the standard exception to this lint rule elsewhere in the codebase.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // A route like "/admin" is a path-prefix of every other admin route
  // ("/admin/users", "/admin/payment-logs", ...), so naive prefix matching
  // would keep it lit on every sub-page alongside whichever page is
  // actually active. Only the single longest (most specific) matching href
  // across all items wins.
  const allHrefs = [...groups.flatMap((g) => g.items.map((i) => i.href)), ...(utilityItems ?? []).map((i) => i.href)];
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string) {
    return href === activeHref;
  }

  const initials = user?.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width]",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center gap-2 px-4", collapsed ? "lg:justify-center lg:px-0" : "justify-between")}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2" onClick={onClose}>
            <Sparkles className="h-4 w-4 shrink-0 text-brand-hover" />
            {!collapsed && (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">MarketingAI</span>
                {brandBadge && (
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    {brandBadge}
                  </span>
                )}
              </span>
            )}
          </Link>
          <button onClick={onClose} className="p-1 text-muted hover:text-foreground lg:hidden" aria-label="Tutup menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onClick={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {typeof creditBalance === "number" && (
          <div className={cn("shrink-0 border-t border-border px-3 py-3", collapsed && "px-2")}>
            {collapsed ? (
              <Link
                href="/credits"
                onClick={onClose}
                title={`${creditBalance.toLocaleString("en-US")} credits`}
                className="flex items-center justify-center rounded-md p-2 text-muted transition-colors hover:bg-white/[.04] hover:text-foreground"
              >
                <Zap className="h-4 w-4 text-brand-hover" />
              </Link>
            ) : (
              <div className="rounded-lg border border-border p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted/70">
                  <Zap className="h-3.5 w-3.5 shrink-0 text-brand-hover" />
                  Credits
                </span>
                <p className="mt-1 text-lg font-semibold text-foreground">{creditBalance.toLocaleString("en-US")}</p>

                {(() => {
                  // Real denominator (lifetime credits ever purchased), not
                  // an invented monthly quota — this app has no subscription
                  // concept. With nothing purchased yet there's no ratio to
                  // show, so the bar renders full/available with no label.
                  const hasPurchaseHistory = !!totalPurchasedCredits && totalPurchasedCredits > 0;
                  const percentAvailable = hasPurchaseHistory
                    ? Math.max(0, Math.min(100, Math.round((creditBalance / totalPurchasedCredits!) * 100)))
                    : 100;
                  const percentUsed = hasPurchaseHistory ? 100 - percentAvailable : null;
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.08]">
                        <div
                          className="animate-shimmer absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-hover/40 via-brand-hover to-brand-hover/40"
                          style={{ width: `${percentAvailable}%` }}
                        />
                      </div>
                      {percentUsed !== null && (
                        <span className="shrink-0 text-[10px] text-muted">{percentUsed}% used</span>
                      )}
                    </div>
                  );
                })()}

                <Link
                  href="/credits"
                  onClick={onClose}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-white/[.04]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Top Up
                </Link>
              </div>
            )}
          </div>
        )}

        {utilityItems && utilityItems.length > 0 && (
          <div className="shrink-0 space-y-0.5 border-t border-border px-3 py-2">
            {utilityItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onClick={onClose} />
            ))}
          </div>
        )}

        {user && (
          <div className={cn("flex shrink-0 items-center gap-2.5 border-t border-border px-4 py-3", collapsed && "lg:justify-center lg:px-0")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium leading-tight text-foreground">{user.name}</p>
                {user.email && <p className="truncate text-[11px] leading-tight text-muted">{user.email}</p>}
              </div>
            )}
          </div>
        )}

        <button
          onClick={toggleCollapsed}
          className="hidden shrink-0 items-center justify-center gap-2 border-t border-border py-2 text-muted hover:text-foreground lg:flex"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        >
          <ChevronsLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>
    </>
  );
}

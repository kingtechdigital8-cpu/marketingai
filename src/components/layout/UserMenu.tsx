"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UserMenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface UserMenuProps {
  name: string;
  role?: string;
  items?: UserMenuItem[];
}

export function UserMenu({ name, role, items = [] }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-lg border-l border-border py-1.5 pl-3 pr-2 transition-colors hover:bg-white/[.05]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-[#04120c]">
          {initials}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-sm font-medium leading-tight text-foreground">{name}</p>
          {role && <p className="text-xs leading-tight text-muted">{role}</p>}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-40 mt-2 w-56 origin-top-right rounded-lg border border-border-strong bg-surface p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/[.06]"
              >
                <item.icon className="h-4 w-4 text-muted" />
                {item.label}
              </Link>
            ))}
            {items.length > 0 && <div className="my-1 border-t border-border" />}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

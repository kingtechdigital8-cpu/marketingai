"use client";

import { Menu } from "lucide-react";
import { ReactNode } from "react";

interface TopbarProps {
  onMenuClick: () => void;
  right?: ReactNode;
}

export function Topbar({ onMenuClick, right }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="ml-auto flex items-center gap-3">{right}</div>
    </header>
  );
}

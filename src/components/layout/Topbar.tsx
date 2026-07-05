"use client";

import { Menu } from "lucide-react";
import { ReactNode } from "react";

interface TopbarProps {
  onMenuClick: () => void;
  title?: string;
  right?: ReactNode;
}

export function Topbar({ onMenuClick, title, right }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-muted hover:bg-white/[.06] lg:hidden"
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && <h1 className="text-sm font-semibold text-foreground sm:text-base">{title}</h1>}
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </header>
  );
}

"use client";

import { cn } from "@/lib/utils";

interface ToggleChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function ToggleChip({ label, active, onClick }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand/40 bg-brand-soft text-brand"
          : "border-border text-muted hover:border-border-strong hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

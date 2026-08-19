"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40",
        checked ? "border-brand bg-brand" : "border-border bg-white/[.08]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label className={cn("flex items-center justify-between gap-3", disabled && "opacity-50")}>
      <span className="flex flex-col">
        <span className="text-sm text-foreground">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      {control}
    </label>
  );
}

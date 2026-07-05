import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "danger"
  | "warning"
  | "teal"
  | "violet"
  | "magenta"
  | "orange";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-white/[.06] text-muted border border-border",
  brand: "bg-brand-soft text-brand border border-brand/20",
  success: "bg-brand-soft text-success border border-brand/20",
  danger: "bg-danger-soft text-danger border border-danger/20",
  warning: "bg-warning-soft text-warning border border-warning/20",
  teal: "bg-intent-informational-soft text-intent-informational border border-intent-informational/20",
  violet: "bg-intent-navigational-soft text-intent-navigational border border-intent-navigational/20",
  magenta: "bg-intent-commercial-soft text-intent-commercial border border-intent-commercial/20",
  orange: "bg-intent-transactional-soft text-intent-transactional border border-intent-transactional/20",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

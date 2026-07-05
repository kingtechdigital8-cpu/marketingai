import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-brand-soft/70 via-surface to-surface px-5 py-5 sm:px-6 sm:py-6">
      <div className="glow-orb pointer-events-none absolute -right-12 -top-16 h-40 w-40 opacity-40" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

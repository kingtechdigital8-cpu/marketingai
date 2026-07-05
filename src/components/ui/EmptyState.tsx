import { type LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
    </div>
  );
}

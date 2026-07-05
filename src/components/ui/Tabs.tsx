"use client";

import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  layoutId?: string;
}

export function Tabs({ items, value, onChange, layoutId = "tabs-active" }: TabsProps) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "text-brand" : "text-muted hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-brand-soft"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {Icon && <Icon className="relative h-4 w-4" />}
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

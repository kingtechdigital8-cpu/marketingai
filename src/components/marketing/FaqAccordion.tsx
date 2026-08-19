"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div
            key={item.question}
            className={cn(
              "overflow-hidden rounded-xl border bg-surface/60 backdrop-blur-sm transition-colors duration-200",
              open ? "border-brand/30" : "border-border"
            )}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={open}
            >
              <span className="text-sm font-semibold text-foreground sm:text-base">{item.question}</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180 text-brand")}
              />
            </button>
            {/* CSS-only grid-rows collapse (not AnimatePresence+height:auto) —
                that combo has previously frozen nested motion children elsewhere
                in this app; this avoids the same class of bug here. */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

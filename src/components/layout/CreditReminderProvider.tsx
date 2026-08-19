"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { buttonVariants } from "@/components/ui/Button";

const CreditReminderContext = createContext<(() => void) | null>(null);

/** Call from any generate handler once it learns the balance is 0, to pop the top-up modal on top of whatever inline error the page already shows. */
export function useCreditReminder() {
  const trigger = useContext(CreditReminderContext);
  return trigger ?? (() => {});
}

export function CreditReminderProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useCallback(() => setOpen(true), []);

  return (
    <CreditReminderContext.Provider value={trigger}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="Kredit habis" size="sm">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft">
            <Zap className="h-4.5 w-4.5 text-warning" />
          </span>
          <p className="text-sm text-muted">
            Kredit kamu sudah habis, jadi generate ini tidak bisa dilanjutkan. Top up dulu untuk terus menggunakan fitur AI.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={buttonVariants({ variant: "outline" })}
          >
            Nanti
          </button>
          <Link href="/credits" onClick={() => setOpen(false)} className={buttonVariants()}>
            Top Up
          </Link>
        </div>
      </Modal>
    </CreditReminderContext.Provider>
  );
}

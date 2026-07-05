"use client";

import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const subscribeNoop = () => () => {};

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative flex max-h-[85vh] w-full flex-col rounded-xl border border-border-strong bg-surface shadow-[0_0_40px_rgba(0,0,0,0.6)]",
              sizeClasses[size]
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {title && (
              <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Tutup"
                  className="rounded-md p-1 text-muted hover:bg-white/[.06] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="overflow-y-auto p-4">{children}</div>
            {footer && (
              <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

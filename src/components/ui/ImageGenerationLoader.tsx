"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

const DEFAULT_MESSAGES = [
  "Menyusun komposisi...",
  "Menerapkan gaya visual...",
  "Menghaluskan detail...",
  "Menyempurnakan pencahayaan...",
];

export function ImageGenerationLoader({ messages = DEFAULT_MESSAGES }: { messages?: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2800);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="relative flex aspect-square w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-border bg-surface-2">
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(120deg, transparent 30%, var(--brand-glow) 50%, transparent 70%)",
          backgroundSize: "200% 200%",
        }}
        animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        animate={{ scale: [1, 1.12, 1], rotate: [0, 8, -8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand"
      >
        <Sparkles className="h-6 w-6" />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="relative text-sm text-muted"
        >
          {messages[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

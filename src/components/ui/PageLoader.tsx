"use client";

import { motion } from "framer-motion";

/**
 * Next.js's own loading.tsx Suspense fallback — shown automatically while a
 * route segment's chunk/RSC payload is still loading (first visit to a
 * segment, slow connection, or a Turbopack dev-mode compile). Placed inside
 * each route group's own directory (not the root) so it only replaces the
 * page content, never the persistent Sidebar/Topbar chrome above it.
 */
export function PageLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-hover border-t-transparent" />
      <p className="text-sm text-muted">Memuat...</p>
    </motion.div>
  );
}

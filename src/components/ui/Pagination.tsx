"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border px-4 py-3", className)}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white/[.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-4 w-4" />
        Sebelumnya
      </button>
      <span className="text-xs text-muted">
        Halaman <span className="font-medium text-foreground">{page}</span> dari {pageCount}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white/[.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Selanjutnya
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

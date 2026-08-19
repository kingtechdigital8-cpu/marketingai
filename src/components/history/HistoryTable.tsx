import { ReactNode } from "react";
import { ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

export type HistoryStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface HistoryRow {
  id: string;
  // A plain string in almost every tool — ReactNode only so a tool with
  // sub-types (e.g. SEO's 3 generators) can prefix a small badge inline
  // instead of growing its own extra column that the other tools don't have.
  title: ReactNode;
  status: HistoryStatus;
  creditCost: number;
  createdAt: string;
}

function formatHistoryDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE: Record<HistoryStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

interface HistoryTableProps {
  title: string;
  items: HistoryRow[] | null;
  hasError?: boolean;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onView: (id: string) => void;
}

/** One shared look for every tool's "Riwayat" card — same header, same columns, same badges, same date format, so no page's history table looks different from another's. */
export function HistoryTable({ title, items, hasError, page, pageCount, onPageChange, onView }: HistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!items ? (
          <div className="flex flex-col gap-2 p-5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.06]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.06]" />
          </div>
        ) : hasError ? (
          <div className="p-5">
            <ErrorNotice message="Gagal memuat riwayat. Coba muat ulang halaman." />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="Belum ada riwayat" />
        ) : (
          <>
            {/* Desktop/tablet: full table. overflow-x-auto is a safety net
                (e.g. browser zoom) — the real mobile fix is the card list
                below, swapped in below the `sm` breakpoint. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Judul</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                      <td className="max-w-xs truncate px-5 py-3 font-medium text-foreground">{item.title}</td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">{item.creditCost}</td>
                      <td className="px-5 py-3 text-muted">{formatHistoryDate(item.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => onView(item.id)}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked, tappable list rows instead of a cramped
                horizontally-scrolling table. */}
            <div className="divide-y divide-border sm:hidden">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onView(item.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.creditCost} kredit &middot; {formatHistoryDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </div>
                </button>
              ))}
            </div>

            <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

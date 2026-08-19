"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Search, Eye, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePagination } from "@/lib/use-pagination";
import { PAYMENT_CHANNELS } from "@/lib/payment-channels";
import { cn } from "@/lib/utils";

type TopupStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

interface TransactionListItem {
  id: string;
  refId: string;
  trxId: string | null;
  amountIdr: number;
  credits: number;
  channel: string;
  status: TopupStatus;
  vaNumber: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
}

interface TransactionDetail extends TransactionListItem {
  payUrl: string | null;
  qrString: string | null;
  qrLink: string | null;
  paymentGuide: string | null;
}

const STATUS_BADGE: Record<TopupStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "warning" },
  SUCCESS: { label: "Berhasil", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
  EXPIRED: { label: "Kedaluwarsa", variant: "neutral" },
};

const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_CHANNELS.map((c) => [c.code, c.label]));

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatIdr(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

type SortField = "createdAt" | "amountIdr" | "credits";

function SortHeaderButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
      {label}
      {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TopupStatus>("ALL");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "createdAt", dir: "desc" });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/transactions")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setTransactions(data.transactions ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!detailId) return;
    setDetailLoading(true);
    fetch(`/api/admin/transactions/${detailId}`)
      .then((res) => res.json())
      .then((data) => setDetail(data.transaction ?? null))
      .finally(() => setDetailLoading(false));
  }, [detailId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stats = useMemo(() => {
    const list = transactions ?? [];
    const success = list.filter((t) => t.status === "SUCCESS");
    const finished = list.filter((t) => t.status === "SUCCESS" || t.status === "FAILED" || t.status === "EXPIRED");
    return {
      total: list.length,
      totalRevenue: success.reduce((sum, t) => sum + t.amountIdr, 0),
      successRate: finished.length > 0 ? Math.round((success.length / finished.length) * 100) : 0,
      pending: list.filter((t) => t.status === "PENDING").length,
    };
  }, [transactions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (transactions ?? []).filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (
        query &&
        !t.user.name.toLowerCase().includes(query) &&
        !t.user.email.toLowerCase().includes(query) &&
        !t.refId.toLowerCase().includes(query) &&
        !(t.trxId?.toLowerCase().includes(query) ?? false)
      )
        return false;
      return true;
    });
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sort.field === "amountIdr") cmp = a.amountIdr - b.amountIdr;
      else if (sort.field === "credits") cmp = a.credits - b.credits;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [transactions, search, statusFilter, sort]);

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 12);

  function toggleSort(field: SortField) {
    setSort((prev) => (prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transaksi"
        description="Pemantauan seluruh transaksi top-up kredit via Tokopay (1000 transaksi terbaru)."
        icon={Receipt}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted">Total Transaksi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{formatIdr(stats.totalRevenue)}</p>
              <p className="text-xs text-muted">Total Pendapatan</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-intent-navigational-soft text-intent-navigational">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.successRate}%</p>
              <p className="text-xs text-muted">Tingkat Berhasil</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.pending}</p>
              <p className="text-xs text-muted">Menunggu Pembayaran</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama, email, atau ref ID..."
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip label="Semua Status" active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
          <ToggleChip label="Menunggu" active={statusFilter === "PENDING"} onClick={() => setStatusFilter("PENDING")} />
          <ToggleChip label="Berhasil" active={statusFilter === "SUCCESS"} onClick={() => setStatusFilter("SUCCESS")} />
          <ToggleChip label="Gagal" active={statusFilter === "FAILED"} onClick={() => setStatusFilter("FAILED")} />
          <ToggleChip label="Kedaluwarsa" active={statusFilter === "EXPIRED"} onClick={() => setStatusFilter("EXPIRED")} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {!transactions ? (
            loadError ? (
              <div className="p-5">
                <ErrorNotice message="Gagal memuat daftar transaksi. Coba muat ulang halaman." />
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">Memuat...</p>
            )
          ) : filtered.length === 0 ? (
            <EmptyState icon={Receipt} title={transactions.length === 0 ? "Belum ada transaksi" : "Tidak ada hasil yang cocok"} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3 font-medium">Pengguna</th>
                      <th className="px-5 py-3 font-medium">Channel</th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton label="Jumlah" active={sort.field === "amountIdr"} dir={sort.dir} onClick={() => toggleSort("amountIdr")} />
                      </th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton label="Kredit" active={sort.field === "credits"} dir={sort.dir} onClick={() => toggleSort("credits")} />
                      </th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Ref ID</th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton label="Tanggal" active={sort.field === "createdAt"} dir={sort.dir} onClick={() => toggleSort("createdAt")} />
                      </th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((t) => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground">{t.user.name}</p>
                          <p className="text-xs text-muted">{t.user.email}</p>
                        </td>
                        <td className="px-5 py-3 text-muted">{CHANNEL_LABEL[t.channel] ?? t.channel}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{formatIdr(t.amountIdr)}</td>
                        <td className="px-5 py-3 text-muted">{t.credits.toLocaleString("id-ID")}</td>
                        <td className="px-5 py-3">
                          <Badge variant={STATUS_BADGE[t.status].variant}>{STATUS_BADGE[t.status].label}</Badge>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-muted">{t.refId}</td>
                        <td className="px-5 py-3 text-muted">{formatDate(t.createdAt)}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setDetailId(t.id)}
                            className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground"
                            aria-label="Lihat detail"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title="Detail Transaksi" size="lg">
        {detailLoading || !detail ? (
          <p className="py-6 text-center text-sm text-muted">Memuat...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{detail.user.name}</p>
                <p className="text-sm text-muted">{detail.user.email}</p>
              </div>
              <Badge variant={STATUS_BADGE[detail.status].variant}>{STATUS_BADGE[detail.status].label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Jumlah</p>
                <p className="mt-1 text-base font-semibold text-foreground">{formatIdr(detail.amountIdr)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Kredit Diterima</p>
                <p className="mt-1 text-base font-semibold text-foreground">{detail.credits.toLocaleString("id-ID")}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Channel</p>
                <p className="mt-1 text-base font-semibold text-foreground">{CHANNEL_LABEL[detail.channel] ?? detail.channel}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Dibuat</p>
                <p className="mt-1 text-base font-semibold text-foreground">{formatDateTime(detail.createdAt)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Ref ID</span>
                <span className="font-mono text-foreground">{detail.refId}</span>
              </div>
              {detail.trxId && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Trx ID (Tokopay)</span>
                  <span className="font-mono text-foreground">{detail.trxId}</span>
                </div>
              )}
              {detail.vaNumber && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Nomor VA</span>
                  <span className="font-mono text-foreground">{detail.vaNumber}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Terakhir diperbarui</span>
                <span className="text-foreground">{formatDateTime(detail.updatedAt)}</span>
              </div>
            </div>

            {detail.paymentGuide && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 text-xs text-muted">Panduan Pembayaran</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{detail.paymentGuide}</p>
              </div>
            )}

            {(detail.payUrl || detail.qrLink) && (
              <div className="flex gap-2">
                {detail.payUrl && (
                  <a
                    href={detail.payUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Buka Halaman Pembayaran
                  </a>
                )}
                {detail.qrLink && (
                  <a href={detail.qrLink} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand hover:underline">
                    Lihat QR
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

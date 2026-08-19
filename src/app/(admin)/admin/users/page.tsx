"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users,
  Search,
  Eye,
  Pencil,
  Coins,
  Trash2,
  ShieldCheck,
  UserRound,
  Wallet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ReceiptText,
  History,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePagination } from "@/lib/use-pagination";
import { cn } from "@/lib/utils";

type Role = "USER" | "ADMIN";
type Status = "ACTIVE" | "SUSPENDED";

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  creditBalance: number;
  createdAt: string;
  generationsCount: number;
  totalTopupIdr: number;
}

interface UserDetail extends UserListItem {
  updatedAt: string;
  generationsCount: number;
  creditTransactionsCount: number;
  topupTransactionsCount: number;
  totalTopupIdr: number;
  totalTopupCredits: number;
  generations: { id: string; type: string; status: string; title: string; creditCost: number; createdAt: string }[];
  topupTransactions: { id: string; amountIdr: number; credits: number; status: string; channel: string; createdAt: string }[];
  creditTransactions: { id: string; amount: number; type: string; description: string; createdAt: string }[];
}

const GENERATION_TYPE_LABEL: Record<string, string> = {
  SEO_KEYWORDS: "Riset Kata Kunci",
  SEO_META: "Meta SEO",
  SEO_ARTICLE: "Artikel SEO",
  IMAGE_GENERATION: "Gambar",
  VIDEO_GENERATION: "Video",
  VOICE_DUB: "Voice Changer",
  TIKTOK_LIVE_REPLY: "Balasan Live TikTok",
  AVATAR_GENERATION: "Avatar AI",
  VIDEO_CLIP: "Auto Clip",
};

const GENERATION_STATUS_BADGE: Record<string, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

const TOPUP_STATUS_BADGE: Record<string, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "warning" },
  SUCCESS: { label: "Berhasil", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
  EXPIRED: { label: "Kedaluwarsa", variant: "neutral" },
};

const CREDIT_TX_BADGE: Record<string, { label: string; variant: "neutral" | "success" | "teal" | "violet" | "warning" }> = {
  TOPUP: { label: "Top Up", variant: "success" },
  USAGE: { label: "Pemakaian", variant: "neutral" },
  REFUND: { label: "Refund", variant: "teal" },
  BONUS: { label: "Bonus", variant: "violet" },
  ADJUSTMENT: { label: "Penyesuaian Admin", variant: "warning" },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatIdr(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type SortField = "name" | "creditBalance" | "createdAt" | "generationsCount";

function SortHeaderButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
      {label}
      {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

const DETAIL_TABS = [
  { id: "generations", label: "Generasi", icon: ShoppingBag },
  { id: "topups", label: "Top Up", icon: ReceiptText },
  { id: "credits", label: "Riwayat Kredit", icon: History },
];

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [sort, setSort] = useState<{ field: SortField; dir: "asc" | "desc" }>({ field: "createdAt", dir: "desc" });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailTab, setDetailTab] = useState("generations");
  const [detailLoading, setDetailLoading] = useState(false);

  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "USER" as Role, status: "ACTIVE" as Status });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [adjusting, setAdjusting] = useState<UserListItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<UserListItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function loadUsers() {
    fetch("/api/admin/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setUsers(data.users ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(loadUsers, []);

  // setDetailLoading(true) synchronously kicking off a fetch-on-id-change
  // effect is the standard pattern (same escape hatch already used for
  // auto-clip's own load-on-mount effect) — the alternative the lint rule
  // wants (deriving loading state instead of setting it) doesn't fit an
  // id that changes many times over the component's life, only mounts once.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Closing (detailId -> null) intentionally leaves the last-loaded
    // `detail` in place rather than clearing it — the Modal is unmounted
    // from view via `open={detailId !== null}` at that point anyway, and
    // the next open always re-fetches (and shows "Memuat..." via
    // detailLoading) before displaying anything, so no stale flash.
    if (!detailId) return;
    setDetailLoading(true);
    fetch(`/api/admin/users/${detailId}`)
      .then((res) => res.json())
      .then((data) => setDetail(data.user ?? null))
      .finally(() => setDetailLoading(false));
  }, [detailId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const stats = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      admins: list.filter((u) => u.role === "ADMIN").length,
      suspended: list.filter((u) => u.status === "SUSPENDED").length,
      totalCredit: list.reduce((sum, u) => sum + u.creditBalance, 0),
    };
  }, [users]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (users ?? []).filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
      if (query && !u.name.toLowerCase().includes(query) && !u.email.toLowerCase().includes(query)) return false;
      return true;
    });
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort.field === "name") cmp = a.name.localeCompare(b.name);
      else if (sort.field === "creditBalance") cmp = a.creditBalance - b.creditBalance;
      else if (sort.field === "generationsCount") cmp = a.generationsCount - b.generationsCount;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, search, roleFilter, statusFilter, sort]);

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 10);

  function toggleSort(field: SortField) {
    setSort((prev) => (prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }));
    setPage(1);
  }

  function openEdit(user: UserListItem) {
    setEditing(user);
    setEditForm({ name: user.name, role: user.role, status: user.status });
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json().catch(() => null);
    setEditSaving(false);
    if (!res.ok) {
      setEditError(data?.error ?? "Gagal menyimpan perubahan.");
      return;
    }
    setEditing(null);
    loadUsers();
  }

  function openAdjust(user: UserListItem) {
    setAdjusting(user);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustError(null);
  }

  async function handleAdjustSave() {
    if (!adjusting) return;
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setAdjustError("Masukkan jumlah kredit bulat, boleh negatif untuk mengurangi.");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("Alasan penyesuaian wajib diisi.");
      return;
    }
    setAdjustSaving(true);
    setAdjustError(null);
    const res = await fetch(`/api/admin/users/${adjusting.id}/credit-adjustment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, reason: adjustReason.trim() }),
    });
    const data = await res.json().catch(() => null);
    setAdjustSaving(false);
    if (!res.ok) {
      setAdjustError(data?.error ?? "Gagal menyesuaikan kredit.");
      return;
    }
    setAdjusting(null);
    loadUsers();
    if (detailId === adjusting.id) {
      setDetailId(null);
      setTimeout(() => setDetailId(adjusting.id), 0);
    }
  }

  function openDelete(user: UserListItem) {
    setDeleting(user);
    setDeleteConfirmText("");
    setDeleteError(null);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteSaving(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/users/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setDeleteSaving(false);
    if (!res.ok) {
      setDeleteError(data?.error ?? "Gagal menghapus pengguna.");
      return;
    }
    setDeleting(null);
    loadUsers();
  }

  const previewBalance = adjusting ? adjusting.creditBalance + (Number.isFinite(Number(adjustAmount)) ? Number(adjustAmount) || 0 : 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Manajemen Pengguna"
        description="Kelola akun, role, status, dan kredit seluruh pengguna."
        icon={Users}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted">Total Pengguna</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-intent-navigational-soft text-intent-navigational">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.admins}</p>
              <p className="text-xs text-muted">Admin</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.suspended}</p>
              <p className="text-xs text-muted">Dinonaktifkan</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{stats.totalCredit.toLocaleString("id-ID")}</p>
              <p className="text-xs text-muted">Total Kredit Beredar</p>
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
            placeholder="Cari nama atau email..."
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip label="Semua Role" active={roleFilter === "ALL"} onClick={() => setRoleFilter("ALL")} />
          <ToggleChip label="User" active={roleFilter === "USER"} onClick={() => setRoleFilter("USER")} />
          <ToggleChip label="Admin" active={roleFilter === "ADMIN"} onClick={() => setRoleFilter("ADMIN")} />
          <span className="mx-1 h-4 w-px bg-border" />
          <ToggleChip label="Semua Status" active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
          <ToggleChip label="Aktif" active={statusFilter === "ACTIVE"} onClick={() => setStatusFilter("ACTIVE")} />
          <ToggleChip label="Nonaktif" active={statusFilter === "SUSPENDED"} onClick={() => setStatusFilter("SUSPENDED")} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {!users ? (
            loadError ? (
              <div className="p-5">
                <ErrorNotice message="Gagal memuat daftar pengguna. Coba muat ulang halaman." />
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">Memuat...</p>
            )
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title={users.length === 0 ? "Belum ada pengguna" : "Tidak ada hasil yang cocok"} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton label="Pengguna" active={sort.field === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                      </th>
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton
                          label="Kredit"
                          active={sort.field === "creditBalance"}
                          dir={sort.dir}
                          onClick={() => toggleSort("creditBalance")}
                        />
                      </th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton
                          label="Generasi"
                          active={sort.field === "generationsCount"}
                          dir={sort.dir}
                          onClick={() => toggleSort("generationsCount")}
                        />
                      </th>
                      <th className="px-5 py-3 font-medium">Total Top Up</th>
                      <th className="px-5 py-3 font-medium">
                        <SortHeaderButton
                          label="Terdaftar"
                          active={sort.field === "createdAt"}
                          dir={sort.dir}
                          onClick={() => toggleSort("createdAt")}
                        />
                      </th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((u) => {
                      const isSelf = u.id === currentUserId;
                      return (
                        <tr key={u.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                          <td className="px-5 py-3">
                            <button onClick={() => setDetailId(u.id)} className="flex items-center gap-3 text-left">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                                {initialsOf(u.name)}
                              </span>
                              <span>
                                <span className="flex items-center gap-1.5 font-medium text-foreground">
                                  {u.name}
                                  {isSelf && <Badge variant="brand">Anda</Badge>}
                                </span>
                                <span className="block text-xs text-muted">{u.email}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={u.role === "ADMIN" ? "violet" : "neutral"}>{u.role === "ADMIN" ? "Admin" : "User"}</Badge>
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={u.status === "ACTIVE" ? "success" : "danger"}>{u.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</Badge>
                          </td>
                          <td className="px-5 py-3 font-medium text-foreground">{u.creditBalance.toLocaleString("id-ID")}</td>
                          <td className="px-5 py-3 text-muted">{u.generationsCount}</td>
                          <td className="px-5 py-3 text-muted">{formatIdr(u.totalTopupIdr)}</td>
                          <td className="px-5 py-3 text-muted">{formatDate(u.createdAt)}</td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => setDetailId(u.id)}
                                className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground"
                                aria-label="Lihat detail"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openAdjust(u)}
                                className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground"
                                aria-label="Sesuaikan kredit"
                              >
                                <Coins className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openEdit(u)}
                                disabled={isSelf}
                                className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openDelete(u)}
                                disabled={isSelf}
                                className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Hapus"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title={detail?.name ?? "Detail Pengguna"} size="xl">
        {detailLoading || !detail ? (
          <p className="py-6 text-center text-sm text-muted">Memuat...</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {initialsOf(detail.name)}
                </span>
                <div>
                  <p className="font-medium text-foreground">{detail.name}</p>
                  <p className="text-sm text-muted">{detail.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={detail.role === "ADMIN" ? "violet" : "neutral"}>{detail.role === "ADMIN" ? "Admin" : "User"}</Badge>
                <Badge variant={detail.status === "ACTIVE" ? "success" : "danger"}>{detail.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Saldo Kredit</p>
                <p className="mt-1 text-base font-semibold text-foreground">{detail.creditBalance.toLocaleString("id-ID")}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Total Top Up</p>
                <p className="mt-1 text-base font-semibold text-foreground">{formatIdr(detail.totalTopupIdr)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Jumlah Generasi</p>
                <p className="mt-1 text-base font-semibold text-foreground">{detail.generationsCount}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Terdaftar</p>
                <p className="mt-1 text-base font-semibold text-foreground">{formatDate(detail.createdAt)}</p>
              </div>
            </div>

            <Tabs items={DETAIL_TABS} value={detailTab} onChange={setDetailTab} />

            {detailTab === "generations" && (
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {detail.generations.length === 0 ? (
                  <EmptyState icon={ShoppingBag} title="Belum ada generasi" />
                ) : (
                  detail.generations.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{g.title}</p>
                        <p className="text-xs text-muted">
                          {GENERATION_TYPE_LABEL[g.type] ?? g.type} · {formatDateTime(g.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">{g.creditCost} kredit</span>
                        <Badge variant={GENERATION_STATUS_BADGE[g.status]?.variant ?? "neutral"}>
                          {GENERATION_STATUS_BADGE[g.status]?.label ?? g.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === "topups" && (
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {detail.topupTransactions.length === 0 ? (
                  <EmptyState icon={ReceiptText} title="Belum ada top up" />
                ) : (
                  detail.topupTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatIdr(t.amountIdr)} <span className="text-muted">→ {t.credits.toLocaleString("id-ID")} kredit</span>
                        </p>
                        <p className="text-xs text-muted">
                          {t.channel} · {formatDateTime(t.createdAt)}
                        </p>
                      </div>
                      <Badge variant={TOPUP_STATUS_BADGE[t.status]?.variant ?? "neutral"}>{TOPUP_STATUS_BADGE[t.status]?.label ?? t.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === "credits" && (
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {detail.creditTransactions.length === 0 ? (
                  <EmptyState icon={History} title="Belum ada riwayat kredit" />
                ) : (
                  detail.creditTransactions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.description}</p>
                        <p className="text-xs text-muted">{formatDateTime(c.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-semibold", c.amount >= 0 ? "text-success" : "text-danger")}>
                          {c.amount >= 0 ? "+" : ""}
                          {c.amount.toLocaleString("id-ID")}
                        </span>
                        <Badge variant={CREDIT_TX_BADGE[c.type]?.variant ?? "neutral"}>{CREDIT_TX_BADGE[c.type]?.label ?? c.type}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? "Pengguna"}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editSaving}>
              Batal
            </Button>
            <Button onClick={handleEditSave} isLoading={editSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {editError && <ErrorNotice message={editError} />}
          <Input label="Nama" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <Switch
            label="Akun Aktif"
            description={editForm.status === "ACTIVE" ? "Pengguna dapat masuk dan menggunakan layanan." : "Pengguna tidak dapat masuk."}
            checked={editForm.status === "ACTIVE"}
            onChange={(checked) => setEditForm({ ...editForm, status: checked ? "ACTIVE" : "SUSPENDED" })}
          />
        </div>
      </Modal>

      {/* Credit adjustment modal */}
      <Modal
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title={`Sesuaikan Kredit — ${adjusting?.name ?? ""}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjusting(null)} disabled={adjustSaving}>
              Batal
            </Button>
            <Button onClick={handleAdjustSave} isLoading={adjustSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {adjustError && <ErrorNotice message={adjustError} />}
          <p className="text-sm text-muted">
            Saldo saat ini: <span className="font-semibold text-foreground">{adjusting?.creditBalance.toLocaleString("id-ID")} kredit</span>
          </p>
          <Input
            label="Jumlah (gunakan minus untuk mengurangi)"
            type="number"
            step="1"
            placeholder="mis. 100 atau -50"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
          />
          <div className="flex gap-2">
            {[50, 100, 500, -50, -100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAdjustAmount(String(preset))}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {preset > 0 ? `+${preset}` : preset}
              </button>
            ))}
          </div>
          <Textarea
            label="Alasan"
            placeholder="mis. Kompensasi kendala layanan"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            rows={3}
          />
          {adjustAmount && Number.isFinite(Number(adjustAmount)) && (
            <p className="text-sm text-muted">
              Saldo setelah disesuaikan:{" "}
              <span className={cn("font-semibold", previewBalance < 0 ? "text-danger" : "text-foreground")}>
                {previewBalance.toLocaleString("id-ID")} kredit
              </span>
            </p>
          )}
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Hapus Pengguna"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteSaving}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteSaving}
              disabled={deleteConfirmText.trim().toLowerCase() !== deleting?.email.toLowerCase()}
            >
              Hapus Permanen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {deleteError && <ErrorNotice message={deleteError} />}
          <ErrorNotice
            message={`Akun "${deleting?.name}" beserta SEMUA data terkait (generasi, transaksi, riwayat kredit) akan dihapus permanen dan tidak dapat dikembalikan.`}
          />
          <p className="text-sm text-muted">
            Ketik <span className="font-mono font-semibold text-foreground">{deleting?.email}</span> untuk mengonfirmasi.
          </p>
          <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={deleting?.email} />
        </div>
      </Modal>
    </div>
  );
}

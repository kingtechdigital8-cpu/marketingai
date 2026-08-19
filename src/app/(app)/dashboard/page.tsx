"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Image as ImageIcon,
  Video,
  Radio,
  Scissors,
  Coins,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { useLiveCreditBalance } from "@/lib/use-credit-balance";

const quickActions = [
  { label: "Buat Konten SEO", href: "/seo", icon: Search },
  { label: "Gambar", href: "/ads/image", icon: ImageIcon },
  { label: "Video", href: "/ads/video", icon: Video },
  { label: "Live TikTok", href: "/live-tiktok", icon: Radio },
  { label: "Auto Clip", href: "/auto-clip", icon: Scissors },
];

type GenerationType =
  | "SEO_KEYWORDS"
  | "SEO_META"
  | "SEO_ARTICLE"
  | "IMAGE_GENERATION"
  | "VIDEO_GENERATION"
  | "VOICE_DUB"
  | "TIKTOK_LIVE_REPLY"
  | "AVATAR_GENERATION"
  | "VIDEO_CLIP";

type GenerationStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface ActivityItem {
  id: string;
  type: GenerationType;
  title: string;
  status: GenerationStatus;
  creditCost: number;
  createdAt: string;
}

const TYPE_LABEL: Record<GenerationType, string> = {
  SEO_KEYWORDS: "SEO - Ide Kata Kunci",
  SEO_META: "SEO - Meta Deskripsi",
  SEO_ARTICLE: "SEO - Artikel",
  IMAGE_GENERATION: "Gambar",
  VIDEO_GENERATION: "Video",
  VOICE_DUB: "Voice Changer",
  TIKTOK_LIVE_REPLY: "Live TikTok",
  AVATAR_GENERATION: "Avatar AI",
  VIDEO_CLIP: "Auto Clip",
};

const STATUS_BADGE: Record<GenerationStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

export default function DashboardOverviewPage() {
  const { data: session } = useSession();
  const { balance: creditBalance } = useLiveCreditBalance();

  const [assetsThisMonth, setAssetsThisMonth] = useState<number | null>(null);
  const [processingJobs, setProcessingJobs] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ActivityItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function loadSummary() {
    fetch("/api/dashboard/summary")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setAssetsThisMonth(data.assetsThisMonth ?? 0);
        setProcessingJobs(data.processingJobs ?? 0);
        setRecentActivity(data.recentActivity ?? []);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/generations/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setRecentActivity((prev) => (prev ?? []).filter((item) => item.id !== deleteTarget.id));
      }
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Selamat datang kembali, ${session?.user.name ?? "Pengguna"}`}
        description="Berikut ringkasan aktivitas marketing Anda."
        actions={
          <Link href="/credits" className={buttonVariants()}>
            <Coins className="h-4 w-4" />
            Beli Kredit
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Sisa Kredit</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{creditBalance}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Aset Dibuat Bulan Ini</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {assetsThisMonth === null ? (
                <span className="inline-block h-7 w-10 animate-pulse rounded bg-white/[.06] align-middle" />
              ) : (
                assetsThisMonth
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Job Sedang Diproses</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {processingJobs === null ? (
                <span className="inline-block h-7 w-10 animate-pulse rounded bg-white/[.06] align-middle" />
              ) : (
                processingJobs
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center text-xs font-medium text-foreground transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <action.icon className="h-5 w-5 text-brand" />
              {action.label}
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktivitas Terbaru</CardTitle>
          <Link href="/assets" className="text-sm font-medium text-brand hover:underline">
            Lihat Semua
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-5">
              <ErrorNotice message="Gagal memuat aktivitas terbaru. Coba muat ulang halaman." />
            </div>
          ) : !recentActivity ? (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[.06]" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada aktivitas" />
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3 font-medium">Nama Aset</th>
                      <th className="px-5 py-3 font-medium">Tipe</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Kredit</th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 font-medium text-foreground">{item.title}</td>
                        <td className="px-5 py-3 text-muted">{TYPE_LABEL[item.type] ?? item.type}</td>
                        <td className="px-5 py-3">
                          <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                        </td>
                        <td className="px-5 py-3 text-muted">{item.creditCost}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                            aria-label="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-border sm:hidden">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {TYPE_LABEL[item.type] ?? item.type} &middot; {item.creditCost} kredit
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="Hapus Aset"
        description="Aset yang dihapus tidak dapat dikembalikan. Apakah Anda yakin?"
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
}

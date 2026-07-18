"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Video as VideoIcon, Sparkles, Download, History, Upload, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLayout } from "@/components/ui/ToolLayout";
import { ImageGenerationLoader } from "@/components/ui/ImageGenerationLoader";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { CreditCostBadge } from "@/components/credits/CreditCostBadge";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { usePagination } from "@/lib/use-pagination";
import { cn } from "@/lib/utils";

type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface HistoryItem {
  id: string;
  title: string;
  status: JobStatus;
  creditCost: number;
  createdAt: string;
}

interface JobDetail {
  id: string;
  title: string;
  status: JobStatus;
  content: string | null;
  errorMessage: string | null;
  creditCost: number;
  createdAt: string;
}

const DURATIONS: { value: "5" | "10"; label: string }[] = [
  { value: "5", label: "5 detik" },
  { value: "10", label: "10 detik" },
];

const STATUS_BADGE: Record<JobStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

const VIDEO_LOADING_MESSAGES = [
  "Menganalisis gambar sumber...",
  "Merancang gerakan adegan...",
  "Merender frame video...",
  "Menghaluskan transisi...",
  "Menyelesaikan render akhir...",
];

function isPending(status: JobStatus) {
  return status === "PENDING" || status === "PROCESSING";
}

export default function AdsVideoPage() {
  const { update } = useSession();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<"5" | "10">("5");
  const [referenceItem, setReferenceItem] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobDetail | null>(null);

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const { page, setPage, pageCount, pageItems: historyPage } = usePagination(history ?? [], 5);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState<JobDetail | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  function loadHistory() {
    fetch("/api/videos/history")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setHistory(data.generations ?? []);
        setHistoryError(false);
      })
      .catch(() => {
        setHistory([]);
        setHistoryError(true);
      });
  }

  useEffect(loadHistory, []);

  useEffect(() => {
    if (!history) return;
    const pending = history.filter((h) => isPending(h.status));
    if (pending.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(pending.map((h) => fetch(`/api/ai/video/${h.id}`)));
      loadHistory();
    }, 6000);
    return () => clearInterval(id);
  }, [history]);

  useEffect(() => {
    if (!activeJob || !isPending(activeJob.status)) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/ai/video/${activeJob.id}`);
      const data = await res.json().catch(() => null);
      if (data?.generation) {
        setActiveJob(data.generation);
        if (!isPending(data.generation.status)) loadHistory();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [activeJob]);

  useEffect(() => {
    if (!viewingDetail || !isPending(viewingDetail.status)) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/ai/video/${viewingDetail.id}`);
      const data = await res.json().catch(() => null);
      if (data?.generation) setViewingDetail(data.generation);
    }, 4000);
    return () => clearInterval(id);
  }, [viewingDetail]);

  function handleReferenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (referenceItem) URL.revokeObjectURL(referenceItem.previewUrl);
    setReferenceItem({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function clearReferenceFile() {
    if (referenceItem) URL.revokeObjectURL(referenceItem.previewUrl);
    setReferenceItem(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (!referenceItem) {
      setError("Unggah gambar produk/objek/karakter terlebih dahulu sebagai titik awal video.");
      return;
    }

    const balanceRes = await fetch("/api/credits/balance");
    const balanceData = await balanceRes.json().catch(() => null);
    if (balanceRes.ok && balanceData && balanceData.creditBalance < CREDIT_COSTS.VIDEO_GENERATION) {
      setError(
        `Kredit Anda tidak cukup (butuh ${CREDIT_COSTS.VIDEO_GENERATION}, sisa ${balanceData.creditBalance}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("prompt", prompt);
      formData.set("duration", duration);
      formData.set("referenceImage", referenceItem.file);
      const res = await fetch("/api/ai/video", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal memulai pembuatan video.");
        return;
      }
      setActiveJob({
        id: data.generationId,
        title: prompt,
        status: data.status,
        content: null,
        errorMessage: null,
        creditCost: CREDIT_COSTS.VIDEO_GENERATION,
        createdAt: new Date().toISOString(),
      });
      await update({ creditBalance: data.creditBalance });
      loadHistory();
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi Anda dan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openView(item: HistoryItem) {
    setViewingId(item.id);
    setViewingDetail(null);
    setViewingLoading(true);
    const res = await fetch(`/api/ai/video/${item.id}`);
    const data = await res.json();
    setViewingLoading(false);
    if (res.ok) setViewingDetail(data.generation);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Generator Video"
        description="Buat video iklan/produk dari gambar produk, objek, atau karakter dengan AI."
        icon={VideoIcon}
      />

      <ToolLayout
        formTitle="Generator Video"
        formIcon={VideoIcon}
        resultTitle="Hasil Video"
        resultActions={
          activeJob?.status === "COMPLETED" ? (
            <a
              href={`/api/videos/download/${activeJob.id}`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5" />
              Unduh
            </a>
          ) : undefined
        }
        result={
          activeJob ? (
            isPending(activeJob.status) ? (
              <ImageGenerationLoader messages={VIDEO_LOADING_MESSAGES} />
            ) : activeJob.status === "COMPLETED" && activeJob.content ? (
              <video
                controls
                src={activeJob.content}
                className="w-full rounded-lg border border-border bg-black"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <ErrorNotice message={activeJob.errorMessage ?? "Gagal membuat video."} />
                <p className="text-xs text-muted">Kredit yang terpakai untuk percobaan ini sudah dikembalikan.</p>
              </div>
            )
          ) : (
            <EmptyState icon={VideoIcon} title="Belum ada hasil" />
          )
        }
        form={
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Textarea
              label="Deskripsi Video"
              placeholder="mis. produk berputar perlahan di atas meja dengan pencahayaan studio, kamera zoom in perlahan"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Gambar Produk / Objek / Karakter</label>
              <p className="text-xs text-muted">Gambar ini jadi frame awal video yang dihasilkan AI.</p>
              {referenceItem ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview URL */}
                  <img
                    src={referenceItem.previewUrl}
                    alt="Pratinjau gambar sumber video"
                    className="h-32 w-32 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearReferenceFile}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-foreground"
                    aria-label="Hapus gambar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground">
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">Unggah</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleReferenceFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Durasi</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                      duration === d.value
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border text-muted hover:border-border-strong hover:text-foreground"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <ErrorNotice message={error} />}
            <div className="flex items-center justify-between pt-1">
              <CreditCostBadge cost={CREDIT_COSTS.VIDEO_GENERATION} />
              <Button type="submit" isLoading={isSubmitting}>
                <Sparkles className="h-4 w-4" />
                Buat Video
              </Button>
            </div>
          </form>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            Riwayat Video
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!history ? (
            <div className="flex flex-col gap-2 p-5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.06]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.06]" />
            </div>
          ) : historyError ? (
            <div className="p-5">
              <ErrorNotice message="Gagal memuat riwayat. Coba muat ulang halaman." />
            </div>
          ) : history.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={History} title="Belum ada riwayat" />
            </div>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Deskripsi</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPage.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => openView(item)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-white/[.03]"
                    >
                      <td className="max-w-xs truncate px-5 py-3 text-foreground">{item.title}</td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">{item.creditCost}</td>
                      <td className="px-5 py-3 text-muted">
                        {new Date(item.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={viewingId !== null} onClose={() => setViewingId(null)} title={viewingDetail?.title} size="lg">
        {viewingLoading ? (
          <div className="flex flex-col gap-3 p-1">
            {[100, 90, 95, 60].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : viewingDetail ? (
          <div className="flex flex-col gap-3">
            {isPending(viewingDetail.status) ? (
              <ImageGenerationLoader messages={VIDEO_LOADING_MESSAGES} />
            ) : viewingDetail.status === "COMPLETED" && viewingDetail.content ? (
              <>
                <video controls src={viewingDetail.content} className="w-full rounded-lg border border-border bg-black" />
                <a
                  href={`/api/videos/download/${viewingDetail.id}`}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh
                </a>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <ErrorNotice message={viewingDetail.errorMessage ?? "Gagal membuat video."} />
                <p className="text-xs text-muted">Kredit yang terpakai untuk percobaan ini sudah dikembalikan.</p>
              </div>
            )}
          </div>
        ) : (
          <ErrorNotice message="Gagal memuat detail." />
        )}
      </Modal>
    </div>
  );
}

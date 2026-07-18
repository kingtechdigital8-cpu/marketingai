"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Video as VideoIcon, Sparkles, Download, History, Upload, X, Mic, Play } from "lucide-react";
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
import { Tabs } from "@/components/ui/Tabs";
import { CreditCostBadge } from "@/components/credits/CreditCostBadge";
import { useCreditCosts } from "@/lib/use-credit-costs";
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

const STATUS_BADGE: Record<JobStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

function isPending(status: JobStatus) {
  return status === "PENDING" || status === "PROCESSING";
}

export default function AdsVideoPage() {
  const [tab, setTab] = useState("generate");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Generator Video"
        description="Buat video iklan/produk dari gambar produk, objek, atau karakter dengan AI."
        icon={VideoIcon}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "generate", label: "Generator Video", icon: VideoIcon },
          { id: "voice", label: "Voice Changer", icon: Mic },
        ]}
      />

      {tab === "generate" ? <VideoGeneratorTab /> : <VoiceChangerTab />}
    </div>
  );
}

const VIDEO_LOADING_MESSAGES = [
  "Menganalisis gambar sumber...",
  "Merancang gerakan adegan...",
  "Merender frame video...",
  "Menghaluskan transisi...",
  "Menyelesaikan render akhir...",
];

const VIDEO_STORAGE_KEY = "marketingai:lastVideoJobId";

const DURATIONS: { value: "5" | "10"; label: string }[] = [
  { value: "5", label: "5 detik" },
  { value: "10", label: "10 detik" },
];

function VideoGeneratorTab() {
  const { update } = useSession();
  const creditCosts = useCreditCosts();
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

  // Resume tracking the last job after a page reload — otherwise a job still
  // running server-side looks "lost" just because in-memory state reset.
  useEffect(() => {
    const lastId = localStorage.getItem(VIDEO_STORAGE_KEY);
    if (!lastId) return;
    fetch(`/api/ai/video/${lastId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.generation) setActiveJob(data.generation);
      })
      .catch(() => {});
  }, []);

  // Skip the active job here — it already has its own dedicated poller below,
  // polling it from both places at once would double the fal.ai/R2 work on
  // the very poll that finds it done.
  useEffect(() => {
    if (!history) return;
    const pending = history.filter((h) => isPending(h.status) && h.id !== activeJob?.id);
    if (pending.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(pending.map((h) => fetch(`/api/ai/video/${h.id}`)));
      loadHistory();
    }, 6000);
    return () => clearInterval(id);
  }, [history, activeJob?.id]);

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
    if (viewingDetail.id === activeJob?.id) return; // already kept fresh by the active-job poller above
    const id = setInterval(async () => {
      const res = await fetch(`/api/ai/video/${viewingDetail.id}`);
      const data = await res.json().catch(() => null);
      if (data?.generation) setViewingDetail(data.generation);
    }, 4000);
    return () => clearInterval(id);
  }, [viewingDetail, activeJob?.id]);

  // If the modal is viewing the same job the active-job poller is already tracking,
  // show that poller's fresher data instead of the modal's own (possibly stale) fetch.
  const displayedDetail = viewingDetail?.id === activeJob?.id ? activeJob : viewingDetail;

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
    if (balanceRes.ok && balanceData && balanceData.creditBalance < creditCosts.VIDEO_GENERATION) {
      setError(
        `Kredit Anda tidak cukup (butuh ${creditCosts.VIDEO_GENERATION}, sisa ${balanceData.creditBalance}).`
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
      localStorage.setItem(VIDEO_STORAGE_KEY, data.generationId);
      setActiveJob({
        id: data.generationId,
        title: prompt,
        status: data.status,
        content: null,
        errorMessage: null,
        creditCost: creditCosts.VIDEO_GENERATION,
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
              <CreditCostBadge cost={creditCosts.VIDEO_GENERATION} />
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
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {historyPage.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
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
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openView(item)}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Lihat
                        </button>
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

      <Modal open={viewingId !== null} onClose={() => setViewingId(null)} title={displayedDetail?.title} size="lg">
        {viewingLoading ? (
          <div className="flex flex-col gap-3 p-1">
            {[100, 90, 95, 60].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : displayedDetail ? (
          <div className="flex flex-col gap-3">
            {isPending(displayedDetail.status) ? (
              <ImageGenerationLoader messages={VIDEO_LOADING_MESSAGES} />
            ) : displayedDetail.status === "COMPLETED" && displayedDetail.content ? (
              <>
                <video controls src={displayedDetail.content} className="w-full rounded-lg border border-border bg-black" />
                <a
                  href={`/api/videos/download/${displayedDetail.id}`}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh
                </a>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <ErrorNotice message={displayedDetail.errorMessage ?? "Gagal membuat video."} />
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

const VOICE_LOADING_MESSAGES = [
  "Menyusun suara dari teks...",
  "Menganalisis gerakan mulut...",
  "Menyinkronkan audio ke video...",
  "Menyelesaikan render akhir...",
];

const VOICE_STORAGE_KEY = "marketingai:lastVoiceDubJobId";
const MAX_TEXT_LENGTH = 500;

const VOICES = [
  { value: "alloy", label: "Alloy (netral)" },
  { value: "nova", label: "Nova (wanita, ceria)" },
  { value: "shimmer", label: "Shimmer (wanita, lembut)" },
  { value: "echo", label: "Echo (pria, hangat)" },
  { value: "onyx", label: "Onyx (pria, dalam)" },
  { value: "fable", label: "Fable (pria, ekspresif)" },
];

function VoiceChangerTab() {
  const { update } = useSession();
  const creditCosts = useCreditCosts();
  const [sourceMode, setSourceMode] = useState<"history" | "upload">("history");
  const [sourceVideos, setSourceVideos] = useState<HistoryItem[] | null>(null);
  const [sourceGenerationId, setSourceGenerationId] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [audioMode, setAudioMode] = useState<"tts" | "upload">("tts");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(VOICES[0].value);
  const [uploadedAudio, setUploadedAudio] = useState<File | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobDetail | null>(null);

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const { page, setPage, pageCount, pageItems: historyPage } = usePagination(history ?? [], 5);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState<JobDetail | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  function loadSourceVideos() {
    fetch("/api/videos/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const completed: HistoryItem[] = (data?.generations ?? []).filter(
          (g: HistoryItem) => g.status === "COMPLETED"
        );
        setSourceVideos(completed);
      })
      .catch(() => setSourceVideos([]));
  }

  function loadHistory() {
    fetch("/api/voice-changer/history")
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

  useEffect(loadSourceVideos, []);
  useEffect(loadHistory, []);

  useEffect(() => {
    const lastId = localStorage.getItem(VOICE_STORAGE_KEY);
    if (!lastId) return;
    fetch(`/api/ai/voice-changer/${lastId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.generation) setActiveJob(data.generation);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!history) return;
    const pending = history.filter((h) => isPending(h.status) && h.id !== activeJob?.id);
    if (pending.length === 0) return;
    const id = setInterval(async () => {
      await Promise.all(pending.map((h) => fetch(`/api/ai/voice-changer/${h.id}`)));
      loadHistory();
    }, 6000);
    return () => clearInterval(id);
  }, [history, activeJob?.id]);

  useEffect(() => {
    if (!activeJob || !isPending(activeJob.status)) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/ai/voice-changer/${activeJob.id}`);
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
    if (viewingDetail.id === activeJob?.id) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/ai/voice-changer/${viewingDetail.id}`);
      const data = await res.json().catch(() => null);
      if (data?.generation) setViewingDetail(data.generation);
    }, 4000);
    return () => clearInterval(id);
  }, [viewingDetail, activeJob?.id]);

  const displayedDetail = viewingDetail?.id === activeJob?.id ? activeJob : viewingDetail;

  function handleUploadedVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (uploadedVideo) URL.revokeObjectURL(uploadedVideo.previewUrl);
    setUploadedVideo({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function clearUploadedVideo() {
    if (uploadedVideo) URL.revokeObjectURL(uploadedVideo.previewUrl);
    setUploadedVideo(null);
  }

  function handleUploadedAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) setUploadedAudio(file);
    e.target.value = "";
  }

  async function handlePreviewVoice() {
    if (isPreviewLoading) return;
    setIsPreviewLoading(true);
    try {
      const res = await fetch("/api/ai/voice-changer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Gagal memutar contoh suara.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch {
      setError("Gagal memutar contoh suara.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (sourceMode === "history" && !sourceGenerationId) {
      setError("Pilih video sumber terlebih dahulu.");
      return;
    }
    if (sourceMode === "upload" && !uploadedVideo) {
      setError("Unggah video sumber terlebih dahulu.");
      return;
    }
    if (audioMode === "tts" && !text) {
      setError("Teks dialog wajib diisi.");
      return;
    }
    if (audioMode === "upload" && !uploadedAudio) {
      setError("Unggah file audio terlebih dahulu.");
      return;
    }

    const balanceRes = await fetch("/api/credits/balance");
    const balanceData = await balanceRes.json().catch(() => null);
    if (balanceRes.ok && balanceData && balanceData.creditBalance < creditCosts.VOICE_DUB) {
      setError(`Kredit Anda tidak cukup (butuh ${creditCosts.VOICE_DUB}, sisa ${balanceData.creditBalance}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (sourceMode === "history") {
        formData.set("sourceGenerationId", sourceGenerationId);
      } else if (uploadedVideo) {
        formData.set("sourceVideo", uploadedVideo.file);
      }
      if (audioMode === "upload" && uploadedAudio) {
        formData.set("audioFile", uploadedAudio);
      } else {
        formData.set("text", text);
        formData.set("voice", voice);
      }
      const res = await fetch("/api/ai/voice-changer", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal memulai voice changer.");
        return;
      }
      localStorage.setItem(VOICE_STORAGE_KEY, data.generationId);
      setActiveJob({
        id: data.generationId,
        title: audioMode === "upload" && uploadedAudio ? `Voice Changer: ${uploadedAudio.name}` : text,
        status: data.status,
        content: null,
        errorMessage: null,
        creditCost: creditCosts.VOICE_DUB,
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
    const res = await fetch(`/api/ai/voice-changer/${item.id}`);
    const data = await res.json();
    setViewingLoading(false);
    if (res.ok) setViewingDetail(data.generation);
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolLayout
        formTitle="Voice Changer"
        formIcon={Mic}
        resultTitle="Hasil Voice Changer"
        resultActions={
          activeJob?.status === "COMPLETED" ? (
            <a
              href={`/api/voice-changer/download/${activeJob.id}`}
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
              <ImageGenerationLoader messages={VOICE_LOADING_MESSAGES} />
            ) : activeJob.status === "COMPLETED" && activeJob.content ? (
              <video controls src={activeJob.content} className="w-full rounded-lg border border-border bg-black" />
            ) : (
              <div className="flex flex-col gap-2">
                <ErrorNotice message={activeJob.errorMessage ?? "Gagal memproses voice changer."} />
                <p className="text-xs text-muted">Kredit yang terpakai untuk percobaan ini sudah dikembalikan.</p>
              </div>
            )
          ) : (
            <EmptyState icon={Mic} title="Belum ada hasil" />
          )
        }
        form={
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Video Sumber</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourceMode("history")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    sourceMode === "history"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  Dari Riwayat
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("upload")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    sourceMode === "upload"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  Upload Video
                </button>
              </div>

              {sourceMode === "history" ? (
                <>
                  <p className="text-xs text-muted">Pilih video yang sudah selesai dibuat di tab Generator Video.</p>
                  {sourceVideos === null ? (
                    <div className="h-10 animate-pulse rounded-lg bg-white/[.06]" />
                  ) : sourceVideos.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
                      Belum ada video selesai. Buat video dulu di tab Generator Video.
                    </p>
                  ) : (
                    <select
                      value={sourceGenerationId}
                      onChange={(e) => setSourceGenerationId(e.target.value)}
                      className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                    >
                      <option value="">Pilih video...</option>
                      {sourceVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted">Unggah video Anda sendiri (MP4/WEBM/MOV, maksimal 50MB).</p>
                  {uploadedVideo ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                      <video src={uploadedVideo.previewUrl} className="h-16 w-24 rounded-md bg-black object-cover" />
                      <span className="flex-1 truncate text-sm text-foreground">{uploadedVideo.file.name}</span>
                      <button
                        type="button"
                        onClick={clearUploadedVideo}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/[.06] hover:text-foreground"
                        aria-label="Hapus video"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Unggah video</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={handleUploadedVideoChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Sumber Audio</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAudioMode("tts")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    audioMode === "tts"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  Teks ke Suara
                </button>
                <button
                  type="button"
                  onClick={() => setAudioMode("upload")}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    audioMode === "upload"
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  Upload Audio
                </button>
              </div>
            </div>

            {audioMode === "tts" ? (
              <>
                <Textarea
                  label="Teks Dialog"
                  placeholder='mis. "Halo, selamat datang di toko kami!"'
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                  rows={3}
                  required
                />
                <p className="-mt-2 text-right text-xs text-muted">
                  {text.length}/{MAX_TEXT_LENGTH}
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Suara</label>
                  <div className="flex gap-2">
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                    >
                      {VOICES.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" size="md" isLoading={isPreviewLoading} onClick={handlePreviewVoice}>
                      <Play className="h-4 w-4" />
                      Coba
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Mendukung Bahasa Indonesia dan berbagai bahasa lain — teks diucapkan langsung sesuai
                    bahasa yang Anda tulis, tanpa diterjemahkan.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">File Audio</label>
                <p className="text-xs text-muted">Unggah rekaman suara Anda sendiri (MP3/WAV/M4A, maksimal 10MB).</p>
                {uploadedAudio ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Mic className="h-5 w-5 shrink-0 text-brand" />
                    <span className="flex-1 truncate text-sm text-foreground">{uploadedAudio.name}</span>
                    <button
                      type="button"
                      onClick={() => setUploadedAudio(null)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/[.06] hover:text-foreground"
                      aria-label="Hapus audio"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Unggah audio</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a"
                      onChange={handleUploadedAudioChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
            {error && <ErrorNotice message={error} />}
            <div className="flex items-center justify-between pt-1">
              <CreditCostBadge cost={creditCosts.VOICE_DUB} />
              <Button type="submit" isLoading={isSubmitting}>
                <Sparkles className="h-4 w-4" />
                Ubah Suara
              </Button>
            </div>
          </form>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            Riwayat Voice Changer
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
                    <th className="px-5 py-3 font-medium">Dialog</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {historyPage.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
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
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openView(item)}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Lihat
                        </button>
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

      <Modal open={viewingId !== null} onClose={() => setViewingId(null)} title={displayedDetail?.title} size="lg">
        {viewingLoading ? (
          <div className="flex flex-col gap-3 p-1">
            {[100, 90, 95, 60].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : displayedDetail ? (
          <div className="flex flex-col gap-3">
            {isPending(displayedDetail.status) ? (
              <ImageGenerationLoader messages={VOICE_LOADING_MESSAGES} />
            ) : displayedDetail.status === "COMPLETED" && displayedDetail.content ? (
              <>
                <video controls src={displayedDetail.content} className="w-full rounded-lg border border-border bg-black" />
                <a
                  href={`/api/voice-changer/download/${displayedDetail.id}`}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh
                </a>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <ErrorNotice message={displayedDetail.errorMessage ?? "Gagal memproses voice changer."} />
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

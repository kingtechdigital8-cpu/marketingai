"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  History,
  Square,
  RectangleVertical,
  Smartphone,
  MonitorPlay,
  Pin,
  LayoutTemplate,
  Monitor,
  Ruler,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLayout } from "@/components/ui/ToolLayout";
import { LoadingResult } from "@/components/ui/LoadingResult";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { CreditCostBadge } from "@/components/credits/CreditCostBadge";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { usePagination } from "@/lib/use-pagination";
import { toggleListValue } from "@/lib/toggle-list";
import { cn } from "@/lib/utils";

interface HistoryItem {
  id: string;
  title: string;
  creditCost: number;
  createdAt: string;
}

interface SizePreset {
  value: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  width: number | null;
  height: number | null;
}

const SIZE_PRESETS: SizePreset[] = [
  { value: "square", label: "Persegi 1:1", hint: "IG & FB Post", icon: Square, width: 1080, height: 1080 },
  { value: "portrait", label: "Potret 4:5", hint: "IG & FB Ad", icon: RectangleVertical, width: 1080, height: 1350 },
  { value: "story", label: "Story 9:16", hint: "IG, WA, TikTok", icon: Smartphone, width: 1080, height: 1920 },
  { value: "landscape", label: "Lanskap 16:9", hint: "YouTube & X", icon: MonitorPlay, width: 1280, height: 720 },
  { value: "pinterest", label: "Pin 2:3", hint: "Pinterest", icon: Pin, width: 1000, height: 1500 },
  { value: "banner", label: "Banner Web", hint: "Leaderboard", icon: LayoutTemplate, width: 1200, height: 628 },
  { value: "cover", label: "Cover", hint: "FB & LinkedIn", icon: Monitor, width: 820, height: 312 },
  { value: "custom", label: "Custom", hint: "Ukuran sendiri", icon: Ruler, width: null, height: null },
];

const MIN_DIMENSION = 256;
const MAX_DIMENSION = 2048;

const STYLE_PRESETS = [
  "Fotografi Realistis",
  "Ilustrasi Digital",
  "Minimalis",
  "3D Render",
  "Flat Design",
  "Vibrant & Colorful",
  "Mewah/Elegan",
  "Retro/Vintage",
];

export default function ImagePage() {
  const { update } = useSession();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [sizePreset, setSizePreset] = useState("square");
  const [customWidth, setCustomWidth] = useState("1024");
  const [customHeight, setCustomHeight] = useState("1024");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ image: string; generationId: string } | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const { page, setPage, pageCount, pageItems: historyPage } = usePagination(history ?? [], 5);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState<{ title: string; content: string } | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  function loadHistory() {
    fetch("/api/images/history")
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

  const activePreset = SIZE_PRESETS.find((p) => p.value === sizePreset) ?? SIZE_PRESETS[0];
  const isCustomSize = activePreset.value === "custom";
  const width = isCustomSize ? Number(customWidth) : activePreset.width!;
  const height = isCustomSize ? Number(customHeight) : activePreset.height!;
  const customSizeInvalid =
    isCustomSize &&
    (!Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < MIN_DIMENSION ||
      height < MIN_DIMENSION ||
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION);

  function handleReferenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    setReferenceFile(file);
    setReferencePreviewUrl(file ? URL.createObjectURL(file) : null);
    e.target.value = "";
  }

  function clearReferenceFile() {
    if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    setReferenceFile(null);
    setReferencePreviewUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("prompt", prompt);
    formData.set("style", style);
    formData.set("width", String(width));
    formData.set("height", String(height));
    if (referenceFile) formData.set("referenceImage", referenceFile);
    const res = await fetch("/api/ai/image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setIsLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal generate.");
      return;
    }
    setResult({ image: data.image, generationId: data.generationId });
    await update({ creditBalance: data.creditBalance });
    loadHistory();
  }

  async function openView(item: HistoryItem) {
    setViewingId(item.id);
    setViewingDetail(null);
    setViewingLoading(true);
    const res = await fetch(`/api/images/history/${item.id}`);
    const data = await res.json();
    setViewingLoading(false);
    if (res.ok) {
      setViewingDetail({ title: data.generation.title, content: data.generation.content });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Generator Gambar"
        description="Buat visual iklan, banner, dan gambar promosi untuk berbagai platform dengan AI."
        icon={ImageIcon}
      />

      <ToolLayout
        formTitle="Generator Gambar"
        formIcon={ImageIcon}
        resultTitle="Hasil Gambar"
        resultActions={
          result ? (
            <a
              href={`/api/images/download/${result.generationId}`}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5" />
              Unduh
            </a>
          ) : undefined
        }
        result={
          isLoading ? (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border bg-surface-2">
              <LoadingResult />
            </div>
          ) : result ? (
            // eslint-disable-next-line @next/next/no-img-element -- external R2 URL, domain not known at build time for next/image
            <img
              src={result.image}
              alt={prompt}
              className="w-full rounded-lg border border-border object-contain"
            />
          ) : (
            <EmptyState icon={ImageIcon} title="Belum ada hasil" />
          )
        }
        form={
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Textarea
              label="Deskripsi Gambar"
              placeholder="mis. secangkir kopi hitam di atas meja kayu dengan cahaya pagi yang hangat"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Gambar Referensi (opsional)</label>
              <p className="text-xs text-muted">Unggah gambar yang ingin ditiru gaya/komposisinya atau diedit oleh AI.</p>
              {referencePreviewUrl ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview URL */}
                  <img
                    src={referencePreviewUrl}
                    alt="Pratinjau gambar referensi"
                    className="h-28 w-28 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearReferenceFile}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-foreground"
                    aria-label="Hapus gambar referensi"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground">
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
              <label className="text-sm font-medium text-foreground">Ukuran / Rasio</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.hint}
                    onClick={() => setSizePreset(preset.value)}
                    className={cn(
                      "flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-center transition-colors",
                      sizePreset === preset.value
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border text-muted hover:border-border-strong hover:text-foreground"
                    )}
                  >
                    <preset.icon className="h-5 w-5 shrink-0" />
                    <span className="w-full truncate text-xs font-semibold">{preset.label}</span>
                    <span className="w-full truncate text-[11px] opacity-80">{preset.hint}</span>
                  </button>
                ))}
              </div>
              {isCustomSize && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted">Lebar (px)</label>
                    <input
                      type="number"
                      min={MIN_DIMENSION}
                      max={MAX_DIMENSION}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted">Tinggi (px)</label>
                    <input
                      type="number"
                      min={MIN_DIMENSION}
                      max={MAX_DIMENSION}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
                    />
                  </div>
                  {customSizeInvalid && (
                    <p className="col-span-2 text-xs text-danger">
                      Ukuran harus antara {MIN_DIMENSION}-{MAX_DIMENSION} piksel.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Gaya Visual (opsional)</label>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_PRESETS.map((preset) => (
                  <ToggleChip
                    key={preset}
                    label={preset}
                    active={style
                      .split(",")
                      .map((s) => s.trim())
                      .includes(preset)}
                    onClick={() => setStyle((current) => toggleListValue(current, preset))}
                  />
                ))}
              </div>
            </div>
            {error && <ErrorNotice message={error} />}
            <div className="flex items-center justify-between pt-1">
              <CreditCostBadge cost={CREDIT_COSTS.IMAGE_GENERATION} />
              <Button type="submit" isLoading={isLoading} disabled={customSizeInvalid}>
                <Sparkles className="h-4 w-4" />
                Buat Gambar
              </Button>
            </div>
          </form>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            Riwayat Gambar
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
            <EmptyState icon={History} title="Belum ada riwayat" />
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Deskripsi</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {historyPage.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                      <td className="max-w-md truncate px-5 py-3 font-medium text-foreground">{item.title}</td>
                      <td className="px-5 py-3">
                        <Badge variant="brand">{item.creditCost} kredit</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {new Date(item.createdAt).toLocaleDateString("id-ID")}
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

      <Modal open={viewingId !== null} onClose={() => setViewingId(null)} title={viewingDetail?.title} size="lg">
        {viewingLoading ? (
          <LoadingResult />
        ) : viewingDetail ? (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- external R2 URL, domain not known at build time for next/image */}
            <img
              src={viewingDetail.content}
              alt={viewingDetail.title}
              className="w-full rounded-lg border border-border object-contain"
            />
            <a
              href={`/api/images/download/${viewingId}`}
              download
              className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
            >
              <Download className="h-3.5 w-3.5" />
              Unduh
            </a>
          </div>
        ) : (
          <ErrorNotice message="Gagal memuat gambar." />
        )}
      </Modal>
    </div>
  );
}

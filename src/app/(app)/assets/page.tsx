"use client";

import { useEffect, useState } from "react";
import {
  FolderOpen,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  Download,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { usePagination } from "@/lib/use-pagination";

type AssetType = "IMAGE_GENERATION" | "VIDEO_GENERATION" | "VOICE_DUB";
type AssetStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface Asset {
  id: string;
  type: AssetType;
  title: string;
  status: AssetStatus;
  content: string | null;
  creditCost: number;
  createdAt: string;
}

const TYPE_LABEL: Record<AssetType, string> = {
  IMAGE_GENERATION: "Gambar",
  VIDEO_GENERATION: "Video",
  VOICE_DUB: "Voice Changer",
};

const TYPE_ICON: Record<AssetType, LucideIcon> = {
  IMAGE_GENERATION: ImageIcon,
  VIDEO_GENERATION: VideoIcon,
  VOICE_DUB: Mic,
};

const STATUS_BADGE: Record<AssetStatus, { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Menunggu", variant: "neutral" },
  PROCESSING: { label: "Diproses", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  FAILED: { label: "Gagal", variant: "danger" },
};

const DOWNLOAD_BASE: Record<AssetType, string> = {
  IMAGE_GENERATION: "/api/images/download",
  VIDEO_GENERATION: "/api/videos/download",
  VOICE_DUB: "/api/voice-changer/download",
};

const FILTERS: { id: "all" | AssetType; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Semua", icon: FolderOpen },
  { id: "IMAGE_GENERATION", label: "Gambar", icon: ImageIcon },
  { id: "VIDEO_GENERATION", label: "Video", icon: VideoIcon },
  { id: "VOICE_DUB", label: "Voice Changer", icon: Mic },
];

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"all" | AssetType>("all");
  const [viewing, setViewing] = useState<Asset | null>(null);

  useEffect(() => {
    fetch("/api/assets")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setAssets(data.assets ?? []);
      })
      .catch(() => setError(true));
  }, []);

  const filtered = (assets ?? []).filter((a) => filter === "all" || a.type === filter);
  const { page, setPage, pageCount, pageItems } = usePagination(filtered, 12);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Aset Saya"
        description="Semua hasil generate gambar, video, dan voice changer Anda dalam satu tempat."
        icon={FolderOpen}
      />

      <Tabs
        value={filter}
        onChange={(id) => {
          setFilter(id as "all" | AssetType);
          setPage(1);
        }}
        items={FILTERS}
      />

      {!assets ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-white/[.06]" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent>
            <ErrorNotice message="Gagal memuat aset. Coba muat ulang halaman." />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={FolderOpen} title="Belum ada aset" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pageItems.map((asset) => {
              const TypeIcon = TYPE_ICON[asset.type];
              return (
                <button
                  key={asset.id}
                  onClick={() => setViewing(asset)}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-border-strong"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
                    {asset.status === "COMPLETED" && asset.content ? (
                      asset.type === "IMAGE_GENERATION" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external R2 URL
                        <img
                          src={asset.content}
                          alt={asset.title}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <>
                          <video src={asset.content} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="h-8 w-8 text-white drop-shadow" />
                          </span>
                        </>
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <TypeIcon className="h-8 w-8 text-muted" />
                      </div>
                    )}
                    <span className="absolute right-2 top-2">
                      <Badge variant={STATUS_BADGE[asset.status].variant}>{STATUS_BADGE[asset.status].label}</Badge>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <TypeIcon className="h-3.5 w-3.5" />
                      {TYPE_LABEL[asset.type]}
                    </span>
                    <p className="truncate text-sm font-medium text-foreground">{asset.title}</p>
                    <p className="text-xs text-muted">
                      {new Date(asset.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title} size="lg">
        {viewing && (
          <div className="flex flex-col gap-3">
            {viewing.status === "COMPLETED" && viewing.content ? (
              <>
                {viewing.type === "IMAGE_GENERATION" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external R2 URL
                  <img
                    src={viewing.content}
                    alt={viewing.title}
                    className="w-full rounded-lg border border-border object-contain"
                  />
                ) : (
                  <video
                    controls
                    src={viewing.content}
                    className="w-full rounded-lg border border-border bg-black"
                  />
                )}
                <a
                  href={`${DOWNLOAD_BASE[viewing.type]}/${viewing.id}`}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "self-end" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh
                </a>
              </>
            ) : (
              <EmptyState
                icon={TYPE_ICON[viewing.type]}
                title={
                  viewing.status === "FAILED"
                    ? "Gagal diproses"
                    : viewing.status === "PROCESSING"
                      ? "Masih diproses"
                      : "Masih menunggu"
                }
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

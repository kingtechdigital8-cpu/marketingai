"use client";

import { useEffect, useState } from "react";
import { Upload, Trash2, Check, Image as ImageIcon, Film, Music as MusicIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAssetKindConfig, type VideoClipAssetKind } from "@/lib/video-clip-asset-options";

interface Asset {
  id: string;
  kind: VideoClipAssetKind;
  url: string;
  label: string;
}

interface AssetPickerProps {
  kind: VideoClipAssetKind;
  value: string | null;
  onChange: (assetId: string | null) => void;
}

const KIND_ICON: Record<VideoClipAssetKind, typeof ImageIcon> = {
  LOGO: ImageIcon,
  INTRO: Film,
  OUTRO: Film,
  MUSIC: MusicIcon,
};

export function AssetPicker({ kind, value, onChange }: AssetPickerProps) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = getAssetKindConfig(kind);
  const Icon = KIND_ICON[kind];

  function loadAssets() {
    fetch(`/api/video-clip-assets?kind=${kind}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAssets(data.assets ?? []);
      })
      .catch(() => setAssets([]));
  }

  useEffect(loadAssets, [kind]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      form.set("label", file.name);
      const res = await fetch("/api/video-clip-assets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal mengunggah file.");
        return;
      }
      setAssets((prev) => [data.asset, ...(prev ?? [])]);
      onChange(data.asset.id);
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    setAssets((prev) => (prev ?? []).filter((a) => a.id !== assetId));
    if (value === assetId) onChange(null);
    await fetch(`/api/video-clip-assets/${assetId}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-2">
      {assets === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/[.06]" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {assets.map((asset) => {
            const isSelected = value === asset.id;
            return (
              <div key={asset.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onChange(isSelected ? null : asset.id)}
                  className={cn(
                    "flex h-16 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border p-1",
                    isSelected ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong"
                  )}
                >
                  {kind === "LOGO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={asset.label} className="h-8 w-8 object-contain" />
                  ) : (
                    <Icon className="h-5 w-5 text-muted" />
                  )}
                  <span className="w-full truncate px-1 text-center text-[10px] text-muted">{asset.label}</span>
                  {isSelected && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[#04120c]">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(asset.id)}
                  aria-label="Hapus"
                  className="absolute -top-1.5 -left-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-danger group-hover:flex"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <label
            className={cn(
              "flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted hover:border-border-strong hover:text-foreground",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            <Upload className="h-4 w-4" />
            <span className="text-[10px]">{uploading ? "Mengunggah..." : "Unggah"}</span>
            <input type="file" accept={config?.accept} onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}
      {config?.hint && <p className="text-[10px] text-muted">{config.hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

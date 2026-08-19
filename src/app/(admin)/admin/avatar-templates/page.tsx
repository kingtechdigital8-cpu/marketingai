"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Pencil, Trash2, Plus, Upload, Image as ImageIcon, CheckCircle2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ToggleChip } from "@/components/ui/ToggleChip";

interface AvatarTemplateRow {
  id: string;
  label: string;
  credit: string;
  gender: string;
  order: number;
  vrmUrl: string;
  thumbnailUrl: string;
  createdAt: string;
}

const emptyCreateForm = { label: "", credit: "", gender: "female" };

export default function AdminAvatarTemplatesPage() {
  const [templates, setTemplates] = useState<AvatarTemplateRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [vrmFile, setVrmFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const vrmInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<AvatarTemplateRow | null>(null);
  const [editForm, setEditForm] = useState({ label: "", credit: "", gender: "female" });
  const [deleteTarget, setDeleteTarget] = useState<AvatarTemplateRow | null>(null);

  function loadTemplates() {
    fetch("/api/admin/avatar-templates")
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []));
  }

  useEffect(loadTemplates, []);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setVrmFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setCreateError(null);
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(null);
  }

  function handlePickThumbnail(file: File) {
    setThumbnailFile(file);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(URL.createObjectURL(file));
  }

  async function handleCreate() {
    if (!createForm.label.trim() || !createForm.credit.trim() || !vrmFile || !thumbnailFile) {
      setCreateError("Nama, kredit, file avatar, dan thumbnail wajib diisi.");
      return;
    }
    setIsSaving(true);
    setCreateError(null);
    const form = new FormData();
    form.set("label", createForm.label.trim());
    form.set("credit", createForm.credit.trim());
    form.set("gender", createForm.gender);
    form.set("vrm", vrmFile);
    form.set("thumbnail", thumbnailFile);

    const res = await fetch("/api/admin/avatar-templates", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    setIsSaving(false);
    if (!res.ok) {
      setCreateError(data?.error ?? "Gagal mengunggah avatar template.");
      return;
    }
    closeCreate();
    loadTemplates();
    setUploadNotice(
      data?.autoConverted
        ? "Avatar berhasil diunggah — file bukan VRM tadi otomatis dikonversi dari rig Mixamo."
        : "Avatar berhasil diunggah."
    );
  }

  function openEdit(template: AvatarTemplateRow) {
    setEditing(template);
    setEditForm({ label: template.label, credit: template.credit, gender: template.gender });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setIsSaving(true);
    await fetch(`/api/admin/avatar-templates/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setIsSaving(false);
    setEditing(null);
    loadTemplates();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/admin/avatar-templates/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    loadTemplates();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Avatar Template Live TikTok</h1>
          <p className="text-sm text-muted">
            Kelola galeri avatar VRM 3D yang bisa dipilih semua pengguna untuk fitur Host Virtual.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Avatar
        </Button>
      </div>

      {uploadNotice && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-brand/20 bg-brand-soft px-3 py-2 text-sm text-brand">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{uploadNotice}</span>
          </div>
          <button onClick={() => setUploadNotice(null)} aria-label="Tutup" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            Galeri Avatar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!templates ? (
            <p className="text-sm text-muted">Memuat...</p>
          ) : templates.length === 0 ? (
            <EmptyState icon={Sparkles} title="Belum ada avatar template" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {templates.map((template) => (
                <div key={template.id} className="flex flex-col overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- R2-hosted external image, not a static local asset */}
                  <img src={template.thumbnailUrl} alt={template.label} className="aspect-square w-full object-cover" />
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-foreground" title={template.label}>
                        {template.label}
                      </p>
                      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {template.gender === "male" ? "Pria" : "Wanita"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted" title={template.credit}>
                      {template.credit}
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(template)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <button
                        onClick={() => setDeleteTarget(template)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                        aria-label="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={creating}
        onClose={closeCreate}
        title="Tambah Avatar Template"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeCreate}>
              Batal
            </Button>
            <Button onClick={handleCreate} isLoading={isSaving}>
              Unggah
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nama Avatar"
            value={createForm.label}
            onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
            placeholder="mis. Avatar Casual 01"
          />
          <Input
            label="Kredit / Lisensi"
            value={createForm.credit}
            onChange={(e) => setCreateForm({ ...createForm, credit: e.target.value })}
            placeholder="mis. Nama pembuat — lisensi penggunaan komersial & redistribusi"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Jenis Kelamin</label>
            <div className="flex gap-2">
              <ToggleChip
                label="Wanita"
                active={createForm.gender === "female"}
                onClick={() => setCreateForm({ ...createForm, gender: "female" })}
              />
              <ToggleChip
                label="Pria"
                active={createForm.gender === "male"}
                onClick={() => setCreateForm({ ...createForm, gender: "male" })}
              />
            </div>
            <p className="text-xs text-muted">Menentukan animasi idle (Mixamo) yang dipakai avatar ini saat live.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">File Avatar</label>
              <input
                ref={vrmInputRef}
                type="file"
                accept=".vrm,.glb"
                className="hidden"
                onChange={(e) => setVrmFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => vrmInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                {vrmFile ? "Ganti File" : "Pilih File .vrm/.glb"}
              </Button>
              {vrmFile && <p className="truncate text-xs text-muted">{vrmFile.name}</p>}
              <p className="text-xs text-muted">
                Format .vrm atau .glb, maks 50MB. File .glb hasil rig Mixamo (belum VRM) otomatis dikonversi —
                rig lain di luar Mixamo perlu dikonversi manual dulu lewat Blender + VRM Add-on.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Thumbnail</label>
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePickThumbnail(file);
                }}
              />
              <div className="flex items-center gap-2">
                {thumbnailPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an R2 asset
                  <img src={thumbnailPreview} alt="Preview thumbnail" className="h-10 w-10 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-muted">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => thumbnailInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Pilih Gambar
                </Button>
              </div>
              <p className="text-xs text-muted">PNG/JPG/WEBP, maks 5MB.</p>
            </div>
          </div>

          {createError && <p className="text-sm text-danger">{createError}</p>}
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit Avatar Template"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button onClick={handleSaveEdit} isLoading={isSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nama Avatar"
            value={editForm.label}
            onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
          />
          <Input
            label="Kredit / Lisensi"
            value={editForm.credit}
            onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Jenis Kelamin</label>
            <div className="flex gap-2">
              <ToggleChip
                label="Wanita"
                active={editForm.gender === "female"}
                onClick={() => setEditForm({ ...editForm, gender: "female" })}
              />
              <ToggleChip
                label="Pria"
                active={editForm.gender === "male"}
                onClick={() => setEditForm({ ...editForm, gender: "male" })}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Untuk mengganti file avatar atau thumbnail, hapus avatar ini lalu unggah ulang sebagai avatar baru.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Avatar Template"
        description={`Avatar "${deleteTarget?.label}" akan dihapus permanen. Pengguna yang sudah memilih avatar ini sebelumnya akan mengalami avatar-nya gagal dimuat, karena filenya sudah tidak ada lagi.`}
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
}

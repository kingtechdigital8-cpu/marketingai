"use client";

import { useEffect, useState } from "react";
import { Bot, Pencil, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface AiProvider {
  id: string;
  name: string;
  slug: string;
  category: string;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  enabled: boolean;
}

type ProviderForm = {
  name: string;
  slug: string;
  category: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
};

const emptyForm: ProviderForm = {
  name: "",
  slug: "",
  category: "text",
  model: "",
  baseUrl: "",
  apiKey: "",
  enabled: false,
};

export default function AdminAiProvidersPage() {
  const [providers, setProviders] = useState<AiProvider[] | null>(null);
  const [editing, setEditing] = useState<AiProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AiProvider | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function loadProviders() {
    fetch("/api/admin/ai-providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers));
  }

  useEffect(loadProviders, []);

  function openEdit(provider: AiProvider) {
    setEditing(provider);
    setForm({
      name: provider.name,
      slug: provider.slug,
      category: provider.category,
      model: provider.model ?? "",
      baseUrl: provider.baseUrl ?? "",
      apiKey: provider.apiKey ?? "",
      enabled: provider.enabled,
    });
  }

  function openCreate() {
    setForm(emptyForm);
    setCreating(true);
  }

  async function handleSave() {
    setIsSaving(true);
    if (editing) {
      await fetch(`/api/admin/ai-providers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/admin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setIsSaving(false);
    setEditing(null);
    setCreating(false);
    loadProviders();
  }

  async function handleToggle(provider: AiProvider) {
    await fetch(`/api/admin/ai-providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !provider.enabled }),
    });
    loadProviders();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/admin/ai-providers/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    loadProviders();
  }

  const modalOpen = creating || editing !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Provider AI</h1>
          <p className="text-sm text-muted">Kelola integrasi provider dan model AI yang aktif.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Provider
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand" />
            Daftar Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!providers ? (
            <p className="p-5 text-sm text-muted">Memuat...</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Nama</th>
                  <th className="px-5 py-3 font-medium">Kategori</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{provider.name}</td>
                    <td className="px-5 py-3 text-muted capitalize">{provider.category}</td>
                    <td className="px-5 py-3 text-muted">{provider.model || "-"}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => handleToggle(provider)}>
                        <Badge variant={provider.enabled ? "success" : "neutral"}>
                          {provider.enabled ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(provider)}
                          className="rounded-md p-1.5 text-muted hover:bg-white/[.06] hover:text-foreground"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(provider)}
                          className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                          aria-label="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? "Edit Provider" : "Tambah Provider"}
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Batal
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nama"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Slug"
            value={form.slug}
            disabled={!!editing}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="mis. openai-text"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Kategori</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="text">Teks / SEO</option>
              <option value="image">Gambar</option>
              <option value="video">Video</option>
              <option value="search">Data Kompetitor (SERP)</option>
            </select>
          </div>
          <Input
            label="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="mis. gpt-4o-mini"
          />
          <Input
            label="Base URL (opsional)"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
          <Input
            label="API Key"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Aktifkan provider ini
        </label>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Provider"
        description={`Provider "${deleteTarget?.name}" akan dihapus permanen dari sistem.`}
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Settings, Check, Wallet, Radio, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface SiteSettings {
  "site.title": string;
  "site.description": string;
  "site.contactEmail": string;
  "site.maintenanceMode": string;
  "tokopay.merchant_id": string;
  "tokopay.secret_key": string;
  "tokopay.enabled": string;
  "tiktok.euler_api_key": string;
  "tiktok.tiktool_api_key": string;
  "tiktok.sign_provider": string;
  "tiktok.enabled": string;
  "tiktok.tts_provider": string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) =>
        setSettings({
          "site.title": "",
          "site.description": "",
          "site.contactEmail": "",
          "site.maintenanceMode": "false",
          "tokopay.merchant_id": "",
          "tokopay.secret_key": "",
          "tokopay.enabled": "false",
          "tiktok.euler_api_key": "",
          "tiktok.tiktool_api_key": "",
          "tiktok.sign_provider": "EULERSTREAM",
          "tiktok.enabled": "false",
          "tiktok.tts_provider": "elevenlabs",
          ...data.settings,
        })
      );
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSaved(false);

    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">Memuat pengaturan...</CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand" />
            Pengaturan Sistem
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input
              label="Judul Situs"
              value={settings["site.title"]}
              onChange={(e) => setSettings({ ...settings, "site.title": e.target.value })}
            />
            <Textarea
              label="Deskripsi Situs"
              value={settings["site.description"]}
              onChange={(e) => setSettings({ ...settings, "site.description": e.target.value })}
              rows={3}
            />
            <Input
              label="Email Kontak"
              type="email"
              value={settings["site.contactEmail"]}
              onChange={(e) => setSettings({ ...settings, "site.contactEmail": e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={settings["site.maintenanceMode"] === "true"}
                onChange={(e) =>
                  setSettings({ ...settings, "site.maintenanceMode": String(e.target.checked) })
                }
              />
              Mode Maintenance (nonaktifkan akses pengguna sementara)
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-brand" />
            Payment Gateway (Tokopay)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input
              label="Merchant ID"
              value={settings["tokopay.merchant_id"]}
              onChange={(e) => setSettings({ ...settings, "tokopay.merchant_id": e.target.value })}
              placeholder="Dari dashboard Tokopay Anda"
            />
            <Input
              label="Secret Key"
              type="password"
              value={settings["tokopay.secret_key"]}
              onChange={(e) => setSettings({ ...settings, "tokopay.secret_key": e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={settings["tokopay.enabled"] === "true"}
                onChange={(e) => setSettings({ ...settings, "tokopay.enabled": String(e.target.checked) })}
              />
              Aktifkan Tokopay
            </label>
            <p className="text-xs text-muted">
              URL callback/webhook untuk didaftarkan di dashboard Tokopay:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">
                {typeof window !== "undefined" ? window.location.origin : ""}/api/topup/callback
              </code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-brand" />
            Live TikTok (AI Comment Reader)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Fitur ini membaca (dan bila diaktifkan pengguna, mengirim balasan ke) live chat TikTok lewat cara
                tidak resmi (reverse-engineered), bukan API resmi TikTok. Bisa berhenti bekerja sewaktu-waktu jika
                TikTok mengubah sistemnya, dan berpotensi melanggar Ketentuan Layanan TikTok.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Sign Provider</label>
              <select
                value={settings["tiktok.sign_provider"]}
                onChange={(e) => setSettings({ ...settings, "tiktok.sign_provider": e.target.value })}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              >
                <option value="EULERSTREAM">Euler Stream</option>
                <option value="TIKTOOL">TikTool</option>
              </select>
              <p className="text-xs text-muted">
                Provider yang menandatangani koneksi ke live TikTok. Isi API key kedua provider di bawah supaya bisa
                langsung dipindah kalau salah satunya bermasalah — cukup ganti pilihan ini, tanpa perlu isi ulang key.
                Catatan: kirim otomatis balasan ke live chat hanya didukung oleh Euler Stream, bukan TikTool.
              </p>
            </div>
            <Input
              label="Euler Stream API Key"
              type="password"
              value={settings["tiktok.euler_api_key"]}
              onChange={(e) => setSettings({ ...settings, "tiktok.euler_api_key": e.target.value })}
              placeholder="Dari eulerstream.com"
            />
            <Input
              label="TikTool API Key"
              type="password"
              value={settings["tiktok.tiktool_api_key"]}
              onChange={(e) => setSettings({ ...settings, "tiktok.tiktool_api_key": e.target.value })}
              placeholder="Dari tik.tools"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={settings["tiktok.enabled"] === "true"}
                onChange={(e) => setSettings({ ...settings, "tiktok.enabled": String(e.target.checked) })}
              />
              Aktifkan fitur Live TikTok untuk semua pengguna
            </label>
            <div className="flex flex-col gap-1.5 border-t border-border pt-4">
              <label className="text-sm font-medium text-foreground">Provider Suara (TTS)</label>
              <select
                value={settings["tiktok.tts_provider"]}
                onChange={(e) => setSettings({ ...settings, "tiktok.tts_provider": e.target.value })}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="google-tts">Google Cloud (Chirp3 HD)</option>
              </select>
              <p className="text-xs text-muted">
                Berlaku untuk semua pengguna sekaligus — bukan pilihan per pengguna. Google Cloud Chirp3 HD jauh
                lebih murah per karakter (cocok untuk volume balasan tinggi), tapi timing bibir (lip-sync) sedikit
                lebih kasar (per kata, bukan per huruf) dibanding ElevenLabs. Pastikan provider yang dipilih sudah
                dikonfigurasi &amp; diaktifkan di Provider AI sebelum mengganti ini.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={isSaving}>
          Simpan Perubahan
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" />
            Tersimpan
          </span>
        )}
      </div>
    </form>
  );
}

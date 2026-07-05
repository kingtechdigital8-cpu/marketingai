"use client";

import { useEffect, useState } from "react";
import { Settings, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface SiteSettings {
  "site.title": string;
  "site.description": string;
  "site.contactEmail": string;
  "site.maintenanceMode": string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => setSettings(data.settings));
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
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-brand" />
          Pengaturan Sistem
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="mt-2 flex items-center gap-3">
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
      </CardContent>
    </Card>
  );
}

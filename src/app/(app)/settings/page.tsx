"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Settings, User, ShieldCheck, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SettingsPage() {
  const { data: session, update } = useSession();

  const [name, setName] = useState("");
  // Syncs once the session finishes loading (and again if it's updated
  // elsewhere) — the state can't just be initialized from session.user.name
  // since useSession() returns undefined on the first render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setProfileError(data?.error ?? "Gagal menyimpan profil.");
      setProfileSaving(false);
      return;
    }

    await update({ name: data.name });
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setPasswordSaving(true);
    const res = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setPasswordError(data?.error ?? "Gagal mengubah kata sandi.");
      setPasswordSaving(false);
      return;
    }

    setPasswordSaving(false);
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSaved(false), 2500);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pengaturan Akun" description="Kelola profil dan keamanan akun Anda." icon={Settings} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-brand" />
              Profil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
              <Input
                id="profile-name"
                label="Nama"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
              <Input id="profile-email" label="Email" value={session?.user.email ?? ""} disabled />
              {profileError && <ErrorNotice message={profileError} />}
              <div className="flex items-center gap-3">
                <Button type="submit" isLoading={profileSaving} disabled={!name.trim()}>
                  Simpan Profil
                </Button>
                {profileSaved && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <Check className="h-4 w-4" />
                    Tersimpan
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand" />
              Ubah Kata Sandi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
              <Input
                id="current-password"
                label="Kata Sandi Saat Ini"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Input
                id="new-password"
                label="Kata Sandi Baru"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <Input
                id="confirm-password"
                label="Konfirmasi Kata Sandi Baru"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {passwordError && <ErrorNotice message={passwordError} />}
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  isLoading={passwordSaving}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                >
                  Ubah Kata Sandi
                </Button>
                {passwordSaved && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <Check className="h-4 w-4" />
                    Kata sandi diperbarui
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

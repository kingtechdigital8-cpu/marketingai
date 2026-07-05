"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Gagal mendaftar. Coba lagi.");
      setIsLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    if (!result || result.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <Card className="border-border-strong shadow-[0_0_60px_rgba(16,185,129,0.08)]">
        <CardContent>
          <h1 className="text-lg font-semibold text-foreground">Buat Akun Baru</h1>
          <p className="mt-1 text-sm text-muted">Dapatkan 20 kredit gratis untuk mencoba semua fitur AI.</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Input id="name" name="name" label="Nama" placeholder="Nama Anda" required />
            <Input
              id="email"
              name="email"
              type="email"
              label="Email"
              placeholder="nama@perusahaan.com"
              required
            />
            <Input
              id="password"
              name="password"
              type="password"
              label="Kata Sandi"
              placeholder="Minimal 8 karakter"
              minLength={8}
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Daftar
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Masuk di sini
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

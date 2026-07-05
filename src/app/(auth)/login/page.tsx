"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { Suspense, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await signIn("credentials", { email, password, redirect: false });

    if (!result || result.error) {
      setError("Email atau kata sandi salah.");
      setIsLoading(false);
      return;
    }

    const session = await getSession();
    const callbackUrl = searchParams.get("callbackUrl");
    const destination = callbackUrl ?? (session?.user.role === "ADMIN" ? "/admin" : "/dashboard");
    router.push(destination);
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
          <h1 className="text-lg font-semibold text-foreground">Masuk ke Akun Anda</h1>
          <p className="mt-1 text-sm text-muted">Kelola kebutuhan marketing Anda dengan AI.</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
              placeholder="••••••••"
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-border" />
                Ingat saya
              </label>
              <a href="#" className="font-medium text-brand hover:underline">
                Lupa kata sandi?
              </a>
            </div>
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Masuk
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Belum punya akun?{" "}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Daftar sekarang
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

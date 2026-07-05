"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Users,
  Receipt,
  Coins,
  FileText,
  Bot,
  Settings,
  Ban,
  LayoutDashboard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";

const stats = [
  { label: "Total Pengguna", value: "1.284" },
  { label: "Pendapatan Bulan Ini", value: "Rp 42.500.000" },
  { label: "Transaksi Pending", value: "6" },
  { label: "Job AI Aktif", value: "23" },
];

const managementLinks = [
  { label: "Pengguna", description: "Kelola akun, role, dan status pengguna.", href: "/admin/users", icon: Users },
  { label: "Transaksi", description: "Pantau seluruh transaksi top-up kredit.", href: "/admin/transactions", icon: Receipt },
  { label: "Harga Kredit", description: "Atur biaya kredit tiap fitur AI.", href: "/admin/credit-pricing", icon: Coins },
  { label: "Log Pembayaran", description: "Lihat log webhook Tokopay mentah.", href: "/admin/payment-logs", icon: FileText },
  { label: "Provider AI", description: "Kelola provider & model AI aktif.", href: "/admin/ai-providers", icon: Bot },
  { label: "Pengaturan Sistem", description: "Konfigurasi umum platform.", href: "/admin/settings", icon: Settings },
];

const recentUsers = [
  { id: 1, name: "Budi Santoso", email: "budi@toko.com", credit: 250, status: "Aktif" },
  { id: 2, name: "Siti Aminah", email: "siti@usaha.co.id", credit: 40, status: "Aktif" },
  { id: 3, name: "Andi Wijaya", email: "andi@brand.id", credit: 0, status: "Suspend" },
];

const statusVariant: Record<string, "success" | "danger"> = {
  Aktif: "success",
  Suspend: "danger",
};

export default function AdminOverviewPage() {
  const [suspendTarget, setSuspendTarget] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel Kontrol Admin"
        description="Kelola seluruh sistem MarketingAI dari satu tempat."
        icon={LayoutDashboard}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent>
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-foreground">Manajemen Sistem</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {managementLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full transition-colors hover:border-brand">
                <CardContent className="flex flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <link.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{link.label}</p>
                    <p className="mt-0.5 text-xs text-muted">{link.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pengguna Terbaru</CardTitle>
          <Link href="/admin/users" className="text-sm font-medium text-brand hover:underline">
            Lihat Semua
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Kredit</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium text-foreground">{user.name}</td>
                  <td className="px-5 py-3 text-muted">{user.email}</td>
                  <td className="px-5 py-3 text-muted">{user.credit}</td>
                  <td className="px-5 py-3">
                    <Badge variant={statusVariant[user.status]}>{user.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {user.status === "Aktif" && (
                      <button
                        onClick={() => setSuspendTarget(user.id)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                        aria-label="Suspend pengguna"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        onConfirm={() => setSuspendTarget(null)}
        title="Suspend Pengguna"
        description="Pengguna yang di-suspend tidak akan bisa mengakses fitur AI hingga diaktifkan kembali. Lanjutkan?"
        confirmLabel="Suspend"
        variant="danger"
      />
    </div>
  );
}

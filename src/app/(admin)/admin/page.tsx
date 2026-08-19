"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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

const managementLinks = [
  { label: "Pengguna", description: "Kelola akun, role, dan status pengguna.", href: "/admin/users", icon: Users },
  { label: "Transaksi", description: "Pantau seluruh transaksi top-up kredit.", href: "/admin/transactions", icon: Receipt },
  { label: "Harga Kredit", description: "Atur biaya kredit tiap fitur AI.", href: "/admin/credit-pricing", icon: Coins },
  { label: "Log Pembayaran", description: "Lihat log webhook Tokopay mentah.", href: "/admin/payment-logs", icon: FileText },
  { label: "Provider AI", description: "Kelola provider & model AI aktif.", href: "/admin/ai-providers", icon: Bot },
  { label: "Pengaturan Sistem", description: "Konfigurasi umum platform.", href: "/admin/settings", icon: Settings },
];

interface RecentUser {
  id: string;
  name: string;
  email: string;
  creditBalance: number;
  status: "ACTIVE" | "SUSPENDED";
}

interface DashboardData {
  totalUsers: number;
  revenueThisMonthIdr: number;
  pendingTransactions: number;
  activeJobs: number;
  recentUsers: RecentUser[];
}

const idNumber = new Intl.NumberFormat("id-ID");
const idCurrency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function AdminOverviewPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<RecentUser | null>(null);
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        setData(await res.json());
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  const stats = data
    ? [
        { label: "Total Pengguna", value: idNumber.format(data.totalUsers) },
        { label: "Pendapatan Bulan Ini", value: idCurrency.format(data.revenueThisMonthIdr) },
        { label: "Transaksi Pending", value: idNumber.format(data.pendingTransactions) },
        { label: "Job AI Aktif", value: idNumber.format(data.activeJobs) },
      ]
    : [];

  async function confirmSuspend() {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      const res = await fetch(`/api/admin/users/${suspendTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED" }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          recentUsers: data.recentUsers.map((u) =>
            u.id === suspendTarget.id ? { ...u, status: "SUSPENDED" } : u
          ),
        });
      }
    } finally {
      setSuspending(false);
      setSuspendTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel Kontrol Admin"
        description="Kelola seluruh sistem MarketingAI dari satu tempat."
        icon={LayoutDashboard}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!data ? (
          <p className="col-span-full text-sm text-muted">{loadError ? "Gagal memuat statistik." : "Memuat..."}</p>
        ) : (
          stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent>
                <p className="text-sm text-muted">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
              </CardContent>
            </Card>
          ))
        )}
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
          {!data ? (
            <p className="p-5 text-sm text-muted">{loadError ? "Gagal memuat pengguna." : "Memuat..."}</p>
          ) : data.recentUsers.length === 0 ? (
            <p className="p-5 text-sm text-muted">Belum ada pengguna terdaftar.</p>
          ) : (
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
                {data.recentUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{user.name}</td>
                    <td className="px-5 py-3 text-muted">{user.email}</td>
                    <td className="px-5 py-3 text-muted">{idNumber.format(user.creditBalance)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>
                        {user.status === "ACTIVE" ? "Aktif" : "Suspend"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {user.status === "ACTIVE" && user.id !== session?.user?.id && (
                        <button
                          onClick={() => setSuspendTarget(user)}
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
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        onConfirm={confirmSuspend}
        isLoading={suspending}
        title="Suspend Pengguna"
        description={`Pengguna "${suspendTarget?.name}" tidak akan bisa mengakses fitur AI hingga diaktifkan kembali. Lanjutkan?`}
        confirmLabel="Suspend"
        variant="danger"
      />
    </div>
  );
}

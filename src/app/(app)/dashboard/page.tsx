"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Search,
  Image as ImageIcon,
  Video,
  Shapes,
  Camera,
  Coins,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";

const quickActions = [
  { label: "Buat Konten SEO", href: "/seo", icon: Search },
  { label: "Gambar", href: "/ads/image", icon: ImageIcon },
  { label: "Video", href: "/ads/video", icon: Video },
  { label: "Buat Logo", href: "/logo", icon: Shapes },
  { label: "Foto Produk", href: "/product-photo", icon: Camera },
];

const recentActivity = [
  { id: 1, name: "Banner Promo Ramadan.png", type: "Gambar", status: "Selesai", credit: 1 },
  { id: 2, name: "Video Iklan Produk A.mp4", type: "Iklan Video", status: "Diproses", credit: 16 },
  { id: 3, name: "Artikel SEO - Kopi Nusantara", type: "SEO", status: "Selesai", credit: 1 },
  { id: 4, name: "Logo Toko Baru.png", type: "Logo", status: "Selesai", credit: 1 },
];

const statusVariant: Record<string, "success" | "warning"> = {
  Selesai: "success",
  Diproses: "warning",
};

export default function DashboardOverviewPage() {
  const { data: session } = useSession();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Selamat datang kembali, ${session?.user.name ?? "Pengguna"}`}
        description="Berikut ringkasan aktivitas marketing Anda."
        actions={
          <Link href="/credits" className={buttonVariants()}>
            <Coins className="h-4 w-4" />
            Beli Kredit
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Sisa Kredit</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{session?.user.creditBalance ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Aset Dibuat Bulan Ini</p>
            <p className="mt-1 text-2xl font-bold text-foreground">18</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Job Sedang Diproses</p>
            <p className="mt-1 text-2xl font-bold text-foreground">1</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center text-xs font-medium text-foreground transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <action.icon className="h-5 w-5 text-brand" />
              {action.label}
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktivitas Terbaru</CardTitle>
          <Link href="/assets" className="text-sm font-medium text-brand hover:underline">
            Lihat Semua
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Nama Aset</th>
                <th className="px-5 py-3 font-medium">Tipe</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Kredit</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-5 py-3 text-muted">{item.type}</td>
                  <td className="px-5 py-3">
                    <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{item.credit}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(item.id)}
                      className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => setDeleteTarget(null)}
        title="Hapus Aset"
        description="Aset yang dihapus tidak dapat dikembalikan. Apakah Anda yakin?"
        confirmLabel="Hapus"
        variant="danger"
      />
    </div>
  );
}

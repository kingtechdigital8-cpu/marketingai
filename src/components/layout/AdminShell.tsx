"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Coins,
  FileText,
  Bot,
  Settings,
} from "lucide-react";
import { Sidebar, type SidebarNavItem } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UserMenu, type UserMenuItem } from "./UserMenu";
import { PageTransition } from "./PageTransition";

const navItems: SidebarNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Pengguna", href: "/admin/users", icon: Users },
  { label: "Transaksi", href: "/admin/transactions", icon: Receipt },
  { label: "Harga Kredit", href: "/admin/credit-pricing", icon: Coins },
  { label: "Log Pembayaran", href: "/admin/payment-logs", icon: FileText },
  { label: "Provider AI", href: "/admin/ai-providers", icon: Bot },
  { label: "Pengaturan Sistem", href: "/admin/settings", icon: Settings },
];

const userMenuItems: UserMenuItem[] = [
  { label: "Pengaturan Sistem", href: "/admin/settings", icon: Settings },
  { label: "Dashboard Saya", href: "/dashboard", icon: LayoutDashboard },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        brandLabel="MarketingAI"
        brandBadge="Admin"
        items={navItems}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          right={
            <>
              <UserMenu name={session?.user.name ?? "Admin"} role="Super Admin" items={userMenuItems} />
            </>
          }
        />
        <main className="flex-1 bg-background p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}

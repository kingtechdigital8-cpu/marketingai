"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Search,
  Image as ImageIcon,
  Video,
  Shapes,
  Camera,
  FolderOpen,
  Coins,
  Settings,
} from "lucide-react";
import { Sidebar, type SidebarNavItem } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UserMenu, type UserMenuItem } from "./UserMenu";
import { PageTransition } from "./PageTransition";
import { CreditBadge } from "@/components/credits/CreditBadge";
import { useLiveCreditBalance } from "@/lib/use-credit-balance";

const userMenuItems: UserMenuItem[] = [
  { label: "Pengaturan", href: "/settings", icon: Settings },
  { label: "Kredit", href: "/credits", icon: Coins },
];

const navItems: SidebarNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "SEO", href: "/seo", icon: Search },
  { label: "Gambar", href: "/ads/image", icon: ImageIcon },
  { label: "Video", href: "/ads/video", icon: Video },
  { label: "Logo", href: "/logo", icon: Shapes },
  { label: "Foto Produk", href: "/product-photo", icon: Camera },
  { label: "Aset Saya", href: "/assets", icon: FolderOpen },
  { label: "Kredit", href: "/credits", icon: Coins },
  { label: "Pengaturan", href: "/settings", icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const creditBalance = useLiveCreditBalance();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        brandLabel="MarketingAI"
        items={navItems}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          right={
            <>
              <CreditBadge balance={creditBalance} />
              <UserMenu
                name={session?.user.name ?? "Pengguna"}
                role={session?.user.email ?? undefined}
                items={userMenuItems}
              />
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

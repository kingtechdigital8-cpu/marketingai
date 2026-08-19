"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Search,
  Image as ImageIcon,
  Video,
  Radio,
  Scissors,
  FolderOpen,
  Coins,
  Settings,
} from "lucide-react";
import { Sidebar, type SidebarNavGroup, type SidebarNavItem } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UserMenu, type UserMenuItem } from "./UserMenu";
import { PageTransition } from "./PageTransition";
import { useLiveCreditBalance } from "@/lib/use-credit-balance";

const userMenuItems: UserMenuItem[] = [
  { label: "Pengaturan", href: "/settings", icon: Settings },
  { label: "Kredit", href: "/credits", icon: Coins },
];

const navGroups: SidebarNavGroup[] = [
  {
    label: "Workspace",
    items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Create",
    items: [
      { label: "Image", href: "/ads/image", icon: ImageIcon },
      { label: "Video", href: "/ads/video", icon: Video },
      { label: "SEO", href: "/seo", icon: Search },
      { label: "Live", href: "/live-tiktok", icon: Radio },
      { label: "Auto Clip", href: "/auto-clip", icon: Scissors },
    ],
  },
  {
    label: "Library",
    items: [{ label: "Assets", href: "/assets", icon: FolderOpen }],
  },
];

const utilityItems: SidebarNavItem[] = [{ label: "Settings", href: "/settings", icon: Settings }];

export function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const { balance: creditBalance, totalPurchasedCredits } = useLiveCreditBalance();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        groups={navGroups}
        utilityItems={utilityItems}
        creditBalance={creditBalance}
        totalPurchasedCredits={totalPurchasedCredits}
        user={session?.user ? { name: session.user.name ?? "Pengguna", email: session.user.email ?? undefined } : undefined}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          right={
            <UserMenu
              name={session?.user.name ?? "Pengguna"}
              role={session?.user.email ?? undefined}
              items={userMenuItems}
            />
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

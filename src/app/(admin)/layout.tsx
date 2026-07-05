import { ReactNode } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

export default function AdminRouteLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

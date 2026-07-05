import { Users } from "lucide-react";
import { ComingSoon } from "@/components/misc/ComingSoon";

export default function AdminUsersPage() {
  return (
    <ComingSoon
      icon={Users}
      title="Manajemen Pengguna"
      description="Kelola akun, role, dan status seluruh pengguna akan segera hadir di sini."
    />
  );
}

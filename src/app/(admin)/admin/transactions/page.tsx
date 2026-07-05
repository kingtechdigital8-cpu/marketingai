import { Receipt } from "lucide-react";
import { ComingSoon } from "@/components/misc/ComingSoon";

export default function AdminTransactionsPage() {
  return (
    <ComingSoon
      icon={Receipt}
      title="Transaksi"
      description="Pemantauan seluruh transaksi top-up kredit via Tokopay akan segera hadir di sini."
    />
  );
}

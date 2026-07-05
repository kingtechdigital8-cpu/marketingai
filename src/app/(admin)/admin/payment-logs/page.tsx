import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/misc/ComingSoon";

export default function AdminPaymentLogsPage() {
  return (
    <ComingSoon
      icon={FileText}
      title="Log Pembayaran"
      description="Log webhook Tokopay mentah untuk keperluan audit dan debug akan segera hadir di sini."
    />
  );
}

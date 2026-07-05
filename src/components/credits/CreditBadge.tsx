import Link from "next/link";
import { Coins } from "lucide-react";

export function CreditBadge({ balance, href = "/credits" }: { balance: number; href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-full border border-border bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft/70"
    >
      <Coins className="h-4 w-4" />
      {balance.toLocaleString("id-ID")} kredit
    </Link>
  );
}

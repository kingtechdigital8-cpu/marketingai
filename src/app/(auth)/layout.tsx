import Link from "next/link";
import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="glow-orb animate-float-slow -top-24 left-1/2 h-96 w-96 -translate-x-1/2 opacity-50" />
      <Link href="/" className="relative mb-8 text-xl font-bold text-brand">
        MarketingAI
      </Link>
      <div className="relative w-full flex justify-center">{children}</div>
    </div>
  );
}

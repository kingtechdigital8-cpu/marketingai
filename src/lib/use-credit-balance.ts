"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export function useLiveCreditBalance() {
  const { data: session, update } = useSession();
  const pathname = usePathname();
  const userId = session?.user?.id;
  const currentBalance = session?.user.creditBalance;

  const updateRef = useRef(update);
  const balanceRef = useRef(currentBalance);

  useEffect(() => {
    updateRef.current = update;
    balanceRef.current = currentBalance;
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function sync() {
      const res = await fetch("/api/credits/balance");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled && data.creditBalance !== balanceRef.current) {
        await updateRef.current({ creditBalance: data.creditBalance });
      }
    }

    sync();

    function handleFocus() {
      sync();
    }
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [userId, pathname]);

  return currentBalance ?? 0;
}

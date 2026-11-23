"use client";

import { useEffect, useState } from "react";
import { holdTimeLeft } from "@/lib/booking-review";
import { cn } from "@/lib/utils";

/** Time left on a hold, updated each minute. Shown after load, because the server has no "now" to match. */
export function HoldTimer({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  if (now === null) return null;
  const left = holdTimeLeft(expiresAt, now);
  return <span className={cn("font-semibold", left === "Overdue" ? "text-danger" : "text-warning", className)}>{left}</span>;
}

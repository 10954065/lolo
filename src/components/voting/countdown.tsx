"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/datetime";

/**
 * Informational countdown only. The server decides — with the database clock — whether a
 * ballot is accepted; this display can never open or close voting.
 */
export function Countdown({ target, label }: { target: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const remaining = new Date(target).getTime() - now;
  if (remaining <= 0) return null;
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {label} <span className="font-semibold text-navy">{formatDuration(remaining)}</span>
    </p>
  );
}

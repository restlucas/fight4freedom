"use client";

import { useEffect, useState } from "react";

import { countdownParts, formatCountdown } from "@/lib/countdown";
import { cn } from "@/lib/utils";

interface RankingCountdownProps {
  /** ISO instant when the season closes. */
  endsAt: string;
  className?: string;
}

/**
 * One unit chip, value and suffix on a SINGLE line ("08h").
 *
 * They used to be stacked, which made each chip taller than the search input
 * beside them and drove the whole panel's height. Inline also reads better now
 * that "Encerra em" sits to the left instead of above: the little d/h/m/s
 * captions were doing the job the label already does.
 */
function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="bg-background flex items-center justify-center rounded-md border px-1.5 py-1 leading-none">
      <span className="font-mono text-sm font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-[10px] font-semibold">{label}</span>
    </span>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Live season countdown: ticks every second and always shows seconds, so the
 * strip visibly moves instead of looking like a static date. The full string
 * goes to screen readers once (aria-live off) rather than being re-announced on
 * every tick. Renders placeholders until mounted so server and client markup
 * always agree.
 */
export function RankingCountdown({ endsAt, className }: RankingCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(endsAt).getTime();
    const tick = () => setRemaining(target - Date.now());

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining !== null && remaining <= 0) {
    return (
      <span className={cn("font-heading text-sm font-semibold", className)} role="status">
        Encerrado
      </span>
    );
  }

  const parts = remaining === null ? null : countdownParts(remaining);

  return (
    <span
      className={cn("flex items-center gap-1", className)}
      // Screen readers get the whole duration once; the digits above would
      // otherwise be re-announced every second.
      aria-label={remaining === null ? undefined : `Encerra em ${formatCountdown(remaining)}`}
      role={remaining === null ? undefined : "timer"}
      aria-live="off"
      suppressHydrationWarning
    >
      <span aria-hidden className="flex items-center gap-1">
        {/* Days only once there is at least one — no "00d" filler. */}
        {parts === null || parts.days > 0 ? (
          <Unit value={parts ? String(parts.days) : "--"} label="d" />
        ) : null}
        <Unit value={parts ? pad(parts.hours) : "--"} label="h" />
        <Unit value={parts ? pad(parts.minutes) : "--"} label="m" />
        <Unit value={parts ? pad(parts.seconds) : "--"} label="s" />
      </span>
    </span>
  );
}

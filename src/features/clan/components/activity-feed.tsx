"use client";

// The home page's activity feed, which is the one part of the vitrine that has to
// change while somebody is looking at it.
//
// The server renders the first list so the section is never empty on arrival (and
// so it works with JavaScript disabled); this component takes over and polls. See
// /api/activity for why polling and not a pushed stream.
//
// Two behaviours worth naming, because both are the difference between "live" and
// "annoying":
//   - the poll pauses while the tab is hidden and fires once on return, so a page
//     left open overnight is not making requests all night;
//   - only rows that actually changed flash. An identical payload is a no-op, and
//     most polls are (30 s poll against a 20-minute cadence).

import { ChevronsUp, Swords } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNow } from "@/hooks/use-now";
import { rankBySlug } from "@/lib/ranks";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

import { ACTIVITY_FLASH_MS, ACTIVITY_POLL_MS, mergeActivity } from "../lib/activity";
import { formatDuration, formatPoints, memberInitials } from "../lib/format";
import type { ActivityEvent } from "../lib/queries";
import type { ActivityResponse } from "@/app/api/activity/route";

interface ActivityFeedProps {
  initialEvents: ActivityEvent[];
  /** Same cap the server used, so the merged list cannot outgrow it. */
  limit: number;
  className?: string;
}

export function ActivityFeed({ initialEvents, limit, className }: ActivityFeedProps) {
  const [events, setEvents] = useState(initialEvents);
  const [flashing, setFlashing] = useState<string[]>([]);
  /** Newest instant we hold. Sent as `since` so a quiet poll answers empty. */
  const cursor = useRef(initialEvents[0]?.updatedAt ?? null);
  const now = useNow();

  const poll = useCallback(async () => {
    try {
      const url = cursor.current
        ? `/api/activity?since=${encodeURIComponent(cursor.current)}`
        : "/api/activity";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as ActivityResponse;

      setEvents((current) => {
        const { events: merged, changed } = mergeActivity(current, payload.events, limit);
        if (changed.length > 0) setFlashing(changed);
        return merged;
      });
      // Advanced even when nothing merged: the server's cursor is the newest
      // instant it holds, and re-asking from an older one would replay rows.
      if (payload.cursor) cursor.current = payload.cursor;
    } catch {
      // A failed poll is not an error state worth showing. The list on screen is
      // still true, just not the newest; the next tick tries again.
    }
  }, [limit]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const timer = setInterval(tick, ACTIVITY_POLL_MS);
    // Fires on return to the tab, which is exactly when a stale list is most
    // likely and most visible.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

  useEffect(() => {
    if (flashing.length === 0) return;
    const timer = setTimeout(() => setFlashing([]), ACTIVITY_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashing]);

  if (events.length === 0) {
    return (
      <div
        className={cn(
          "bg-card/70 text-muted-foreground rounded-xl border p-6 text-sm backdrop-blur-md",
          className,
        )}
      >
        <p className="text-foreground font-medium">Nada por aqui nas últimas horas</p>
        <p className="mt-1">
          A coleta roda a cada 20 minutos e registra o que o clã fez. Assim que alguém entrar em
          partida, aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {events.map((event) => (
        <li key={event.id}>
          <ActivityRow event={event} now={now} flashing={flashing.includes(event.id)} />
        </li>
      ))}
    </ul>
  );
}

function ActivityRow({
  event,
  now,
  flashing,
}: {
  event: ActivityEvent;
  now: number | null;
  flashing: boolean;
}) {
  const promotion = event.kind === "promotion";
  const rank = event.rankSlug ? rankBySlug(event.rankSlug) : null;

  return (
    <Link
      href={`/membros/${event.memberId}`}
      className={cn(
        "group bg-card/80 hover:border-primary/60 hover:bg-card/95 focus-visible:ring-ring flex items-center gap-3 rounded-lg border px-3 py-2.5 shadow-lg shadow-black/20 backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:outline-none",
        // The flash is a border and a ring, never a background wash: the rows are
        // translucent over a photograph, and an alpha tint on top of that reads as
        // the row losing its surface (the same trap documented in ranking-row).
        flashing && "border-primary/70 ring-primary/40 ring-2",
      )}
    >
      <Avatar className="size-9 shrink-0 rounded-md">
        <AvatarImage src={event.avatarUrl ?? "/member-default.png"} alt="" />
        <AvatarFallback className="rounded-md text-xs">
          {memberInitials(event.nickname)}
        </AvatarFallback>
      </Avatar>

      {promotion && rank ? (
        <Image
          src={`/patentes/${rank.slug}.webp`}
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            promotion ? "bg-yellow-400/15 text-yellow-300" : "bg-primary/15 text-primary",
          )}
        >
          {promotion ? <ChevronsUp className="size-4" /> : <Swords className="size-4" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* Wraps to a second line instead of truncating. On a 390px screen the
            single line cut exactly the part that carries the news — "foi promovido
            a ..." and "jogou 2h35 e ..." — which is the whole sentence losing its
            object. Two lines is the cheapest fix that keeps the information. */}
        <p className="line-clamp-2 text-sm">
          <span className="font-heading font-semibold">{event.nickname}</span>{" "}
          {promotion ? (
            <>
              foi promovido a{" "}
              <span className="font-semibold text-yellow-300">{rank?.name ?? "nova patente"}</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              jogou {formatDuration(event.minutesPlayed)} e ganhou{" "}
              <span className="text-foreground font-mono font-medium tabular-nums">
                {formatPoints(event.points)}
              </span>{" "}
              pts
            </span>
          )}
        </p>
      </div>

      {/* Which instant each kind reports: a promotion happened once, so it reports
          when; a session is still being extended, so it reports the last reading.
          The two columns hold the same value for a promotion, which is exactly why
          picking the meaningful one costs nothing.

          Placeholder until the client clock ticks: `useNow` returns null on the
          server render, and printing a relative time before that is a hydration
          mismatch by construction. */}
      <span className="text-muted-foreground shrink-0 self-start font-mono text-[11px] tabular-nums">
        {now === null ? "—" : timeAgo(promotion ? event.occurredAt : event.updatedAt, now)}
      </span>
    </Link>
  );
}

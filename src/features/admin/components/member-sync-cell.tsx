"use client";

import { CircleSlash, Loader2, PauseCircle, PlayCircle, TriangleAlert } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

import { toggleMemberStatsAction } from "../lib/actions";
import { SYNC_LABEL } from "../lib/member-sync";
import type { MemberSync, MemberSyncState } from "../lib/queries";

/** Icon per state. The text and colours live in lib/member-sync.ts, shared with
 *  the filter so a relabel can never leave the two disagreeing. */
const SYNC_ICON: Record<MemberSyncState, typeof TriangleAlert | null> = {
  ok: null,
  waiting: Loader2,
  identity_pending: TriangleAlert,
  no_data: TriangleAlert,
  paused: PauseCircle,
  off: CircleSlash,
};

/** Placeholder that holds the line's height. Named because a bare non-breaking
 *  space in the JSX is invisible in a diff and gets "tidied" away. */
const NBSP = "\u00A0";

/**
 * "há 4 min", "há 2 h", "há 3 d" — enough precision to spot a stalled sync.
 *
 * `now` is passed in rather than read from the clock so the label can tick with
 * the shared timer (and so this stays a pure function to test).
 */
function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

interface MemberSyncCellProps {
  memberId: string;
  nickname: string;
  sync: MemberSync;
  onChanged: () => void;
}

export function MemberSyncCell({ memberId, nickname, sync, onChanged }: MemberSyncCellProps) {
  const [pending, startTransition] = useTransition();
  const now = useNow();
  const label = SYNC_LABEL[sync.state];
  const Icon = SYNC_ICON[sync.state];

  function toggle() {
    const next = !sync.paused;
    startTransition(async () => {
      const form = new FormData();
      form.set("memberId", memberId);
      form.set("paused", String(next));
      const result = await toggleMemberStatsAction(null, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? `Coleta pausada para ${nickname}.` : `Coleta retomada para ${nickname}.`,
      );
      onChanged();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* The button comes FIRST, in a slot reserved even when there is nothing to
          render. Badge widths vary by a lot — "Aguardando" against "ID não
          encontrado" — so a trailing button lands at a different x on every row.
          Leading it into a fixed slot gives the column one clean vertical line of
          controls, which is the same trick the Ações column already uses. */}
      <div className="flex w-7 shrink-0 justify-center">
        {sync.canPause ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggle}
            disabled={pending}
            title={sync.paused ? "Retomar a coleta deste membro" : "Pausar a coleta deste membro"}
            aria-label={
              sync.paused ? `Retomar a coleta de ${nickname}` : `Pausar a coleta de ${nickname}`
            }
          >
            {sync.paused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
          </Button>
        ) : null}
      </div>

      <div className="min-w-0">
        <Badge variant="outline" className={cn("gap-1", label.className)} title={label.title}>
          {Icon ? (
            <Icon className={cn("size-3 shrink-0", label.iconClassName)} aria-hidden />
          ) : null}
          {label.text}
        </Badge>
        {/* The timestamp is what turns a badge into a diagnosis: "Sincronizando"
            with a two-day-old check means the collector stopped reaching them.
            It ticks with the shared clock, so an admin who leaves the panel open
            is never reading a frozen "há 1 min". The non-breaking space holds
            the line's height for the one paint before the clock starts, which
            keeps ~100 rows from shifting on hydration. */}
        {sync.checkedAt ? (
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {now === null ? NBSP : timeAgo(sync.checkedAt, now)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { CircleSlash, Loader2, PauseCircle, PlayCircle, TriangleAlert } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

import { toggleMemberStatsAction } from "../lib/actions";
import { SYNC_LABEL, SYNC_RETRY_NOTICE } from "../lib/member-sync";
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

interface MemberSyncCellProps {
  memberId: string;
  nickname: string;
  sync: MemberSync;
  onChanged: () => void;
}

export function MemberSyncCell({ memberId, nickname, sync, onChanged }: MemberSyncCellProps) {
  const [pending, startTransition] = useTransition();
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

  const badge = (
    <Badge variant="outline" className={cn("gap-1", label.className)}>
      {Icon ? <Icon className={cn("size-3 shrink-0", label.iconClassName)} aria-hidden /> : null}
      {label.text}
    </Badge>
  );

  return (
    <div className="flex items-center gap-1.5">
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

      {/* States that need explaining get a hover card; a healthy one does not.
          The trigger is a real <button> because Radix opens on FOCUS as well as
          on pointer, which is how this reaches keyboard and touch. */}
      {label.title ? (
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring cursor-help rounded-full focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`${label.text}: o que significa`}
            >
              {badge}
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80 text-xs leading-relaxed">
            <p className="font-heading mb-1.5 text-sm font-bold">{label.text}</p>
            <p className="text-muted-foreground">{label.title}</p>
          </HoverCardContent>
        </HoverCard>
      ) : (
        badge
      )}

      {/* A healthy badge carrying a caveat: the member has stats, the last round
          just came back empty. Without this the row would claim a clean sync it
          did not have — and the old "Sem retorno" badge claimed a broken member
          it also was not. */}
      {sync.lastAttemptFailed ? (
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring rounded-full text-amber-400 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`${SYNC_RETRY_NOTICE.label} para ${nickname}`}
            >
              <TriangleAlert className="size-3.5" aria-hidden />
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80 text-xs leading-relaxed">
            <p className="font-heading mb-1.5 text-sm font-bold">{SYNC_RETRY_NOTICE.heading}</p>
            <p className="text-muted-foreground">{SYNC_RETRY_NOTICE.body}</p>
            <p className="text-muted-foreground mt-2 border-t pt-2">{SYNC_RETRY_NOTICE.action}</p>
          </HoverCardContent>
        </HoverCard>
      ) : null}
    </div>
  );
}

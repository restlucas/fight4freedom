"use client";

import { CircleSlash, Loader2, PauseCircle, PlayCircle, TriangleAlert } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { toggleMemberStatsAction } from "../lib/actions";
import type { MemberSync, MemberSyncState } from "../lib/queries";

/**
 * One state, one badge, one sentence explaining what to do about it.
 *
 * The wording is the point. "Stats pendentes" — the badge this replaces — told an
 * admin something was wrong but not what, so the same three questions came back
 * every time: is it broken, is it my fault, will it fix itself? Each label below
 * answers those, and the tooltip says who has to act.
 */
const SYNC_LABEL: Record<
  MemberSyncState,
  { text: string; title: string; className: string; icon: typeof TriangleAlert | null }
> = {
  ok: {
    text: "Sincronizando",
    title: "A coleta leu os stats deste membro na última tentativa.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: null,
  },
  waiting: {
    text: "Aguardando",
    title: "Na fila da coleta, ainda sem nenhuma tentativa registrada.",
    className: "text-muted-foreground",
    icon: Loader2,
  },
  identity_pending: {
    text: "ID não encontrado",
    title:
      "O id da plataforma não corresponde a nenhuma conta EA. Confira o id exato com o membro e corrija no cadastro — a coleta tenta de novo a cada ciclo até lá.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: TriangleAlert,
  },
  no_data: {
    text: "Sem retorno",
    // Deliberately does NOT say "wrong id". Measured on 2026-07-27: 15 members
    // carried this state while only 5 genuinely lack BF6 data — the other 10 were
    // transient 504s from the source. The collector cannot yet tell the two apart
    // (a failed batch and an empty profile both come back as "no player"), so
    // claiming a cause here would send an admin chasing ten phantom id problems.
    title:
      "A última tentativa não trouxe estatísticas. Pode ser instabilidade da fonte, que se resolve sozinha no próximo ciclo, ou o id ter casado com outra conta de mesmo nome. Só investigue se persistir por várias horas.",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    icon: TriangleAlert,
  },
  paused: {
    text: "Pausado",
    title: "Um admin tirou este membro da coleta. Ele continua visível no site.",
    className: "text-muted-foreground border-dashed",
    icon: PauseCircle,
  },
  off: {
    text: "Fora da coleta",
    title: "Membro inativo ou sem vínculo que o habilite. A coleta não olha para ele.",
    className: "text-muted-foreground",
    icon: CircleSlash,
  },
};

/** "há 4 min", "há 2 h", "há 3 d" — enough precision to spot a stalled sync. */
function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
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
  const label = SYNC_LABEL[sync.state];
  const Icon = label.icon;

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
      <div className="min-w-0">
        <Badge variant="outline" className={cn("gap-1", label.className)} title={label.title}>
          {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
          {label.text}
        </Badge>
        {/* The timestamp is what turns a badge into a diagnosis: "Sincronizando"
            with a two-day-old check means the collector stopped reaching them. */}
        {sync.checkedAt ? (
          <p className="text-muted-foreground mt-0.5 text-[11px]">{timeAgo(sync.checkedAt)}</p>
        ) : null}
      </div>

      {sync.canPause ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
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
  );
}

"use client";

import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleSlash,
  Gamepad2,
  MessageCircle,
  Phone,
  RotateCcw,
  Trash2,
  TriangleAlert,
  UserRoundSearch,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/features/clan/components/platform-icon";
import { PLATFORM_LABEL } from "@/features/clan/lib/format";
import { useNow } from "@/hooks/use-now";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

import {
  approveRecruitAction,
  deleteRecruitAction,
  rejectRecruitAction,
  reopenRecruitAction,
} from "../lib/recruit-actions";
import type { AdminRecruit } from "../lib/recruit-queries";
import type { ActionResult } from "@/lib/action-result";

const AGE_LABEL: Record<AdminRecruit["ageBracket"], string> = {
  age_12_17: "12 a 17 anos",
  age_17_25: "17 a 25 anos",
  age_25_30: "25 a 30 anos",
  age_30_40: "30 a 40 anos",
  age_40_plus: "40+ anos",
};

const STATUS_LABEL: Record<AdminRecruit["status"], { text: string; className: string }> = {
  pending: {
    text: "Aguardando",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  approved: {
    text: "Aprovada",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  rejected: { text: "Recusada", className: "text-muted-foreground" },
};

/** One labelled fact, so every card reads the same fields in the same places. */
function Fact({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-muted-foreground text-[10px] tracking-widest uppercase">{label}</p>
        <p className={cn("truncate text-sm font-medium", className)} title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * The candidature queue, as CARDS rather than a table.
 *
 * Every field matters here and none of them is comparable across rows: an admin does not
 * scan for the highest WhatsApp, they read one application and decide. A table would put
 * eight columns of unrelated strings side by side and truncate the two that carry the
 * decision. Cards show everything at once, which is what the clan owner asked for
 * ("exibir logo de cara informações pertinentes").
 *
 * The two things surfaced hardest are the two that change the answer:
 *
 *   - the EA display name, because it is the field the whole feature exists to collect;
 *   - the DUPLICATE warning, because the same person applying twice — or applying after an
 *     admin already added them — is the common case, and approving it a second time
 *     creates two rows the collector will bind to one EA account.
 */
/**
 * The tabs, in the order an admin works them.
 *
 * `pending` is the default because it is the only one that is WORK: the other two are
 * history, and opening the page on a list of decisions already made buries the ones still
 * waiting. Same reasoning as the queue's own sort order.
 */
const FILTERS = [
  { value: "pending", label: "Em aberto" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Recusadas" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export function RecruitsList({ recruits }: { recruits: AdminRecruit[] }) {
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");

  const counts = {
    pending: recruits.filter((r) => r.status === "pending").length,
    approved: recruits.filter((r) => r.status === "approved").length,
    rejected: recruits.filter((r) => r.status === "rejected").length,
  };
  const visible = recruits.filter((recruit) => recruit.status === filter);

  /**
   * Runs one of the four verbs against one candidature.
   *
   * Shared because the four differ only in which action they call and what the toast
   * says. Four copies of "build the FormData, await, branch on ok, refresh" is four
   * places for the error handling to drift apart.
   */
  function run(
    recruit: AdminRecruit,
    action: (
      prev: ActionResult<never> | null,
      formData: FormData,
    ) => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setActing(recruit.id);
    startTransition(async () => {
      const form = new FormData();
      form.set("recruitId", recruit.id);
      const result = await action(null, form);
      setActing(null);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível concluir.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Tabs with counts: the number is what tells an admin whether opening a tab is
          worth it, and it comes from the WHOLE list so switching never hides it. */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar candidaturas">
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/15 text-foreground font-medium"
                  : "border-input text-muted-foreground hover:border-muted-foreground/40",
              )}
            >
              {option.label}
              <span
                className={cn(
                  "ml-1.5 font-mono text-xs tabular-nums",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {counts[option.value]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          <p className="text-foreground font-medium">
            {recruits.length === 0
              ? "Nenhuma candidatura ainda"
              : `Nenhuma candidatura ${FILTERS.find((f) => f.value === filter)!.label.toLowerCase()}`}
          </p>
          {recruits.length === 0 ? (
            <p className="mt-1">
              O formulário está em{" "}
              <Link href="/candidatar" className="text-primary underline">
                /candidatar
              </Link>
              . Divulgue o link e as candidaturas aparecem aqui.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((recruit) => {
          const status = STATUS_LABEL[recruit.status];
          const busy = pending && acting === recruit.id;
          const isPending = recruit.status === "pending";

          return (
            <article
              key={recruit.id}
              className={cn(
                "bg-card space-y-4 rounded-lg border p-4",
                // A resolved card stays readable but stops competing for attention: the
                // queue is what is pending, the rest is history.
                !isPending && "opacity-70",
              )}
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading truncate text-lg font-bold">{recruit.nickname}</h2>
                    <PlatformIcon platform={recruit.platform} platformId={null} />
                  </div>
                  <p className="text-muted-foreground truncate text-sm">{recruit.realName}</p>
                </div>
                <Badge variant="outline" className={cn("shrink-0", status.className)}>
                  {status.text}
                </Badge>
              </header>

              {/* THE DUPLICATE WARNING, above the facts: it changes whether the buttons
                below should be pressed at all, so reading it after them would be too
                late. */}
              {recruit.existingMemberId && isPending ? (
                <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Já existe um membro com esse nome da EA.{" "}
                    <Link
                      href={`/membros/${recruit.existingMemberId}`}
                      className="underline"
                      target="_blank"
                    >
                      Ver o membro
                    </Link>
                    . Aprovar cria um segundo cadastro para a mesma conta.
                  </span>
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {/* First, and highlighted: the field the whole feature exists to collect. */}
                <Fact
                  icon={UserRoundSearch}
                  label="Nome de exibição da EA"
                  value={recruit.declaredEaName}
                  className="text-primary"
                />
                <Fact icon={Phone} label="WhatsApp" value={recruit.whatsapp} />
                <Fact icon={Gamepad2} label="Plataforma" value={PLATFORM_LABEL[recruit.platform]} />
                <Fact icon={CalendarDays} label="Idade" value={AGE_LABEL[recruit.ageBracket]} />
                <Fact
                  icon={BadgeCheck}
                  label="Tem o jogo"
                  value={recruit.hasGame ? "Sim" : "Não, só Battle Royale"}
                  className={recruit.hasGame ? undefined : "text-amber-300"}
                />
                <Fact
                  icon={MessageCircle}
                  label="Discord"
                  value={recruit.discordHandle ?? "não informou"}
                  className={recruit.discordHandle ? undefined : "text-muted-foreground"}
                />
                {recruit.declaredEaUsername ? (
                  <Fact
                    icon={UserRoundSearch}
                    label="Username da EA"
                    value={recruit.declaredEaUsername}
                  />
                ) : null}
                {recruit.referral ? (
                  <Fact icon={CircleSlash} label="Como conheceu" value={recruit.referral} />
                ) : null}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <span className="text-muted-foreground text-xs">
                  {now === null ? "" : `Enviada ${timeAgo(recruit.createdAt, now)}`}
                </span>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(
                          recruit,
                          rejectRecruitAction,
                          `Candidatura de ${recruit.nickname} recusada.`,
                        )
                      }
                      disabled={busy}
                      className="text-muted-foreground hover:text-destructive gap-1.5"
                    >
                      <X className="size-3.5" />
                      Recusar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          recruit,
                          approveRecruitAction,
                          `${recruit.nickname} entrou no roster. Gere o convite na aba Membros.`,
                        )
                      }
                      disabled={busy}
                      className="gap-1.5"
                    >
                      <Check className="size-3.5" />
                      {busy ? "Aprovando..." : "Aprovar"}
                    </Button>
                  </div>
                ) : recruit.status === "rejected" ? (
                  /* A rejection is not final. "Volte quando comprar o jogo" is a real
                   answer, and when they come back the answers they already gave are the
                   ones worth keeping — so re-opening beats asking them to fill the form
                   again. Deleting is for the rows that should not have existed: spam, a
                   duplicate, a test. */
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(
                          recruit,
                          deleteRecruitAction,
                          `Candidatura de ${recruit.nickname} excluída.`,
                        )
                      }
                      disabled={busy}
                      title={`Excluir a candidatura de ${recruit.nickname} de vez`}
                      className="text-muted-foreground hover:text-destructive gap-1.5"
                    >
                      <Trash2 className="size-3.5" />
                      Excluir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        run(
                          recruit,
                          reopenRecruitAction,
                          `Candidatura de ${recruit.nickname} voltou para a fila.`,
                        )
                      }
                      disabled={busy}
                      className="gap-1.5"
                    >
                      <RotateCcw className="size-3.5" />
                      {busy ? "Retomando..." : "Retomar"}
                    </Button>
                  </div>
                ) : recruit.memberId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/membros/${recruit.memberId}`}>Ver membro</Link>
                  </Button>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

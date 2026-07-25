"use client";

// Grants and revokes a member's medals in one place.
//
// The dialog stays OPEN after a write on purpose: awarding is usually done in
// batches ("this squad earned the event medal"), and closing after each grant
// would make the admin reopen it every time. The parent refreshes the server data
// so the lists below reflect the change.

import { Medal, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DotsLoader } from "@/components/dots-loader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MedalEmblem } from "@/features/clan/components/medal-emblem";
import { MedalTierChip } from "@/features/clan/components/medal-tier-chip";
import { TIER_LABEL } from "@/features/clan/lib/format";
import { cn } from "@/lib/utils";

import {
  awardMedalAction,
  revokeMedalAction,
} from "@/features/admin/lib/award-actions";
import type { AdminMedal, AdminMember } from "@/features/admin/lib/queries";

interface MemberMedalsDialogProps {
  member: AdminMember;
  /** The whole catalog: what is not awarded yet becomes grantable. */
  medals: AdminMedal[];
  /** Refreshes the server data so the dialog shows the write it just made. */
  onChanged: () => void;
}

const selectClass = cn(
  "border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
);

// awardedAt is a timestamptz serialized as ISO by the query; show just the day.
function formatAwardedDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function MemberMedalsDialog({
  member,
  medals,
  onChanged,
}: MemberMedalsDialogProps) {
  const [open, setOpen] = useState(false);
  const [awardPending, startAward] = useTransition();
  // Revoking tracks WHICH medal is going, not just "something is going": the
  // spinner belongs on the card the admin clicked, and the other cards stay usable.
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startRevoke] = useTransition();
  // Remounts the grant form after a success, which clears the note and puts the
  // select back on the first remaining medal.
  const [formKey, setFormKey] = useState(0);

  const byId = new Map(medals.map((medal) => [medal.id, medal]));
  // A medal deleted between the page render and now would leave a dangling award;
  // filtering keeps the list honest instead of rendering a blank row.
  const awarded = member.awards.flatMap((award) => {
    const medal = byId.get(award.medalId);
    return medal ? [{ ...award, medal }] : [];
  });
  const awardedIds = new Set(awarded.map((a) => a.medalId));
  const available = medals.filter((medal) => !awardedIds.has(medal.id));

  function award(formData: FormData) {
    startAward(async () => {
      const result = await awardMedalAction(null, formData);
      if (result.ok) {
        toast.success("Medalha concedida.");
        setFormKey((key) => key + 1);
        onChanged();
        return;
      }
      toast.error(result.error);
    });
  }

  // A click handler instead of a <form action>: React wraps form actions in a
  // transition, and state set inside a transition is only committed when the
  // transition ends — the per-card spinner would appear exactly when it is no
  // longer needed. A discrete click event commits right away.
  function revoke(medalId: string) {
    setRevokingId(medalId);

    const formData = new FormData();
    formData.set("memberId", member.id);
    formData.set("medalId", medalId);

    startRevoke(async () => {
      const result = await revokeMedalAction(null, formData);
      if (result.ok) {
        toast.success("Medalha removida.");
        onChanged();
      } else {
        toast.error(result.error);
      }
      // Cleared either way: on failure the card must go back to being clickable.
      setRevokingId(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // Fixed width with the counter in its own slot: a member with medals must
          // not render a wider button than one without, or the rows stop lining up.
          className="w-32 justify-start gap-1.5"
          aria-label={`Medalhas de ${member.nickname}`}
        >
          <Medal className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Medalhas</span>
          <span
            className={cn(
              "bg-secondary ml-auto rounded px-1.5 text-xs tabular-nums",
              member.awards.length === 0 && "invisible",
            )}
          >
            {member.awards.length}
          </span>
        </Button>
      </DialogTrigger>

      {/* Wider than the default so the medal name, date and note fit on one line. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Medalhas de {member.nickname}</DialogTitle>
          <DialogDescription>
            Conceder ou remover aparece no catálogo e no perfil do membro
            imediatamente.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Conquistadas ({awarded.length})
          </h3>

          {/* Bounded height, vertical scroll: rows stack, long lists scroll inside
              the box instead of pushing the grant form off screen, and the box keeps
              its size when the member has one medal or fifteen. */}
          <div className="max-h-64 min-h-28 overflow-y-auto rounded-lg border">
            {awarded.length === 0 ? (
              <p className="text-muted-foreground flex h-28 items-center justify-center text-center text-sm">
                Nenhuma medalha ainda.
              </p>
            ) : (
              <ul className="divide-y">
                {awarded.map((award) => {
                  const revoking = revokingId === award.medalId;
                  return (
                    <li
                      key={award.medalId}
                      className={cn(
                        "flex items-center gap-3 p-3",
                        revoking && "opacity-60",
                      )}
                    >
                      <MedalEmblem
                        name={award.medal.name}
                        tier={award.medal.tier}
                        imageUrl={award.medal.imageUrl}
                        icon={award.medal.icon}
                        size="xs"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="font-heading flex items-center gap-2 truncate font-semibold">
                          {award.medal.name}
                          <MedalTierChip tier={award.medal.tier} />
                        </p>
                        <p
                          title={award.note ?? undefined}
                          className="text-muted-foreground truncate text-xs"
                        >
                          {formatAwardedDate(award.awardedAt)}
                          {award.note ? ` · ${award.note}` : ""}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => revoke(award.medalId)}
                        // Only this row locks: removing one medal must not block
                        // removing another.
                        disabled={revoking}
                        className="text-destructive hover:text-destructive h-7 shrink-0 gap-1.5 px-2 text-xs"
                        aria-label={`Remover ${award.medal.name}`}
                      >
                        {revoking ? (
                          <DotsLoader size="sm" label="Removendo" />
                        ) : (
                          <>
                            <Trash2 className="size-3.5" />
                            Remover
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Conceder
          </h3>

          {medals.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Nenhuma medalha no catálogo. Crie uma em Medalhas primeiro.
            </p>
          ) : available.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Este membro já tem todas as medalhas do catálogo.
            </p>
          ) : (
            <form key={formKey} action={award} className="space-y-3">
              <input type="hidden" name="memberId" value={member.id} />

              <div>
                <Label htmlFor={`medalId-${member.id}`}>Medalha</Label>
                <select
                  id={`medalId-${member.id}`}
                  name="medalId"
                  className={selectClass}
                  required
                >
                  {available.map((medal) => (
                    <option key={medal.id} value={medal.id}>
                      {medal.name} · {TIER_LABEL[medal.tier]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor={`note-${member.id}`}>Nota (opcional)</Label>
                <Input
                  id={`note-${member.id}`}
                  name="note"
                  maxLength={140}
                  autoComplete="off"
                  placeholder="Ex.: 24 kills sem morrer no evento de sábado"
                  className="mt-1.5"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Registro interno do painel. Não aparece na vitrine.
                </p>
              </div>

              <Button type="submit" disabled={awardPending} className="w-full">
                {awardPending ? "Concedendo..." : "Conceder medalha"}
              </Button>
            </form>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

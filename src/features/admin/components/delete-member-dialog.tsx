"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteMemberAction } from "../lib/actions";
import type { AdminMember } from "../lib/queries";

interface DeleteMemberDialogProps {
  member: AdminMember;
  onDeleted: () => void;
}

/**
 * Deleting a member, behind a confirmation proportional to the damage.
 *
 * THE DIALOG IS NOT THE GUARD — the action re-checks the typed nickname against the
 * database, because a confirmation living in the client is one a crafted POST skips
 * (see deleteMemberAction). What this is for is making an accident impossible for the
 * person who does have permission: an admin clicking through the panel at speed
 * cannot destroy a season by hitting the wrong row.
 *
 * Three things make that true, and each is deliberate:
 *
 *  - The counts are SPECIFIC. "Isso apaga o membro" is a warning nobody reads;
 *    "apaga 412 leituras de stats e 3 medalhas" is a number that stops a hand.
 *  - The nickname has to be TYPED, not just clicked. It is the cheapest known way to
 *    force the eyes to the row they are actually on.
 *  - The destructive button stays disabled until it matches, so the dangerous control
 *    is unreachable while the confirmation is wrong.
 *
 * It also names the reversible alternative, because most of the time that is what the
 * admin actually wants: a member who left should be deactivated, which takes them off
 * the vitrine and the ranking while keeping the history their seasons are made of.
 */
export function DeleteMemberDialog({ member, onDeleted }: DeleteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = confirmation.trim() === member.nickname;
  const { snapshots, events, medals } = member.history;

  function close(next: boolean) {
    setOpen(next);
    // Reset on close, so reopening never starts with a confirmation already typed for
    // a different row.
    if (!next) setConfirmation("");
  }

  function submit() {
    startTransition(async () => {
      const form = new FormData();
      form.set("memberId", member.id);
      form.set("confirmation", confirmation.trim());
      const result = await deleteMemberAction(null, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${member.nickname} foi excluído.`);
      close(false);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          // Same size as Editar beside it: the pair has to read as one control group.
          size="icon-sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={`Excluir ${member.nickname} permanentemente`}
          aria-label={`Excluir ${member.nickname}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5 shrink-0" aria-hidden />
            Excluir {member.nickname}
          </DialogTitle>
          <DialogDescription>
            Isso é permanente e não tem como desfazer. Não existe backup para restaurar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-destructive/40 bg-destructive/5 space-y-1.5 rounded-md border p-3 text-sm">
            <p className="font-semibold">Vai embora junto:</p>
            <ul className="text-muted-foreground list-inside list-disc space-y-0.5">
              {/* Numbers, not categories: this is the line that turns a warning into a
                  decision. Plural handled inline so "1 leituras" never shows up. */}
              <li>
                <span className="text-foreground font-mono font-semibold tabular-nums">
                  {snapshots}
                </span>{" "}
                {snapshots === 1 ? "leitura de stats" : "leituras de stats"}, que é o histórico
                usado pelo ranking
              </li>
              <li>
                <span className="text-foreground font-mono font-semibold tabular-nums">
                  {medals}
                </span>{" "}
                {medals === 1 ? "medalha concedida" : "medalhas concedidas"}
              </li>
              <li>
                <span className="text-foreground font-mono font-semibold tabular-nums">
                  {events}
                </span>{" "}
                {events === 1 ? "evento" : "eventos"} de sessão e promoção
              </li>
              <li>o histórico de tentativas de identificação da conta EA</li>
            </ul>
            {member.hasAccount ? (
              <p className="mt-2 border-t pt-2 text-xs">
                O login do Discord dele <strong className="text-foreground">não é apagado</strong>,
                só fica desvinculado.
              </p>
            ) : null}
          </div>

          {/* The alternative, stated where the decision is being made rather than in
              documentation nobody opens at this moment. */}
          <p className="text-muted-foreground text-xs leading-relaxed">
            Se o membro só saiu do clã, o certo é <strong>desativar</strong> pelo botão Editar: some
            da vitrine e do ranking, e o histórico fica.
          </p>

          <div className="space-y-2">
            <Label htmlFor="delete-confirmation">
              Digite{" "}
              <span className="text-foreground font-mono font-semibold">{member.nickname}</span>{" "}
              para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder={member.nickname}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            // Unreachable until the nickname matches: the dangerous control simply
            // does not exist while the confirmation is wrong.
            disabled={!matches || pending}
          >
            {pending ? "Excluindo..." : "Excluir permanentemente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

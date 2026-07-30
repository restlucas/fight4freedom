"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

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

import { createInviteAction } from "@/features/admin/lib/actions";
import type { AdminMember } from "@/features/admin/lib/queries";
import type { ActionResult } from "@/features/admin/lib/schemas";

interface InviteDialogProps {
  member: AdminMember;
}

/**
 * Generates the invite link. The token is shown exactly once, right here: the
 * database only keeps its hash, so it cannot be recovered later — a new link has
 * to be generated instead.
 */
export function InviteDialog({ member }: InviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ActionResult<{ url: string }> | null, FormData>(
    createInviteAction,
    null,
  );

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const url = state?.ok ? state.data.url : null;

  async function copy() {
    if (!url || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Icon-only and 32px, matching Editar and Excluir: the Ações column is under
            `table-fixed`, so its width is a hard budget and a labelled button here was
            what pushed the group past the cell. `outline` keeps it visually distinct as
            the one action that grants access. */}
        <Button
          // `ghost`, like the other three in the row: four bordered boxes per line
          // was a toolbar competing with the data across 99 rows.
          variant="ghost"
          size="icon-sm"
          title={`Gerar convite para ${member.nickname}`}
          aria-label={`Gerar convite para ${member.nickname}`}
        >
          <KeyRound className="size-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convite para {member.nickname}</DialogTitle>
          <DialogDescription>
            Gere o link e envie na DM do Discord. Ele vale por 7 dias, é de uso único e quem abrir o
            link vira este membro — trate como senha e não poste em canal público.
          </DialogDescription>
        </DialogHeader>

        {url ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Guarde agora: o link não pode ser recuperado depois, apenas regerado.
            </p>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="memberId" value={member.id} />

            <div>
              <Label htmlFor={`discordUsername-${member.id}`}>Username do Discord</Label>
              <Input
                id={`discordUsername-${member.id}`}
                name="discordUsername"
                placeholder="opcional, só para você lembrar"
                maxLength={64}
                autoComplete="off"
                className="mt-1.5"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Etiqueta apenas. A identidade vem verificada do Discord no login.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="grantsAdmin" className="accent-primary mt-0.5 size-4" />
              <span>
                Conceder acesso administrativo
                <span className="text-muted-foreground block text-xs">
                  Este é o único jeito de criar um novo admin.
                </span>
              </span>
            </label>

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Gerando..." : "Gerar link de convite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MedalEmblem } from "@/features/clan/components/medal-emblem";
import { MedalTierChip } from "@/features/clan/components/medal-tier-chip";

import { deleteMedalAction } from "@/features/admin/lib/medal-actions";
import type { AdminMedal } from "@/features/admin/lib/queries";
import { MedalForm } from "./medal-form";

interface MedalsManagerProps {
  medals: AdminMedal[];
  storageEnabled: boolean;
}

function DeleteDialog({
  medal,
  onDone,
}: {
  medal: AdminMedal;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Calls the action directly instead of useActionState + an effect: the result
  // is handled where it arrives, so closing the dialog is not a setState inside
  // an effect (which the React Compiler rightly rejects).
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await deleteMedalAction(null, formData);
      if (result.ok) {
        toast.success("Medalha excluída.");
        setOpen(false);
        onDone();
        return;
      }
      toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Excluir ${medal.name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {medal.name}?</DialogTitle>
          <DialogDescription>
            {medal.holders > 0
              ? `${medal.holders} ${medal.holders === 1 ? "membro perderá" : "membros perderão"} esta medalha. A arte também é removida. Não há como desfazer.`
              : "Ninguém conquistou esta medalha ainda. A arte também é removida."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit}>
          <input type="hidden" name="medalId" value={medal.id} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MedalsManager({ medals, storageEnabled }: MedalsManagerProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMedal | null>(null);

  function done() {
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nova medalha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova medalha</DialogTitle>
              <DialogDescription>
                Ela aparece no catálogo imediatamente. A concessão a membros é
                feita depois.
              </DialogDescription>
            </DialogHeader>
            <MedalForm storageEnabled={storageEnabled} onDone={done} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medalha</TableHead>
              <TableHead className="hidden md:table-cell">
                Como conquistar
              </TableHead>
              <TableHead>Conquistas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-24 text-center"
                >
                  Nenhuma medalha cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              medals.map((medal) => (
                <TableRow key={medal.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MedalEmblem
                        name={medal.name}
                        tier={medal.tier}
                        imageUrl={medal.imageUrl}
                        icon={medal.icon}
                        size="xs"
                      />
                      <div className="min-w-0">
                        <p className="font-heading truncate font-semibold">
                          {medal.name}
                        </p>
                        <MedalTierChip tier={medal.tier} />
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <span className="text-muted-foreground line-clamp-2 text-sm">
                      {medal.criteria ?? "—"}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-sm tabular-nums">
                      {medal.holders}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(medal)}
                        className="gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                      <DeleteDialog medal={medal} onDone={done} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {editing?.name}</DialogTitle>
            <DialogDescription>
              Alterações aparecem no catálogo imediatamente.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <MedalForm
              medal={editing}
              storageEnabled={storageEnabled}
              onDone={done}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

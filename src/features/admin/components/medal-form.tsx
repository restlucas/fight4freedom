"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MedalEmblem } from "@/features/clan/components/medal-emblem";
import { TIER_LABEL } from "@/features/clan/lib/format";
import { ACCEPTED_IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@/lib/images";
import { cn } from "@/lib/utils";

import { createMedalAction, updateMedalAction } from "@/features/admin/lib/medal-actions";
import type { AdminMedal } from "@/features/admin/lib/queries";
import { MEDAL_ICONS, MEDAL_TIERS } from "@/features/admin/lib/schemas";

interface MedalFormProps {
  medal?: AdminMedal;
  /** False when SUPABASE_SERVICE_ROLE_KEY is absent: the rest still works. */
  storageEnabled: boolean;
  onDone: () => void;
}

const selectClass = cn(
  "border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
);

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-destructive mt-1 text-xs">{messages[0]}</p>;
}

export function MedalForm({ medal, storageEnabled, onDone }: MedalFormProps) {
  const editing = Boolean(medal);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();

  // Live preview, so the admin sees the emblem they are creating.
  const [tier, setTier] = useState(medal?.tier ?? "common");
  const [icon, setIcon] = useState(medal?.icon ?? "crosshair");
  const [name, setName] = useState(medal?.name ?? "");
  const [pickedArt, setPickedArt] = useState<string | null>(null);

  // next/image marks blob: URLs unoptimized on its own, so the local file renders
  // without a round trip to the optimizer.
  function pickArt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPickedArt(file ? URL.createObjectURL(file) : null);
  }

  // Frees the previous blob when the pick changes and on unmount.
  useEffect(() => {
    if (!pickedArt) return;
    return () => URL.revokeObjectURL(pickedArt);
  }, [pickedArt]);

  // What the emblem shows: the file just picked wins over the stored art, which
  // wins over the icon.
  const previewArt = pickedArt ?? medal?.imageUrl ?? null;

  // The result is handled where it arrives, NOT in an effect keyed on the action
  // state. With `onDone` in an effect's dependency list the toast fired twice: the
  // parent re-renders after onDone (router.refresh + closing the dialog), Radix
  // keeps the content mounted through the close animation, and the fresh `onDone`
  // identity re-ran the effect with the same successful state.
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = editing
        ? await updateMedalAction(null, formData)
        : await createMedalAction(null, formData);

      if (result.ok) {
        toast.success(editing ? "Medalha atualizada." : "Medalha criada.");
        onDone();
        return;
      }

      setErrors(result.fieldErrors);
      // Field errors render next to the inputs; anything else needs the toast.
      if (!result.fieldErrors) toast.error(result.error);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      {medal ? <input type="hidden" name="medalId" value={medal.id} /> : null}

      <div className="flex flex-col items-center gap-2">
        <MedalEmblem
          name={name || "Prévia"}
          tier={tier}
          imageUrl={previewArt}
          icon={icon}
          size="lg"
        />
        <p className="text-muted-foreground text-center text-xs">
          Prévia do emblema. A arte enviada substitui o ícone.
        </p>
      </div>

      <div>
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={24}
          autoComplete="off"
          className="mt-1.5"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Até 24 caracteres: o card do catálogo mostra o nome em uma linha.
        </p>
        <FieldError messages={errors?.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tier">Raridade</Label>
          <select
            id="tier"
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
            className={selectClass}
          >
            {MEDAL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          <FieldError messages={errors?.tier} />
        </div>

        <div>
          <Label htmlFor="icon">Ícone (fallback)</Label>
          <select
            id="icon"
            name="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className={selectClass}
          >
            {MEDAL_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <FieldError messages={errors?.icon} />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          name="description"
          defaultValue={medal?.description ?? ""}
          maxLength={280}
          autoComplete="off"
          placeholder="O que a medalha representa"
          className="mt-1.5"
        />
        <FieldError messages={errors?.description} />
      </div>

      <div>
        <Label htmlFor="criteria">Como conquistar</Label>
        <Input
          id="criteria"
          name="criteria"
          defaultValue={medal?.criteria ?? ""}
          maxLength={280}
          autoComplete="off"
          placeholder="Ex.: 20 kills sem morrer em uma partida"
          className="mt-1.5"
        />
        <FieldError messages={errors?.criteria} />
      </div>

      <div>
        <Label htmlFor="image">Arte</Label>
        <Input
          id="image"
          name="image"
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          disabled={!storageEnabled}
          onChange={pickArt}
          className="mt-1.5 file:mr-3 file:text-xs"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          {storageEnabled
            ? `Quadrada, fundo transparente. PNG, JPEG, WebP ou AVIF até ${MAX_IMAGE_BYTES / 1024} KB. Convertemos para WebP 512x512.`
            : "Upload indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada."}
        </p>
        <FieldError messages={errors?.image} />

        {medal?.imageUrl ? (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeImage" className="accent-primary size-4" />
            Remover a arte atual e voltar ao ícone
          </label>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : editing ? "Salvar" : "Criar medalha"}
        </Button>
      </DialogFooter>
    </form>
  );
}

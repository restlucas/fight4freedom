"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_LABEL, ROLE_LABEL } from "@/features/clan/lib/format";
import { cn } from "@/lib/utils";

import {
  createMemberAction,
  updateMemberAction,
} from "@/features/admin/lib/actions";
import type { AdminMember } from "@/features/admin/lib/queries";
import { MEMBER_ROLES, PLATFORMS, type ActionResult } from "@/features/admin/lib/schemas";

interface MemberFormProps {
  /** Absent for a new member. */
  member?: AdminMember;
  onDone: () => void;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-destructive mt-1 text-xs">{messages[0]}</p>;
}

/**
 * Server Action + useActionState instead of react-hook-form: validation has to
 * run on the server anyway (a crafted POST bypasses any client check), so a
 * second copy of the rules in the browser would buy UX only. The form also works
 * without JavaScript this way.
 */
export function MemberForm({ member, onDone }: MemberFormProps) {
  const editing = Boolean(member);
  const [state, action, pending] = useActionState<
    ActionResult<{ memberId: string }> | null,
    FormData
  >(editing ? updateMemberAction : createMemberAction, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(editing ? "Membro atualizado." : "Membro cadastrado.");
      onDone();
    } else if (state && !state.ok && !state.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, editing, onDone]);

  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4">
      {member ? (
        <input type="hidden" name="memberId" value={member.id} />
      ) : null}

      <div>
        <Label htmlFor="nickname">Nick</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={member?.nickname}
          required
          maxLength={32}
          autoComplete="off"
          className="mt-1.5"
        />
        <FieldError messages={errors?.nickname} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="platform">Plataforma</Label>
          <select
            id="platform"
            name="platform"
            defaultValue={member?.platform ?? "ea"}
            className={cn(
              "border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            )}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
          <FieldError messages={errors?.platform} />
        </div>

        <div>
          <Label htmlFor="platformId">Id na plataforma</Label>
          <Input
            id="platformId"
            name="platformId"
            defaultValue={member?.platformId ?? ""}
            maxLength={80}
            autoComplete="off"
            placeholder="opcional"
            className="mt-1.5"
          />
          <FieldError messages={errors?.platformId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="role">Cargo no clã</Label>
          <select
            id="role"
            name="role"
            defaultValue={member?.role ?? "member"}
            className={cn(
              "border-input bg-background mt-1.5 h-9 w-full rounded-md border px-3 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            )}
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {/* The cargo is cosmetic; panel access comes from the invite. */}
          <p className="text-muted-foreground mt-1 text-xs">
            Só exibição. Não concede acesso ao painel.
          </p>
        </div>

        <div>
          <Label htmlFor="trackerHandle">Handle no tracker</Label>
          <Input
            id="trackerHandle"
            name="trackerHandle"
            defaultValue={member?.trackerHandle ?? ""}
            maxLength={80}
            autoComplete="off"
            placeholder="opcional"
            className="mt-1.5"
          />
          <FieldError messages={errors?.trackerHandle} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member?.active ?? true}
          className="accent-primary size-4"
        />
        Ativo (aparece na vitrine)
      </label>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

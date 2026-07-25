"use client";

import { Pencil, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformIcon } from "@/features/clan/components/platform-icon";
import {
  memberInitials,
  normalizeSearch,
  ROLE_LABEL,
} from "@/features/clan/lib/format";

import type { AdminMember } from "@/features/admin/lib/queries";
import { InviteDialog } from "./invite-dialog";
import { MemberForm } from "./member-form";

interface MembersTableProps {
  members: AdminMember[];
}

export function MembersTable({ members }: MembersTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  const q = normalizeSearch(query);
  const visible = q
    ? members.filter((m) => normalizeSearch(m.nickname).includes(q))
    : members;

  // The table is server-rendered; refresh after a write so it reflects the change.
  function done() {
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar membro..."
          aria-label="Buscar membro"
          className="max-w-xs"
        />

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Novo membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo membro</DialogTitle>
              <DialogDescription>
                Cadastre o membro e depois gere o convite para ele vincular a
                conta do Discord.
              </DialogDescription>
            </DialogHeader>
            <MemberForm onDone={done} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead className="hidden sm:table-cell">Cargo</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-24 text-center"
                >
                  Nenhum membro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((member) => (
                <TableRow key={member.id} className={member.active ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-md">
                        <AvatarImage
                          src={member.avatarUrl ?? "/member-default.png"}
                          alt=""
                        />
                        <AvatarFallback className="font-heading rounded-none text-xs">
                          {memberInitials(member.nickname)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-heading flex items-center gap-1.5 truncate font-semibold">
                          {member.nickname}
                          {member.isAdmin ? (
                            <ShieldCheck
                              className="text-primary size-3.5"
                              aria-label="Administrador"
                            />
                          ) : null}
                        </p>
                        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <PlatformIcon
                            platform={member.platform}
                            platformId={member.platformId}
                            className="size-3.5"
                          />
                          {member.platformId ?? "sem id"}
                          {member.active ? null : " · inativo"}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    <span className="text-muted-foreground text-sm">
                      {ROLE_LABEL[member.role]}
                    </span>
                  </TableCell>

                  <TableCell>
                    {member.hasAccount ? (
                      <Badge variant="secondary" className="gap-1">
                        Vinculada
                      </Badge>
                    ) : member.pendingInvite ? (
                      <Badge variant="outline" className="gap-1">
                        Convite pendente
                        {member.pendingInvite.grantsAdmin ? " (admin)" : ""}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        Sem conta
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {member.hasAccount ? null : <InviteDialog member={member} />}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(member)}
                        className="gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Editar {editing?.nickname}
            </DialogTitle>
            <DialogDescription>
              Alterações aparecem na vitrine imediatamente.
            </DialogDescription>
          </DialogHeader>
          {editing ? <MemberForm member={editing} onDone={done} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
